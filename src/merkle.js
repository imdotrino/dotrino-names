/**
 * Árbol de Merkle de RFC 9162 (Certificate Transparency v2), §2.1. Trabaja sobre los hashes de
 * las hojas, en hex. Prefijo 0x00 para una hoja y 0x01 para un nodo, que es lo que impide
 * hacer pasar un nodo por una hoja.
 */
import { sha256, toHex, fromHex, concat } from './hash.js'

const LEAF = new Uint8Array([0])
const NODE = new Uint8Array([1])

export const leafHash = async (bytes) => toHex(await sha256(concat(LEAF, bytes)))
const nodeHash = async (l, r) => toHex(await sha256(concat(NODE, fromHex(l), fromHex(r))))

/** La mayor potencia de 2 estrictamente menor que n (n ≥ 2). */
const split = (n) => { let k = 1; while (k * 2 < n) k *= 2; return k }

/** MTH: la raíz de una lista de hashes de hoja. */
export async function root (leaves) {
  if (leaves.length === 0) return toHex(await sha256(new Uint8Array(0)))
  if (leaves.length === 1) return leaves[0]
  const k = split(leaves.length)
  return nodeHash(await root(leaves.slice(0, k)), await root(leaves.slice(k)))
}

/** PATH(m, D[n]): la prueba de que la hoja m está en el árbol. */
export async function inclusionProof (m, leaves) {
  if (!(m >= 0 && m < leaves.length)) throw new RangeError('leaf index out of range')
  if (leaves.length === 1) return []
  const k = split(leaves.length)
  return m < k
    ? [...await inclusionProof(m, leaves.slice(0, k)), await root(leaves.slice(k))]
    : [...await inclusionProof(m - k, leaves.slice(k)), await root(leaves.slice(0, k))]
}

/** RFC 9162 §2.1.3.2. */
export async function verifyInclusion ({ index, size, leaf, proof, root: expected }) {
  if (!(Number.isInteger(index) && Number.isInteger(size) && index >= 0 && index < size)) return false
  let fn = index
  let sn = size - 1
  let r = leaf
  for (const p of proof) {
    if (sn === 0) return false
    if ((fn & 1) || fn === sn) {
      r = await nodeHash(p, r)
      if (!(fn & 1)) while (!(fn & 1) && fn !== 0) { fn >>= 1; sn >>= 1 }
    } else {
      r = await nodeHash(r, p)
    }
    fn >>= 1; sn >>= 1
  }
  return sn === 0 && r === expected
}

async function subproof (m, leaves, complete) {
  const n = leaves.length
  if (m === n) return complete ? [] : [await root(leaves)]
  const k = split(n)
  return m <= k
    ? [...await subproof(m, leaves.slice(0, k), complete), await root(leaves.slice(k))]
    : [...await subproof(m - k, leaves.slice(k), false), await root(leaves.slice(0, k))]
}

/** PROOF(m, D[n]): que el árbol de tamaño m es el principio del de tamaño n, sin cambios. */
export async function consistencyProof (m, leaves) {
  if (!(m > 0 && m <= leaves.length)) throw new RangeError('bad consistency range')
  if (m === leaves.length) return []
  return subproof(m, leaves, true)
}

/** RFC 9162 §2.1.4.2. */
export async function verifyConsistency ({ firstSize, secondSize, firstRoot, secondRoot, proof }) {
  if (!(Number.isInteger(firstSize) && Number.isInteger(secondSize) && firstSize > 0 && firstSize <= secondSize)) return false
  if (firstSize === secondSize) return proof.length === 0 && firstRoot === secondRoot
  const path = (firstSize & (firstSize - 1)) === 0 ? [firstRoot, ...proof] : [...proof]
  if (!path.length) return false
  let fn = firstSize - 1
  let sn = secondSize - 1
  while (fn & 1) { fn >>= 1; sn >>= 1 }
  let fr = path[0]
  let sr = path[0]
  for (const c of path.slice(1)) {
    if (sn === 0) return false
    if ((fn & 1) || fn === sn) {
      fr = await nodeHash(c, fr)
      sr = await nodeHash(c, sr)
      if (!(fn & 1)) while (!(fn & 1) && fn !== 0) { fn >>= 1; sn >>= 1 }
    } else {
      sr = await nodeHash(sr, c)
    }
    fn >>= 1; sn >>= 1
  }
  return fr === firstRoot && sr === secondRoot && sn === 0
}
