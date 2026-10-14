/**
 * El ESTADO vivo y las reglas que lo cambian (§3.1 del diseño).
 *
 * `applyEntry` es lo único que decide si una entrada vale. Lo usa el directorio antes de
 * escribirla y lo usan los testigos al repetir un tramo: si los dos aplican las mismas reglas
 * a las mismas entradas, sale el mismo estado, y eso es lo que se compara en cada corte.
 *
 * El tiempo de una entrada es su `ts`, no el reloj de quien la repite: así repetir un tramo
 * de hace un mes da lo mismo que dio entonces.
 */
import { FORMAT_V, YEAR_MS, GRACE_MS, INACTIVITY_MS, TOUCH_INTERVAL_MS, QUARANTINE_MS } from './constants.js'
import { NamesError, fail } from './errors.js'
import { canonicalStringify } from './hash.js'
import { leafHash, root, inclusionProof } from './merkle.js'
import { checkPolicy, verifySigned, verifyDirectorySigned } from './verify.js'

const enc = new TextEncoder()
const HEX64 = /^[0-9a-f]{64}$/

export const OPS = Object.freeze(['claim', 'claim-free', 'touch', 'renew', 'transfer', 'release', 'expire', 'seize'])

export function emptyState () {
  // names: h → { account, exp, free, held? }   ·   freeOf: cuenta → su h gratuito (vivo o guardado)
  // seen: nonces de peticiones y ids de recibos ya usados, con su caducidad (anti-repetición)
  return { names: new Map(), freeOf: new Map(), seen: new Map() }
}

export function cloneState (s) {
  return { names: new Map(s.names), freeOf: new Map(s.freeOf), seen: new Map(s.seen) }
}

/** Comprueba una petición firmada por una cuenta. La marca de usada se apunta en `marks`. */
async function request (state, marks, req, { ts, account, op, h, extra = {} }) {
  const v = await verifySigned(req, { now: ts, account })
  if (!v.ok) fail('bad-request-signature', `${op}: ${v.reason}`)
  const b = req.body
  if (b.v !== FORMAT_V) fail('bad-version', `${op}: request version ${b.v}`)
  if (b.op !== op) fail('request-mismatch', `${op}: request is for ${b.op}`)
  if (h !== undefined && b.h !== h) fail('request-mismatch', `${op}: request is for another name`)
  for (const [k, val] of Object.entries(extra)) if (b[k] !== val) fail('request-mismatch', `${op}: request ${k} differs`)
  if (!Number.isFinite(b.exp)) fail('bad-request', `${op}: request without exp`)
  if (typeof b.nonce !== 'string' || b.nonce.length < 16) fail('bad-request', `${op}: request without nonce`)
  if (state.seen.has('n:' + b.nonce) || marks.some(([k]) => k === 'n:' + b.nonce)) fail('replayed', `${op}: request already used`)
  marks.push(['n:' + b.nonce, b.exp])
  return v
}

/** Comprueba un recibo de pago del directorio y devuelve los años. */
async function receipt (state, marks, rcpt, { ts, policy }) {
  const b = await verifyDirectorySigned(rcpt, { policy, kind: 'receipt', now: ts })
  if (!Number.isInteger(b.years) || b.years < 1) fail('bad-receipt', 'receipt without years')
  if (typeof b.id !== 'string' || b.id.length < 16) fail('bad-receipt', 'receipt without id')
  if (!Number.isFinite(b.exp)) fail('bad-receipt', 'receipt without exp')
  if (state.seen.has('r:' + b.id)) fail('replayed', 'receipt already used')
  marks.push(['r:' + b.id, b.exp])
  return b.years
}

/**
 * El registro VIVO de un nombre. Un gratuito caducado sigue en el estado `held` (guardado para
 * su cuenta, §5.1 del diseño), pero no resuelve ni se opera: para lo demás, no existe.
 */
function needLive (state, h, ts) {
  const rec = state.names.get(h)
  if (!rec || rec.held) fail('name-not-found', 'name not found')
  if (rec.free && ts > rec.exp) fail('name-expired', 'free name expired for inactivity')
  return rec
}

/** ¿Lo puede tomar `account` ahora? Libre, o guardado y ya pasada su reserva, o guardado para ella. */
function takeable (state, h, ts, account) {
  const rec = state.names.get(h)
  if (!rec) return true
  if (rec.held) return ts > rec.exp || rec.account === account
  return false
}

/**
 * Aplica una entrada a `state` y devuelve el registro resultante del nombre, o `null` si el
 * nombre quedó libre. Lanza `NamesError` con su `code` si la entrada no vale, y entonces NO
 * toca el estado: primero se comprueba todo y solo al final se escribe.
 */
export async function applyEntry (state, entry, { policy }) {
  checkPolicy(policy)
  if (!entry || entry.v !== FORMAT_V) fail('bad-version', 'entry version')
  if (!OPS.includes(entry.op)) fail('bad-op', `unknown op ${entry?.op}`)
  if (!HEX64.test(entry.h)) fail('bad-entry', 'entry.h must be a sha-256 hex')
  const ts = entry.ts
  if (!Number.isFinite(ts)) fail('bad-entry', 'entry without ts')
  const reqs = Array.isArray(entry.reqs) ? entry.reqs : []

  const h = entry.h
  const marks = [] // [clave, caducidad] de lo usado, para no aceptarlo dos veces
  let next // el registro del nombre después de la entrada; null = libre
  let replacement = null // nombre gratuito nuevo para quien pierde el suyo por un `seize`
  let freeOf = null // [cuenta, h | null]: cambio en el índice de gratuitos
  // Si se toma un par guardado de otra cuenta (ya pasada su reserva), esa cuenta deja de tenerlo.
  const prior = state.names.get(h)
  const orphan = prior?.held && state.freeOf.get(prior.account) === h ? prior.account : null

  switch (entry.op) {
    case 'claim': {
      if (!takeable(state, h, ts, null)) fail('name-taken', 'name taken')
      await request(state, marks, reqs[0], { ts, account: entry.account, op: 'claim', h, extra: { account: entry.account } })
      const years = await receipt(state, marks, entry.receipt, { ts, policy })
      next = { account: entry.account, exp: ts + years * YEAR_MS, free: false }
      break
    }
    case 'claim-free': {
      // La cuenta pide «un nombre»; cuál, lo elige el directorio. Por eso la petición no lleva `h`.
      const own = state.freeOf.get(entry.account)
      const ownRec = own && state.names.get(own)?.account === entry.account ? state.names.get(own) : null
      if (ownRec && !ownRec.held) fail('already-has-free', 'account already has its free name')
      // Si su nombre caducado sigue guardado, recupera ESE: no se cambia de nombre dejando de usarlo.
      if (ownRec && ownRec.held && ts <= ownRec.exp && h !== own) fail('must-recover', 'the account must get back its held name')
      if (!takeable(state, h, ts, entry.account)) fail('name-taken', 'name taken')
      await request(state, marks, reqs[0], { ts, account: entry.account, op: 'claim-free', extra: { account: entry.account } })
      next = { account: entry.account, exp: ts + INACTIVITY_MS, free: true }
      freeOf = [entry.account, h]
      break
    }
    case 'touch': {
      // La señal de vida: la manda el pilar solo, firmada por un aparato de la cuenta.
      const rec = needLive(state, h, ts)
      if (!rec.free) fail('not-free', 'only a free name needs a sign of life')
      if (state.freeOf.get(rec.account) !== h) fail('bad-entry', 'not the free name of that account')
      if (ts - (rec.exp - INACTIVITY_MS) < TOUCH_INTERVAL_MS) fail('too-soon', 'a sign of life was recorded recently')
      await request(state, marks, reqs[0], { ts, account: rec.account, op: 'touch', extra: { account: rec.account } })
      next = { account: rec.account, exp: ts + INACTIVITY_MS, free: true }
      break
    }
    case 'renew': {
      const rec = needLive(state, h, ts)
      if (rec.free) fail('free-name-fixed', 'a free name is kept alive by use, not paid')
      if (ts > rec.exp + GRACE_MS) fail('name-expired', 'past the grace period: claim it again')
      // Vencido pero en gracia: solo el dueño. Antes de vencer, cualquiera puede pagarlo.
      if (ts > rec.exp) await request(state, marks, reqs[0], { ts, account: rec.account, op: 'renew', h })
      const years = await receipt(state, marks, entry.receipt, { ts, policy })
      next = { account: rec.account, exp: Math.max(rec.exp, ts) + years * YEAR_MS, free: false }
      break
    }
    case 'transfer': {
      const rec = needLive(state, h, ts)
      if (rec.free) fail('free-name-fixed', 'a free name cannot be transferred')
      if (ts > rec.exp) fail('name-expired', 'an expired name cannot be transferred')
      if (typeof entry.account !== 'string' || entry.account === rec.account) fail('bad-entry', 'transfer needs another account')
      await request(state, marks, reqs[0], { ts, account: rec.account, op: 'transfer', h, extra: { to: entry.account } })
      await request(state, marks, reqs[1], { ts, account: entry.account, op: 'accept', h, extra: { from: rec.account } })
      next = { account: entry.account, exp: rec.exp, free: false }
      break
    }
    case 'release': {
      const rec = needLive(state, h, ts)
      if (rec.free) fail('free-name-fixed', 'a free name cannot be released')
      await request(state, marks, reqs[0], { ts, account: rec.account, op: 'release', h })
      next = null
      break
    }
    case 'expire': {
      // No lleva firma: cualquiera la puede escribir, y solo entra si de verdad toca.
      const rec = state.names.get(h)
      if (!rec) fail('name-not-found', 'name not found')
      if (rec.held) {
        // Pasada la reserva, el par vuelve a quedar libre del todo.
        if (ts <= rec.exp) fail('not-expired', 'still held for its account')
        next = null
        if (state.freeOf.get(rec.account) === h) freeOf = [rec.account, null]
      } else if (rec.free) {
        if (ts <= rec.exp) fail('not-expired', 'the account showed signs of life')
        next = { account: rec.account, exp: ts + QUARANTINE_MS, free: true, held: true }
      } else {
        if (ts <= rec.exp + GRACE_MS) fail('not-expired', 'still within its time or grace period')
        next = null
      }
      break
    }
    case 'seize': {
      const rec = needLive(state, h, ts)
      if (typeof entry.account !== 'string' || !entry.account) fail('bad-entry', 'seize needs the receiving account')
      if (typeof entry.reason !== 'string' || !entry.reason.trim()) fail('bad-entry', 'seize needs a reason')
      const v = await request(state, marks, reqs[0], { ts, account: null, op: 'seize', h, extra: { to: entry.account, reason: entry.reason } })
      if (!policy.authorities.includes(v.profileId)) fail('not-authority', 'only an authority account can seize')
      if (rec.free) {
        // A quien le quitan su nombre gratuito se le da otro en la misma entrada: nunca se queda sin.
        const r = entry.replacement
        if (!HEX64.test(r || '') || r === h || !takeable(state, r, ts, null)) fail('bad-entry', 'seizing a free name needs a free replacement')
        replacement = { h: r, account: rec.account }
      }
      next = { account: entry.account, exp: rec.free ? ts + YEAR_MS : rec.exp, free: false }
      break
    }
  }

  // Lo que la entrada DICE que queda tiene que ser exactamente lo que sale de las reglas. Si el
  // nombre queda libre, la entrada no dice dueño.
  const declared = { account: entry.account ?? null, exp: entry.exp ?? null, free: !!entry.free, held: !!entry.held }
  const actual = next ? { account: next.account, exp: next.exp, free: next.free, held: !!next.held } : { account: null, exp: null, free: false, held: false }
  if (canonicalStringify(declared) !== canonicalStringify(actual)) fail('entry-mismatch', 'entry does not match what the rules give')

  // A partir de aquí ya no falla nada: se escribe.
  // Lo que caducó ya no hace falta para frenar repeticiones: su firma tampoco valdría.
  for (const [k, exp] of state.seen) if (exp < ts) state.seen.delete(k)
  for (const [k, exp] of marks) state.seen.set(k, exp)
  if (orphan && orphan !== next?.account) state.freeOf.delete(orphan)
  if (freeOf) {
    if (freeOf[1]) state.freeOf.set(freeOf[0], freeOf[1])
    else state.freeOf.delete(freeOf[0])
  }
  if (replacement) {
    state.names.set(replacement.h, { account: replacement.account, exp: ts + INACTIVITY_MS, free: true })
    state.freeOf.set(replacement.account, replacement.h)
  }
  if (next) state.names.set(h, next)
  else state.names.delete(h)
  return next
}

/** La hoja del estado de un nombre. */
export const stateLeafData = (h, rec) => ({ h, account: rec.account, exp: rec.exp, free: rec.free, held: !!rec.held })

async function stateLeaves (state) {
  const hs = [...state.names.keys()].sort()
  const leaves = []
  for (const h of hs) leaves.push(await leafHash(enc.encode(canonicalStringify(stateLeafData(h, state.names.get(h))))))
  return { hs, leaves }
}

/** La raíz del estado: cada nombre vivo ordenado por `h`. */
export async function stateRoot (state) {
  return root((await stateLeaves(state)).leaves)
}

/** La prueba de que el nombre `h` está en el estado, con su registro. */
export async function stateProof (state, h) {
  const rec = state.names.get(h)
  if (!rec) throw new NamesError('name-not-found', 'name not found')
  const { hs, leaves } = await stateLeaves(state)
  const index = hs.indexOf(h)
  return { index, size: leaves.length, leaf: stateLeafData(h, rec), proof: await inclusionProof(index, leaves) }
}
