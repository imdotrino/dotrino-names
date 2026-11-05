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
/** @import { Entry, LoggedEntry, State, Policy, Signed, CheckpointBody, HeadBody } from './types.js' */

const enc = new TextEncoder()

/**
 * La hoja de una entrada: su JSON canónico entero.
 * @param {Entry} entry
 * @returns {Promise<string>}
 */
export const entryLeaf = (entry) => leafHash(enc.encode(canonicalStringify(entry)))

/**
 * El hash que encadena un corte con el siguiente.
 * @param {CheckpointBody} body
 * @returns {Promise<string>}
 */
export const checkpointHash = (body) => hashObject(body)

/**
 * Un tramo. `base` es el corte anterior (su cuerpo) o `null` para el primero. La primera
 * entrada encadena con el hash de ese corte; cada una de las siguientes, con la hoja de la
 * anterior.
 */
export class Segment {
  /** @param {{ n: number, firstSeq: number, baseHash: string | null }} args */
  constructor ({ n, firstSeq, baseHash }) {
    this.n = n
    this.firstSeq = firstSeq
    this.baseHash = baseHash
    /** @type {LoggedEntry[]} */
    this.entries = []
    /** @type {string[]} */
    this.leaves = []
  }

  /**
   * El tramo que sigue al corte `checkpoint` (o el primero, con `null`).
   * @param {CheckpointBody | null | undefined} checkpoint
   * @returns {Promise<Segment>}
   */
  static async after (checkpoint) {
    if (!checkpoint) return new Segment({ n: 0, firstSeq: 0, baseHash: null })
    return new Segment({ n: checkpoint.n + 1, firstSeq: checkpoint.firstSeq + checkpoint.segmentSize, baseHash: await checkpointHash(checkpoint) })
  }

  get size () { return this.entries.length }
  get nextSeq () { return this.firstSeq + this.entries.length }
  get head () { return this.leaves.length ? this.leaves[this.leaves.length - 1] : this.baseHash }

  /**
   * Añade una entrada ya validada contra el estado. Comprueba su sitio en la cadena.
   * @param {LoggedEntry} entry
   * @returns {Promise<string>} la hoja
   */
  async append (entry) {
    if (entry.seq !== this.nextSeq) fail('bad-seq', `expected seq ${this.nextSeq}, got ${entry.seq}`)
    if (entry.prev !== this.head) fail('bad-prev', 'entry does not chain with the previous one')
    const leaf = await entryLeaf(entry)
    this.entries.push(entry)
    this.leaves.push(leaf)
    return leaf
  }

  /** @returns {Promise<string>} */
  root () { return root(this.leaves) }

  /**
   * Prueba de inclusión de la entrada `seq`.
   * @param {number} seq
   * @returns {Promise<{ index: number, size: number, leaf: string, proof: string[] }>}
   */
  async inclusion (seq) {
    const i = seq - this.firstSeq
    if (!(i >= 0 && i < this.size)) throw new NamesError('entry-not-found', 'entry not in this segment')
    return { index: i, size: this.size, leaf: this.leaves[i], proof: await inclusionProof(i, this.leaves) }
  }

  /**
   * @param {number} oldSize
   * @returns {Promise<string[]>}
   */
  consistency (oldSize) { return consistencyProof(oldSize, this.leaves) }

  /**
   * La cabecera del tramo abierto, sin firmar: la firma el directorio con su identidad. Lleva
   * la raíz del ESTADO de ahora (`stateRoot`), para que una respuesta se pruebe contra el estado
   * vigente y no contra el corte del mes pasado. El testigo la comprueba al cerrar el tramo.
   * @param {number} ts
   * @param {string} stateRoot
   * @returns {Promise<HeadBody>}
   */
  async headBody (ts, stateRoot) {
    if (!/^[0-9a-f]{64}$/.test(stateRoot || '')) throw new TypeError('headBody: stateRoot is required')
    return { v: FORMAT_V, aud: AUDIENCE, kind: 'head', n: this.n, firstSeq: this.firstSeq, size: this.size, root: await this.root(), stateRoot, ts }
  }
}

/**
 * El cuerpo del corte que cierra `segment` con `state` (el estado tras su última entrada).
 * @param {{ segment: Segment, state: State, ts: number }} args
 * @returns {Promise<CheckpointBody>}
 */
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
 * @param {{ prevCheckpoint: CheckpointBody | null, prevState: State, entries: LoggedEntry[], checkpoint: Signed, policy: Policy, now: number }} args
 * @returns {Promise<{ state: State, body: Signed['body'] }>}
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
