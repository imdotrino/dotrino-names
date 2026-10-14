/**
 * SHA-256 con WebCrypto: el mismo código corre en Node (≥ 20), en el navegador y en el proxio.
 */
import { canonicalStringify } from '@dotrino/identity/vault/core.js'

const enc = new TextEncoder()

export { canonicalStringify }

export async function sha256 (bytes) {
  const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data))
}

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export function fromHex (hex) {
  if (typeof hex !== 'string' || hex.length % 2 || /[^0-9a-f]/.test(hex)) throw new TypeError('bad hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function concat (...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** El hash de un objeto, sobre su JSON canónico (el mismo que firma la identidad). */
export const hashObject = async (obj) => toHex(await sha256(canonicalStringify(obj)))
