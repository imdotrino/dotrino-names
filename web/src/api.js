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
import { signedFor } from '@dotrino/identity/assertion'

const BASE = (import.meta.env.VITE_NAMES_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor (code, message, status) { super(message); this.code = code; this.status = status }
}

/**
 * Lo que contesta el directorio, sin comprobar: quien llama sabe qué forma tiene cada ruta
 * (`./types.js`).
 * @param {'GET' | 'POST'} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<unknown>}
 */
async function call (method, path, body) {
  let res
  try {
    res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  } catch (e) {
    throw new ApiError('unreachable', e instanceof Error ? e.message : String(e), 0)
  }
  /** @type {{ code?: string, error?: string } & Record<string, unknown>} */
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.code || 'http-' + res.status, data.error || res.statusText, res.status)
  return data
}

/** @param {string} path */
export const get = (path) => call('GET', path)
/**
 * @param {string} path
 * @param {object} body
 */
export const post = (path, body) => call('POST', path, body)

/**
 * Una petición firmada: `{ body, signature, publickey, chain }`, como la espera el directorio. La firma el pilar.
 * @param {Parameters<typeof signedFor>[0]} identity
 * @param {Record<string, unknown>} fields
 */
export async function signedRequest (identity, fields) {
  try {
    return await signedFor(identity, { aud: AUDIENCE, ttlMs: REQUEST_TTL_MS, fields: { v: FORMAT_V, ...fields } })
  } catch (e) {
    const err = /** @type {{ code?: string, message: string }} */ (e)
    if (err?.code === 'no-chain') throw new ApiError('no-chain', err.message)
    throw e
  }
}

export { nameHash, normalizeName }
