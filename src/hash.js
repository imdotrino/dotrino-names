/**
 * SHA-256 con WebCrypto: el mismo código corre en Node (≥ 20), en el navegador y en el proxio.
 */
import { canonicalStringify as canonical } from '@dotrino/identity/vault/core.js'

const enc = new TextEncoder()

/**
 * El JSON canónico de lo que se guarda y se hashea. Primero pasa por JSON (lo mismo que va al
 * disco): una clave con `undefined` desaparece en los dos lados. Sin esto, una reserva nativa
 * (`proof: undefined`) se hasheaba en memoria con `"proof":undefined` y al rearrancar, leída
 * del disco sin esa clave, la cadena no cuadraba (`bad-prev`, 2026-10-15).
 */
/**
 * @param {unknown} v
 * @returns {string}
 */
export const canonicalStringify = (v) => canonical(v === undefined ? null : JSON.parse(JSON.stringify(v)))

/**
 * @param {string | Uint8Array<ArrayBuffer>} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function sha256 (bytes) {
  const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data))
}

/**
 * @param {ArrayLike<number>} bytes
 * @returns {string}
 */
export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * @param {string} hex
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function fromHex (hex) {
  if (typeof hex !== 'string' || hex.length % 2 || /[^0-9a-f]/.test(hex)) throw new TypeError('bad hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * @param {...Uint8Array} parts
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function concat (...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/**
 * El hash de un objeto, sobre su JSON canónico (el mismo que firma la identidad).
 * @param {unknown} obj
 * @returns {Promise<string>}
 */
export const hashObject = async (obj) => toHex(await sha256(canonicalStringify(obj)))
