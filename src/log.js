/**
 * El registro: tramos de entradas encadenadas, una cabecera firmada por tramo abierto y un
 * corte por tramo cerrado (§3.2 y §3.4 del diseño).
 *
 * Aquí no hay disco ni red: el servidor guarda lo que esto produce, y los testigos lo
 * repiten con `replaySegment`.
 */
import { AUDIENCE, FORMAT_V } from './constants.js'
import { NamesError, fail } from './errors.js'
import { canonicalStringify, hashObject } from './hash.js'
import { leafHash, root, inclusionProof, consistencyProof } from './merkle.js'
import { applyEntry, cloneState, stateRoot } from './state.js'
import { verifyDirectorySigned } from './verify.js'

const enc = new TextEncoder()

/** La hoja de una entrada: su JSON canónico entero. */
export const entryLeaf = (entry) => leafHash(enc.encode(canonicalStringify(entry)))

/** El hash que encadena un corte con el siguiente. */
export const checkpointHash = (body) => hashObject(body)

/**
 * Un tramo. `base` es el corte anterior (su cuerpo) o `null` para el primero. La primera
 * entrada encadena con el hash de ese corte; cada una de las siguientes, con la hoja de la
 * anterior.
 */
export class Segment {
  constructor ({ n, firstSeq, baseHash }) {
    this.n = n
    this.firstSeq = firstSeq
    this.baseHash = baseHash
    this.entries = []
    this.leaves = []
  }

  static async after (checkpoint) {
    if (!checkpoint) return new Segment({ n: 0, firstSeq: 0, baseHash: null })
    return new Segment({ n: checkpoint.n + 1, firstSeq: checkpoint.firstSeq + checkpoint.segmentSize, baseHash: await checkpointHash(checkpoint) })
  }

  get size () { return this.entries.length }
  get nextSeq () { return this.firstSeq + this.entries.length }
  get head () { return this.leaves.length ? this.leaves[this.leaves.length - 1] : this.baseHash }

  /** Añade una entrada ya validada contra el estado. Comprueba su sitio en la cadena. */
  async append (entry) {
    if (entry.seq !== this.nextSeq) fail('bad-seq', `expected seq ${this.nextSeq}, got ${entry.seq}`)
    if (entry.prev !== this.head) fail('bad-prev', 'entry does not chain with the previous one')
    const leaf = await entryLeaf(entry)
    this.entries.push(entry)
    this.leaves.push(leaf)
    return leaf
  }

  root () { return root(this.leaves) }

  /** Prueba de inclusión de la entrada `seq`. */
  async inclusion (seq) {
    const i = seq - this.firstSeq
    if (!(i >= 0 && i < this.size)) throw new NamesError('entry-not-found', 'entry not in this segment')
    return { index: i, size: this.size, leaf: this.leaves[i], proof: await inclusionProof(i, this.leaves) }
  }

  consistency (oldSize) { return consistencyProof(oldSize, this.leaves) }

  /** La cabecera del tramo abierto, sin firmar: la firma el directorio con su identidad. */
  async headBody (ts) {
    return { v: FORMAT_V, aud: AUDIENCE, kind: 'head', n: this.n, firstSeq: this.firstSeq, size: this.size, root: await this.root(), ts }
  }
}

/** El cuerpo del corte que cierra `segment` con `state` (el estado tras su última entrada). */
export async function checkpointBody ({ segment, state, ts }) {
  return {
    v: FORMAT_V,
    aud: AUDIENCE,
    kind: 'checkpoint',
    n: segment.n,
    prev: segment.baseHash,
    firstSeq: segment.firstSeq,
    segmentSize: segment.size,
    segmentRoot: await segment.root(),
    stateRoot: await stateRoot(state),
    ts
  }
}

/**
 * Lo que hace un TESTIGO con un corte (§3.3): repetir el tramo sobre el estado del corte
 * anterior y comprobar que sale lo mismo. Devuelve el estado nuevo; no toca `prevState`.
 *
 * `prevCheckpoint` es el cuerpo del corte anterior (o `null` para el primero) y `checkpoint`
 * el corte FIRMADO que se quiere cofirmar.
 */
export async function replaySegment ({ prevCheckpoint, prevState, entries, checkpoint, policy, now }) {
  const body = await verifyDirectorySigned(checkpoint, { policy, kind: 'checkpoint', now })
  const segment = await Segment.after(prevCheckpoint)
  if (body.n !== segment.n) fail('checkpoint-mismatch', `expected checkpoint ${segment.n}, got ${body.n}`)
  if (body.prev !== segment.baseHash) fail('checkpoint-mismatch', 'checkpoint does not chain with the previous one')
  if (body.firstSeq !== segment.firstSeq) fail('checkpoint-mismatch', 'checkpoint firstSeq')
  const state = cloneState(prevState)
  for (const entry of entries) {
    await applyEntry(state, entry, { policy })
    await segment.append(entry)
  }
  if (body.segmentSize !== segment.size) fail('checkpoint-mismatch', 'checkpoint segmentSize')
  if (body.segmentRoot !== await segment.root()) fail('checkpoint-mismatch', 'checkpoint segmentRoot')
  if (body.stateRoot !== await stateRoot(state)) fail('checkpoint-mismatch', 'checkpoint stateRoot')
  return { state, body }
}
