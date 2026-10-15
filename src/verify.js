/**
 * Las firmas de este registro se comprueban con el PILAR (`@dotrino/identity/assertion`), no
 * aquí: quién firmó, que sea miembro con `sign` del acta de esa cuenta, y para quién (`aud`).
 * Tener esa lógica en dos sitios es tenerla mal en uno de los dos.
 *
 * Una CUENTA se nombra en el registro por su huella: `pubkeyId(profileId)`, 64 hex. Es lo que
 * enseñan la bóveda y el acta (`6729-403E-…`), y ocupa una fracción de la llave entera.
 */
import { verifySignedFor } from '@dotrino/identity/assertion'
import { pubkeyId } from '@dotrino/identity/keyid'
import { AUDIENCE } from './constants.js'
import { NamesError } from './errors.js'

export { pubkeyId }

/** La huella de una cuenta a partir de su `profileId` (la llave génesis del acta). */
export const accountId = (profileId) => pubkeyId(profileId)

/**
 * ¿`id` es la cuenta que fija la política? La política puede fijarla por un PREFIJO de su
 * huella (lo que enseña `dotrino-vault info`), de al menos 24 hex: 96 bits, que nadie puede
 * fabricar a propósito.
 */
export function matchesAccount (id, pin) {
  return typeof id === 'string' && typeof pin === 'string' && pin.length >= 24 && /^[0-9a-f]+$/.test(pin) && id.startsWith(pin)
}

/**
 * La política: qué cuenta firma como directorio (cabeceras, cortes, recibos) y qué cuentas
 * son autoridad (`seize`). Es política del CÓDIGO (CONVENCIONES §14): `POLICY` viaja con la
 * versión. Las pruebas pasan la suya.
 */
export function checkPolicy (policy) {
  if (!policy || typeof policy.directoryAccount !== 'string' || policy.directoryAccount.length < 24) {
    throw new NamesError('no-policy', 'policy.directoryAccount is required')
  }
  if (!Array.isArray(policy.authorities)) throw new NamesError('no-policy', 'policy.authorities is required')
  if (policy.directoryNs != null && typeof policy.directoryNs !== 'string') throw new NamesError('no-policy', 'policy.directoryNs must be a string')
  return policy
}

/**
 * `signed` = `{ body, signature, publickey, chain }`, lo que da `identity.signData(body)`.
 * Devuelve lo del pilar más `account`, la huella de la cuenta que firmó.
 */
export async function verifySigned (signed, { now, ns = null } = {}) {
  if (!signed || typeof signed !== 'object' || !signed.body) return { ok: false, reason: 'shape' }
  if (!Number.isFinite(now)) throw new TypeError('now is required')
  const { body, signature, publickey, chain } = signed
  // `ns`: solo para lo firmado por un SERVICIO (el directorio); lo de la persona va sin él.
  const v = await verifySignedFor({ data: body, signature, publickey, chain, audience: AUDIENCE, ns, now })
  if (!v.ok) return v
  return { ...v, account: await accountId(v.profileId) }
}

/** Lo firmado por el directorio: tiene que ser de `policy.directoryAccount` y del tipo esperado. */
export async function verifyDirectorySigned (signed, { policy, kind, now }) {
  checkPolicy(policy)
  const v = await verifySigned(signed, { now, ns: policy.directoryNs ?? null })
  if (!v.ok) throw new NamesError('bad-directory-signature', `directory signature: ${v.reason}`)
  if (!matchesAccount(v.account, policy.directoryAccount)) throw new NamesError('bad-directory-signature', 'not signed by the directory account')
  if (signed.body.kind !== kind) throw new NamesError('bad-kind', `expected ${kind}, got ${signed.body.kind}`)
  return signed.body
}

/** ¿El aparato `device` (su huella) es miembro del acta más nueva de esta cadena? */
export async function isActaMember (chain, device) {
  const head = Array.isArray(chain) ? chain[chain.length - 1] : null
  for (const m of head?.members || []) if (m?.pub && await pubkeyId(m.pub) === device) return true
  return false
}
