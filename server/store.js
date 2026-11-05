/**
 * Dónde guarda el directorio lo suyo: un archivo SQLite (`node:sqlite`, sin dependencias).
 *
 *   entries      las entradas de los tramos que se conservan (12, §3.4 del diseño)
 *   checkpoints  los cortes firmados, TODOS (no se borran nunca)
 *   snapshots    el estado tras cada corte, para arrancar sin repetir la historia entera
 *   names        h → nombre en claro. PRIVADO del servidor: el registro público solo lleva el
 *                hash, pero el directorio tiene que poder decirle a una cuenta cuál es su nombre
 *   orders       los cobros en curso y su recibo, para que capturar dos veces dé el mismo
 */
import { DatabaseSync } from 'node:sqlite'
/** @import { LoggedEntry, Signed, State, NameRecord } from '@dotrino/names/types' */

/**
 * Un cobro en curso.
 * @typedef {{ id: string, years: number, custom: string, amount: string, ts: number }} Order
 * @typedef {Order & { receipt: Signed | null }} StoredOrder
 * @typedef {{ names: [string, NameRecord][], freeOf: [string, string][], seen: [string, number][] }} StateSnapshot
 */

/**
 * Una columna TEXT NOT NULL. Si no llega un texto, la base está dañada: se para y se dice.
 * @param {unknown} v
 * @returns {string}
 */
const text = (v) => {
  if (typeof v !== 'string') throw Object.assign(new Error('names.db: expected a text column'), { code: 'db-corrupt' })
  return v
}

export class Store {
  /** @param {string} [file] */
  constructor (file = ':memory:') {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY, n INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS entries_n ON entries (n);
      CREATE TABLE IF NOT EXISTS checkpoints (n INTEGER PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (n INTEGER PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS names (h TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, years INTEGER NOT NULL, custom TEXT NOT NULL, amount TEXT NOT NULL, receipt TEXT, ts INTEGER NOT NULL);
    `)
  }

  /**
   * @param {number} n
   * @param {LoggedEntry} entry
   */
  appendEntry (n, entry) {
    this.db.prepare('INSERT INTO entries (seq, n, json) VALUES (?, ?, ?)').run(entry.seq, n, JSON.stringify(entry))
  }

  /**
   * @param {number} n
   * @returns {LoggedEntry[]}
   */
  entriesOf (n) {
    return this.db.prepare('SELECT json FROM entries WHERE n = ? ORDER BY seq').all(n).map((r) => JSON.parse(text(r.json)))
  }

  /** @returns {Signed | null} */
  lastCheckpoint () {
    const r = this.db.prepare('SELECT n, json FROM checkpoints ORDER BY n DESC LIMIT 1').get()
    return r ? JSON.parse(text(r.json)) : null
  }

  /**
   * @param {number} n
   * @returns {Signed | null}
   */
  checkpoint (n) {
    const r = this.db.prepare('SELECT json FROM checkpoints WHERE n = ?').get(n)
    return r ? JSON.parse(text(r.json)) : null
  }

  /**
   * @param {number} n
   * @param {number} [limit]
   * @returns {Signed[]}
   */
  checkpointsFrom (n, limit = 100) {
    return this.db.prepare('SELECT json FROM checkpoints WHERE n >= ? ORDER BY n LIMIT ?').all(n, limit).map((r) => JSON.parse(text(r.json)))
  }

  /**
   * @param {number} n
   * @returns {StateSnapshot | null}
   */
  snapshot (n) {
    const r = this.db.prepare('SELECT json FROM snapshots WHERE n = ?').get(n)
    return r ? JSON.parse(text(r.json)) : null
  }

  /** Guarda un corte y el estado que deja, de una vez: o entran los dos o ninguno. */
  /**
   * @param {Signed & { body: { n: number } }} signed
   * @param {StateSnapshot} snapshot
   */
  putCheckpoint (signed, snapshot) {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT INTO checkpoints (n, json) VALUES (?, ?)').run(signed.body.n, JSON.stringify(signed))
      this.db.prepare('INSERT INTO snapshots (n, json) VALUES (?, ?)').run(signed.body.n, JSON.stringify(snapshot))
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }

  /** Poda: borra los tramos anteriores a `keepFrom` y sus estados. Los cortes se quedan. */
  /** @param {number} keepFrom */
  prune (keepFrom) {
    this.db.prepare('DELETE FROM entries WHERE n < ?').run(keepFrom)
    this.db.prepare('DELETE FROM snapshots WHERE n < ?').run(keepFrom - 1)
  }

  /**
   * @param {string} h
   * @param {string} name
   */
  rememberName (h, name) { this.db.prepare('INSERT OR IGNORE INTO names (h, name) VALUES (?, ?)').run(h, name) }
  /**
   * @param {string} h
   * @returns {string | null}
   */
  nameOf (h) {
    const name = this.db.prepare('SELECT name FROM names WHERE h = ?').get(h)?.name
    return name == null ? null : text(name)
  }

  /** @param {string} h */
  forgetName (h) { this.db.prepare('DELETE FROM names WHERE h = ?').run(h) }

  /** @param {Order} order */
  putOrder ({ id, years, custom, amount, ts }) {
    this.db.prepare('INSERT INTO orders (id, years, custom, amount, ts) VALUES (?, ?, ?, ?, ?)').run(id, years, custom, amount, ts)
  }

  /**
   * @param {string} id
   * @returns {StoredOrder | null}
   */
  order (id) {
    const r = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
    if (!r) return null
    return { id: text(r.id), years: Number(r.years), custom: text(r.custom), amount: text(r.amount), ts: Number(r.ts), receipt: r.receipt ? JSON.parse(text(r.receipt)) : null }
  }

  /**
   * @param {string} id
   * @param {Signed} receipt
   */
  setReceipt (id, receipt) { this.db.prepare('UPDATE orders SET receipt = ? WHERE id = ?').run(JSON.stringify(receipt), id) }
}

/**
 * @param {State} s
 * @returns {StateSnapshot}
 */
export const serializeState = (s) => ({ names: [...s.names], freeOf: [...s.freeOf], seen: [...s.seen] })
/**
 * @param {StateSnapshot} o
 * @returns {State}
 */
export const deserializeState = (o) => ({ names: new Map(o.names), freeOf: new Map(o.freeOf), seen: new Map(o.seen) })
