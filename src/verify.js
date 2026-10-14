/**
 * Las firmas de este registro se comprueban con el PILAR (`@dotrino/identity/assertion`), no
 * aquí: quién firmó, que sea miembro con `sign` del acta de esa cuenta, y para quién (`aud`).
 * Tener esa lógica en dos sitios es tenerla mal en uno de los dos.
 */
import { verifySignedFor } from '@dotrino/identity/assertion'
import { AUDIENCE } from './constants.js'
import { NamesError } from './errors.js'

/**
 * La política: qué cuenta firma como directorio (cabeceras, cortes, recibos) y qué cuentas
 * son autoridad (`seize`). Es política del CÓDIGO (CONVENCIONES §14): `POLICY` viaja con la
 * versión. Las pruebas pasan la suya.
 */
export function checkPolicy (policy) {
  if (!policy || typeof policy.directoryAccount !== 'string' || !policy.directoryAccount) {
    throw new NamesError('no-policy', 'policy.directoryAccount is required')
  }
  if (!Array.isArray(policy.authorities)) throw new NamesError('no-policy', 'policy.authorities is required')
  return policy
}

/** `signed` = `{ body, signature, publickey, chain }`, lo que da `identity.signData(body)`. */
export async function verifySigned (signed, { now, account = null } = {}) {
  if (!signed || typeof signed !== 'object' || !signed.body) return { ok: false, reason: 'shape' }
  if (!Number.isFinite(now)) throw new TypeError('now is required')
  const { body, signature, publickey, chain } = signed
  return verifySignedFor({ data: body, signature, publickey, chain, audience: AUDIENCE, expectedProfileId: account, now })
}

/** Lo firmado por el directorio: tiene que ser de `policy.directoryAccount` y del tipo esperado. */
export async function verifyDirectorySigned (signed, { policy, kind, now }) {
  checkPolicy(policy)
  const v = await verifySigned(signed, { now, account: policy.directoryAccount })
  if (!v.ok) throw new NamesError('bad-directory-signature', `directory signature: ${v.reason}`)
  if (signed.body.kind !== kind) throw new NamesError('bad-kind', `expected ${kind}, got ${signed.body.kind}`)
  return signed.body
}
