/**
 * Comprobar una respuesta del directorio (§4 del diseño). Lo hace el proxio antes de cachear,
 * y lo puede hacer cualquier cliente.
 *
 * La respuesta dice a qué nombre contesta (`name`, completo) y, si se preguntó por un aparato,
 * cuál (`sub`). Viene de una de dos formas:
 *   · el nombre está en el ÚLTIMO CORTE: `{ checkpoint, state: { index, size, leaf, proof } }`;
 *   · el nombre cambió después: `{ head, entry, inclusion: { index, size, proof } }`.
 *
 * Que un nombre NO exista no se puede probar con esto: el directorio puede negar (lo dice el
 * diseño). Lo que no puede es inventar a quién apunta sin que la firma o la prueba fallen.
 */
import { canonicalStringify } from './hash.js'
import { NamesError, fail } from './errors.js'
import { leafHash, verifyInclusion } from './merkle.js'
import { entryLeaf } from './log.js'
import { addressCandidates, nameHash } from './name.js'
import { stateLeafData } from './state.js'
import { verifyDirectorySigned } from './verify.js'
import { GRACE_MS } from './constants.js'

const enc = new TextEncoder()

/**
 * Devuelve `{ name, sub, account, device, exp, free, kind }`: `account` es la huella de la
 * cuenta y `device` la del aparato (o `null` si no se preguntó por uno). Quien lo usa
 * comprueba después el acta de esa cuenta: esto solo dice a quién apunta el nombre.
 */
export async function verifyResolution ({ address, response, policy, now }) {
  const candidates = addressCandidates(address)
  const sub = response?.sub ?? null
  if (!candidates.some((c) => c.name === response?.name && c.sub === sub)) fail('bad-resolution', 'response is for another name')
  const h = await nameHash(response.name)
  let rec
  if (response.entry) {
    const head = await verifyDirectorySigned(response.head, { policy, kind: 'head', now })
    const { entry, inclusion } = response
    if (entry.h !== h) fail('bad-resolution', 'entry is for another name')
    if (entry.seq !== head.firstSeq + inclusion.index) fail('bad-resolution', 'entry seq does not match its place')
    const ok = await verifyInclusion({ index: inclusion.index, size: head.size, leaf: await entryLeaf(entry), proof: inclusion.proof, root: head.root })
    if (!ok) fail('bad-resolution', 'entry not in the signed head')
    if (entry.op === 'release' || entry.op === 'expire') throw new NamesError('name-not-found', 'name was released or expired')
    // Una entrada solo trae los aparatos que ella misma cambia: para otro, hace falta el corte.
    if (sub !== null && !(entry.op === 'sub' && entry.sub === sub)) fail('bad-resolution', 'this entry does not say where that device is')
    rec = { account: entry.account, exp: entry.exp, free: !!entry.free, kind: entry.kind, subs: sub !== null && entry.device ? { [sub]: entry.device } : {} }
  } else if (response.checkpoint) {
    const cp = await verifyDirectorySigned(response.checkpoint, { policy, kind: 'checkpoint', now })
    const s = response.state
    if (s?.leaf?.h !== h) fail('bad-resolution', 'state leaf is for another name')
    const leaf = await leafHash(enc.encode(canonicalStringify(stateLeafData(h, s.leaf))))
    const ok = await verifyInclusion({ index: s.index, size: s.size, leaf, proof: s.proof, root: cp.stateRoot })
    if (!ok) fail('bad-resolution', 'name not in the signed checkpoint')
    if (s.leaf.held) throw new NamesError('name-not-found', 'name expired and held for its account')
    rec = { account: s.leaf.account, exp: s.leaf.exp, free: !!s.leaf.free, kind: s.leaf.kind, subs: s.leaf.subs || {} }
  } else {
    fail('bad-resolution', 'response has neither checkpoint nor entry')
  }
  // Vencido no resuelve: ni un pagado en su gracia (solo se puede renovar) ni un gratuito sin
  // señal de vida (su cuenta lo recupera al volver).
  if (now > rec.exp) {
    throw new NamesError('name-expired', rec.free ? 'free name expired for inactivity' : now > rec.exp + GRACE_MS ? 'name expired' : 'name expired (in grace period)')
  }
  const device = sub === null ? null : rec.subs[sub]
  if (sub !== null && !device) throw new NamesError('sub-not-found', 'no device with that name')
  return { name: response.name, sub, account: rec.account, device, exp: rec.exp, free: rec.free, kind: rec.kind }
}
