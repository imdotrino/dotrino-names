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

export class Store {
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

  appendEntry (n, entry) {
    this.db.prepare('INSERT INTO entries (seq, n, json) VALUES (?, ?, ?)').run(entry.seq, n, JSON.stringify(entry))
  }

  entriesOf (n) {
    return this.db.prepare('SELECT json FROM entries WHERE n = ? ORDER BY seq').all(n).map((r) => JSON.parse(r.json))
  }

  lastCheckpoint () {
    const r = this.db.prepare('SELECT n, json FROM checkpoints ORDER BY n DESC LIMIT 1').get()
    return r ? JSON.parse(r.json) : null
  }

  checkpoint (n) {
    const r = this.db.prepare('SELECT json FROM checkpoints WHERE n = ?').get(n)
    return r ? JSON.parse(r.json) : null
  }

  checkpointsFrom (n, limit = 100) {
    return this.db.prepare('SELECT json FROM checkpoints WHERE n >= ? ORDER BY n LIMIT ?').all(n, limit).map((r) => JSON.parse(r.json))
  }

  snapshot (n) {
    const r = this.db.prepare('SELECT json FROM snapshots WHERE n = ?').get(n)
    return r ? JSON.parse(r.json) : null
  }

  /** Guarda un corte y el estado que deja, de una vez: o entran los dos o ninguno. */
  putCheckpoint (signed, snapshot) {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT INTO checkpoints (n, json) VALUES (?, ?)').run(signed.body.n, JSON.stringify(signed))
      this.db.prepare('INSERT INTO snapshots (n, json) VALUES (?, ?)').run(signed.body.n, JSON.stringify(snapshot))
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }

  /** Poda: borra los tramos anteriores a `keepFrom` y sus estados. Los cortes se quedan. */
  prune (keepFrom) {
    this.db.prepare('DELETE FROM entries WHERE n < ?').run(keepFrom)
    this.db.prepare('DELETE FROM snapshots WHERE n < ?').run(keepFrom - 1)
  }

  rememberName (h, name) { this.db.prepare('INSERT OR IGNORE INTO names (h, name) VALUES (?, ?)').run(h, name) }
  nameOf (h) { return this.db.prepare('SELECT name FROM names WHERE h = ?').get(h)?.name ?? null }
  forgetName (h) { this.db.prepare('DELETE FROM names WHERE h = ?').run(h) }

  putOrder ({ id, years, custom, amount, ts }) {
    this.db.prepare('INSERT INTO orders (id, years, custom, amount, ts) VALUES (?, ?, ?, ?, ?)').run(id, years, custom, amount, ts)
  }

  order (id) {
    const r = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
    return r ? { ...r, receipt: r.receipt ? JSON.parse(r.receipt) : null } : null
  }

  setReceipt (id, receipt) { this.db.prepare('UPDATE orders SET receipt = ? WHERE id = ?').run(JSON.stringify(receipt), id) }
}

export const serializeState = (s) => ({ names: [...s.names], freeOf: [...s.freeOf], seen: [...s.seen] })
export const deserializeState = (o) => ({ names: new Map(o.names), freeOf: new Map(o.freeOf), seen: new Map(o.seen) })
