/**
 * Lo que la página le pide al directorio. Mismo origen que la API (`server/http.js` sirve
 * las dos cosas), salvo en desarrollo, donde `VITE_NAMES_URL` apunta al servidor de verdad.
 *
 * Cada cosa que cambia algo va con una PETICIÓN FIRMADA por la cuenta: `signData` del pilar
 * devuelve la firma, la llave del aparato y la cadena de selladores que prueba que ese
 * aparato habla por la cuenta. El directorio no tiene sesiones ni cookies.
 */
import { FORMAT_V, AUDIENCE, REQUEST_TTL_MS } from '@dotrino/names/constants'
import { nameHash, normalizeName } from '@dotrino/names/name'

const BASE = (import.meta.env.VITE_NAMES_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor (code, message, status) { super(message); this.code = code; this.status = status }
}

async function call (method, path, body) {
  let res
  try {
    res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  } catch (e) {
    throw new ApiError('unreachable', e.message, 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.code || 'http-' + res.status, data.error || res.statusText, res.status)
  return data
}

export const get = (path) => call('GET', path)
export const post = (path, body) => call('POST', path, body)

/** Una petición firmada: `{ body, signature, publickey, chain }`, como la espera el directorio. */
export async function signedRequest (identity, fields) {
  const iat = Date.now()
  const body = { v: FORMAT_V, aud: AUDIENCE, iat, exp: iat + REQUEST_TTL_MS, nonce: crypto.randomUUID(), ...fields }
  const s = await identity.signData(body)
  if (!s?.chain?.length) throw new ApiError('no-chain', 'this device cannot prove it belongs to the account')
  return { body, signature: s.signature, publickey: s.publickey, chain: s.chain }
}

export { nameHash, normalizeName }
