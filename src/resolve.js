/**
 * Comprobar una respuesta del directorio (§4 del diseño). Lo hace el proxio antes de cachear,
 * y lo puede hacer cualquier cliente.
 *
 * Dos formas de respuesta:
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
import { nameHash } from './name.js'
import { verifyDirectorySigned } from './verify.js'
import { GRACE_MS } from './constants.js'

const enc = new TextEncoder()

export async function verifyResolution ({ name, response, policy, now }) {
  const h = await nameHash(name)
  let rec
  if (response?.entry) {
    const head = await verifyDirectorySigned(response.head, { policy, kind: 'head', now })
    const { entry, inclusion } = response
    if (entry.h !== h) fail('bad-resolution', 'entry is for another name')
    if (entry.seq !== head.firstSeq + inclusion.index) fail('bad-resolution', 'entry seq does not match its place')
    const ok = await verifyInclusion({ index: inclusion.index, size: head.size, leaf: await entryLeaf(entry), proof: inclusion.proof, root: head.root })
    if (!ok) fail('bad-resolution', 'entry not in the signed head')
    if (entry.op === 'release' || entry.op === 'expire') throw new NamesError('name-not-found', 'name was released or expired')
    rec = { account: entry.account, exp: entry.exp, free: !!entry.free, ts: head.ts }
  } else if (response?.checkpoint) {
    const cp = await verifyDirectorySigned(response.checkpoint, { policy, kind: 'checkpoint', now })
    const s = response.state
    if (s?.leaf?.h !== h) fail('bad-resolution', 'state leaf is for another name')
    const leaf = await leafHash(enc.encode(canonicalStringify({ h, account: s.leaf.account, exp: s.leaf.exp, free: s.leaf.free, held: !!s.leaf.held })))
    const ok = await verifyInclusion({ index: s.index, size: s.size, leaf, proof: s.proof, root: cp.stateRoot })
    if (!ok) fail('bad-resolution', 'name not in the signed checkpoint')
    if (s.leaf.held) throw new NamesError('name-not-found', 'name expired and held for its account')
    rec = { account: s.leaf.account, exp: s.leaf.exp, free: !!s.leaf.free, ts: cp.ts }
  } else {
    fail('bad-resolution', 'response has neither checkpoint nor entry')
  }
  // Vencido no resuelve: ni un pagado en su gracia (solo se puede renovar) ni un gratuito sin
  // señal de vida (su cuenta lo recupera al volver).
  if (now > rec.exp) {
    throw new NamesError('name-expired', rec.free ? 'free name expired for inactivity' : now > rec.exp + GRACE_MS ? 'name expired' : 'name expired (in grace period)')
  }
  return rec
}
