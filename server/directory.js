/**
 * EL DIRECTORIO: aplica las reglas del núcleo, escribe el registro y firma lo que publica.
 *
 * Todo lo que decide si algo vale está en `@dotrino/names` (`applyEntry`): aquí solo se arma
 * la entrada, se le pone la hora y se guarda. Lo que este proceso pone de su parte, y por eso
 * lo firma él, es lo que un testigo no puede repetir: qué nombre gratuito tocó, qué dijo el DNS
 * de un dominio y qué cobró PayPal.
 *
 * Las escrituras van en fila (una a la vez): dos peticiones a la vez sobre el mismo estado
 * darían dos entradas con el mismo `seq`.
 */
import { priceWithTax } from '@dotrino/pay'
import { randomUUID } from 'node:crypto'
import {
  FORMAT_V, AUDIENCE, YEAR_MS, GRACE_MS, RECEIPT_TTL_MS, RETAINED_SEGMENTS, INACTIVITY_MS, QUARANTINE_MS, POLICY,
  NamesError, normalizeName, checkName, nameHash, addressCandidates, pickFreeName,
  emptyState, applyEntry, stateRoot, stateProof, Segment, checkpointBody, verifySigned
} from '@dotrino/names'
import { serializeState, deserializeState } from './store.js'
/** @import { Policy, Signed, LoggedEntry, Op, DomainProof, CheckpointBody } from '@dotrino/names/types' */
/** @import { Store } from './store.js' */
/** @import { PaypalClient, Price } from '@dotrino/pay' */

/**
 * Un aparato del acta de la cuenta del directorio: firma lo que este publica.
 * @typedef {{ signData: (data: object) => Promise<{ signature: string, publickey: string, chain?: unknown[] }> }} Signer
 * @typedef {Pick<PaypalClient, 'createOrder' | 'captureOrder'>} Paypal
 * @typedef {(domain: string, expected: string) => Promise<{ ok: boolean, reason?: string }>} CheckDomain
 */

/** @type {(code: string, message?: string) => never} */
const fail = (code, message) => { throw new NamesError(code, message) }

/** USD 0,99 por año más IVA (15 % en Ecuador). La cuenta la hace `@dotrino/pay`. */
export const PRICE_CENTS_PER_YEAR = 99
export const TAX_PERCENT = 15

/**
 * Los años de un cobro: un entero de 1 a 100, o `bad-years`.
 * @param {unknown} years
 * @returns {number}
 */
function checkYears (years) {
  if (typeof years !== 'number' || !Number.isInteger(years) || years < 1 || years > 100) fail('bad-years', 'years must be an integer from 1 to 100')
  return years
}

/**
 * @param {unknown} years
 * @returns {Price}
 */
export function priceFor (years) {
  return priceWithTax({ unitCents: PRICE_CENTS_PER_YEAR, quantity: checkYears(years), taxPercent: TAX_PERCENT })
}

/**
 * Lo que llega en el cuerpo JSON de una petición. NADA de esto está comprobado: lo comprueban
 * las reglas del núcleo (`applyEntry`, `verifySigned`) y `normalizeName`.
 * @typedef {object} Body
 * @property {Signed} [req]
 * @property {unknown} [name]
 * @property {Signed} [receipt]
 * @property {Signed} [give]
 * @property {Signed} [accept]
 */

export class Directory {
  /**
   * Las piezas, sin estado cargado: se arranca con `Directory.open`.
   * @param {{ store: Store, signer: Signer, policy: Policy, now: () => number, checkDomain: CheckDomain, paypal: Paypal | null, publicUrl: string, log: (line: string) => void }} o
   */
  constructor ({ store, signer, policy, now, checkDomain, paypal, publicUrl, log }) {
    this.store = store
    this.signer = signer
    this.policy = policy
    this.now = now
    this.checkDomain = checkDomain
    this.paypal = paypal
    this.publicUrl = publicUrl
    this.log = log
    /** @type {Promise<unknown>} */
    this.queue = Promise.resolve()
    /** @type {Promise<Signed> | null} */
    this.headCache = null
    /** @type {Signed | null} */
    this.checkpoint = null
    this.state = emptyState()
    this.segment = new Segment({ n: 0, firstSeq: 0, baseHash: null })
  }

  /**
   * @param {object} o
   * @param {Store} o.store
   * @param {Signer} o.signer  un aparato del acta de la cuenta del directorio
   * @param {CheckDomain} o.checkDomain
   * @param {Policy} [o.policy]
   * @param {() => number} [o.now]
   * @param {Paypal | null} [o.paypal]  `createOrder` / `captureOrder` (`@dotrino/pay`)
   * @param {string} [o.publicUrl]
   * @param {(line: string) => void} [o.log]
   * @returns {Promise<Directory>}
   */
  static async open ({ store, signer, policy = POLICY, now = Date.now, checkDomain, paypal = null, publicUrl = AUDIENCE, log = () => {} }) {
    if (!signer || typeof signer.signData !== 'function') throw new TypeError('signer is required')
    if (typeof checkDomain !== 'function') throw new TypeError('checkDomain is required')
    const d = new Directory({ store, signer, policy, now, checkDomain, paypal, publicUrl, log })
    // Arranque: el estado del último corte y lo que vino después, repetido con las mismas reglas.
    const cp = store.lastCheckpoint()
    d.checkpoint = cp
    if (cp) {
      const snap = store.snapshot(Number(cp.body.n))
      // Un corte sin su estado es una base a medias (los dos se guardan juntos): se para.
      if (!snap) throw new NamesError('no-snapshot', `checkpoint ${cp.body.n} has no state snapshot`)
      d.state = deserializeState(snap)
    } else {
      d.state = emptyState()
    }
    // El cuerpo de un corte firmado por este directorio (`checkpointBody`).
    d.segment = await Segment.after(/** @type {CheckpointBody | null} */ (cp?.body || null))
    for (const entry of store.entriesOf(d.segment.n)) {
      await applyEntry(d.state, entry, { policy })
      await d.segment.append(entry)
    }
    log(`[names] ready: ${d.state.names.size} names, segment ${d.segment.n} with ${d.segment.size} entries`)
    return d
  }

  /**
   * Pone `fn` en la fila de escrituras.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  serial (fn) {
    const p = this.queue.then(fn, fn)
    this.queue = p.catch(() => {})
    return p
  }

  /**
   * Arma, valida y guarda una entrada. Lanza `NamesError` si no vale, sin tocar nada.
   * `fields` trae lo que dicen las peticiones, sin comprobar: lo comprueba `applyEntry` campo
   * por campo, y por eso el tipo de la entrada se afirma aquí y no antes.
   * @param {{ op: Op, h: string } & Record<string, unknown>} fields
   * @returns {Promise<LoggedEntry>}
   */
  async write (fields) {
    const entry = /** @type {LoggedEntry} */ ({ v: FORMAT_V, seq: this.segment.nextSeq, prev: this.segment.head, ts: this.now(), account: null, exp: null, free: false, kind: null, ...fields })
    await applyEntry(this.state, entry, { policy: this.policy })
    await this.segment.append(entry)
    this.store.appendEntry(this.segment.n, entry)
    this.headCache = null
    return entry
  }

  /**
   * @template {object} T
   * @param {T} body
   * @returns {Promise<{ body: T, signature: string, publickey: string, chain?: unknown[] }>}
   */
  sign (body) { return this.signer.signData(body).then((s) => ({ body, signature: s.signature, publickey: s.publickey, chain: s.chain })) }

  /**
   * La prueba de dominio, comprobada AHORA contra el DNS público. `account` es la que dice la
   * petición: `applyEntry` comprueba después que sea la de la entrada.
   * @param {string} name
   * @param {unknown} account
   * @returns {Promise<DomainProof>}
   */
  async domainProof (name, account) {
    const value = `dotrino-names=${account}`
    const r = await this.checkDomain(name, value)
    if (!r.ok) fail(r.reason === 'no-record' ? 'no-domain-proof' : 'domain-check-failed', `${name}: ${r.reason} (publish a TXT record "${value}")`)
    return { kind: 'dns-txt', value, ts: this.now() }
  }

  /**
   * ¿`name` lo puede tomar alguien ya? (para elegir el gratuito).
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async taken (name) {
    const rec = this.state.names.get(await nameHash(name))
    return !!rec && !(rec.held && this.now() > rec.exp)
  }

  // ----- lo que pide una cuenta -----

  /**
   * El nombre gratuito: si tenía uno guardado, ese; si no, uno al azar entre los libres.
   * @param {Body} b
   */
  claimFree ({ req }) {
    return this.serial(async () => {
      const account = req?.body?.account
      const own = typeof account === 'string' ? this.state.freeOf.get(account) : undefined
      const ownRec = own && this.state.names.get(own)
      let h, name
      if (own && ownRec && ownRec.account === account && ownRec.held && this.now() <= ownRec.exp) {
        h = own
        name = this.store.nameOf(h)
        // Un nombre guardado sin su nombre en claro: antes se escribía la entrada y luego
        // reventaba al recordarlo. Se para antes de escribir nada.
        if (!name) throw new NamesError('internal', `held free name ${h} has no clear name`)
      } else {
        name = await pickFreeName({ isTaken: (n) => this.taken(n) })
        h = await nameHash(name)
      }
      const entry = await this.write({ op: 'claim-free', h, account, exp: this.now() + INACTIVITY_MS, free: true, kind: 'native', reqs: [req] })
      this.store.rememberName(h, name)
      return { name, entry }
    })
  }

  /** @param {Body} b */
  claim ({ name, req, receipt }) {
    return this.serial(async () => {
      const full = normalizeName(name)
      const kind = checkName(full)
      const account = req?.body?.account
      const proof = kind === 'domain' ? await this.domainProof(full, account) : undefined
      const years = receipt?.body?.years
      const ts = this.now()
      const h = await nameHash(full)
      // `Number(years) * …` es lo mismo que `years * …` (el `*` ya convierte a número).
      const entry = await this.write({ op: 'claim', ts, h, account, exp: ts + Number(years) * YEAR_MS, kind, proof, reqs: [req], receipt })
      this.store.rememberName(h, full)
      return { name: full, entry }
    })
  }

  /** @param {Body} b */
  renew ({ name, req, receipt }) {
    return this.serial(async () => {
      const full = normalizeName(name)
      const h = await nameHash(full)
      const rec = this.state.names.get(h)
      if (!rec || rec.held) fail('name-not-found', 'name not found')
      const ts = this.now()
      const proof = rec.kind === 'domain' ? await this.domainProof(full, rec.account) : undefined
      const exp = Math.max(rec.exp, ts) + Number(receipt?.body?.years ?? 0) * YEAR_MS
      return { name: full, entry: await this.write({ op: 'renew', ts, h, account: rec.account, exp, kind: rec.kind, proof, reqs: req ? [req] : [], receipt }) }
    })
  }

  /** @param {Body} b */
  transfer ({ name, give, accept }) {
    return this.serial(async () => {
      const full = normalizeName(name)
      const h = await nameHash(full)
      const rec = this.state.names.get(h)
      if (!rec || rec.held) fail('name-not-found', 'name not found')
      const to = give?.body?.to
      const proof = rec.kind === 'domain' ? await this.domainProof(full, to) : undefined
      return { name: full, entry: await this.write({ op: 'transfer', h, account: to, exp: rec.exp, kind: rec.kind, proof, reqs: [give, accept] }) }
    })
  }

  /** @param {Body} b */
  release ({ name, req }) {
    return this.serial(async () => {
      const full = normalizeName(name)
      const h = await nameHash(full)
      const entry = await this.write({ op: 'release', h, reqs: [req] })
      this.store.forgetName(h)
      return { name: full, entry }
    })
  }

  /**
   * La señal de vida del nombre gratuito: la cuenta no dice cuál es, lo sabe el directorio.
   * @param {Body} b
   */
  touch ({ req }) {
    return this.serial(async () => {
      const account = req?.body?.account
      const h = typeof account === 'string' ? this.state.freeOf.get(account) : undefined
      const rec = h && this.state.names.get(h)
      if (!h || !rec || rec.held) fail('name-not-found', 'this account has no free name')
      const ts = this.now()
      const entry = await this.write({ op: 'touch', ts, h, account, exp: ts + INACTIVITY_MS, free: true, kind: rec.kind, reqs: [req] })
      return { name: this.store.nameOf(h), entry }
    })
  }

  /** @param {Body} b */
  sub ({ name, req }) {
    return this.serial(async () => {
      const full = normalizeName(name)
      const h = await nameHash(full)
      const rec = this.state.names.get(h)
      if (!rec || rec.held) fail('name-not-found', 'name not found')
      const { sub, device } = req?.body || /** @type {Record<string, unknown>} */ ({})
      return { name: full, entry: await this.write({ op: 'sub', h, sub, device, account: rec.account, exp: rec.exp, free: rec.free, kind: rec.kind, reqs: [req] }) }
    })
  }

  /** @param {Body} b */
  seize ({ name, req }) {
    return this.serial(async () => {
      const full = normalizeName(name)
      const h = await nameHash(full)
      const rec = this.state.names.get(h)
      if (!rec || rec.held) fail('name-not-found', 'name not found')
      const { to, reason } = req?.body || /** @type {Record<string, unknown>} */ ({})
      const ts = this.now()
      let replacement, replacementName
      if (rec.free) {
        replacementName = await pickFreeName({ isTaken: (n) => this.taken(n) })
        replacement = await nameHash(replacementName)
      }
      const entry = await this.write({ op: 'seize', ts, h, account: to, exp: rec.free ? ts + YEAR_MS : rec.exp, kind: rec.kind, reason, replacement, reqs: [req] })
      if (replacement && replacementName) this.store.rememberName(replacement, replacementName)
      return { name: full, entry, replacement: replacementName || null }
    })
  }

  /**
   * Los nombres de una cuenta, con su nombre en claro. Exige una petición firmada por ella.
   * @param {Body} b
   */
  async mine ({ req }) {
    const v = await verifySigned(req, { now: this.now() })
    // `!req` no pasa con `v.ok`: está para que el tipo lo sepa.
    if (!v.ok || !req) return fail('bad-request-signature', `mine: ${v.ok ? 'shape' : v.reason}`)
    if (req.body.op !== 'mine' || req.body.account !== v.account) fail('request-mismatch', 'mine: request for another account')
    const out = []
    for (const [h, rec] of this.state.names) {
      if (rec.account === v.account) out.push({ name: this.store.nameOf(h), h, ...rec })
    }
    return out
  }

  // ----- lo que corre solo -----

  /**
   * Escribe los `expire` que tocan. Devuelve cuántos.
   * @returns {Promise<number>}
   */
  sweep () {
    return this.serial(async () => {
      const ts = this.now()
      let n = 0
      for (const [h, rec] of [...this.state.names]) {
        const due = rec.held ? ts > rec.exp : rec.free ? ts > rec.exp : ts > rec.exp + GRACE_MS
        if (!due) continue
        const next = rec.held ? null : rec.free ? { account: rec.account, exp: ts + QUARANTINE_MS, free: true, kind: rec.kind, held: true } : null
        try {
          await this.write({ op: 'expire', ts, h, ...(next || {}) })
          if (!next) this.store.forgetName(h)
          n++
        } catch (e) {
          const err = /** @type {{ code?: string, message?: string }} */ (e)
          this.log(`[names] could not expire ${h}: ${err.code || err.message}`)
        }
      }
      return n
    })
  }

  /**
   * Cierra el tramo abierto con un corte firmado y poda lo de más de 12 tramos.
   * @returns {Promise<Signed>}
   */
  closeSegment () {
    return this.serial(async () => {
      const body = await checkpointBody({ segment: this.segment, state: this.state, ts: this.now() })
      const signed = await this.sign(body)
      this.store.putCheckpoint(signed, serializeState(this.state))
      this.checkpoint = signed
      this.segment = await Segment.after(body)
      this.store.prune(this.segment.n - RETAINED_SEGMENTS)
      this.headCache = null
      this.log(`[names] checkpoint ${body.n} closed (${body.segmentSize} entries)`)
      return signed
    })
  }

  /**
   * La cabecera firmada del tramo abierto, con la raíz del estado de ahora. Se cachea.
   * @returns {Promise<Signed>}
   */
  async head () {
    if (this.headCache) return this.headCache
    const p = (async () => this.sign(await this.segment.headBody(this.now(), await stateRoot(this.state))))()
    this.headCache = p
    try { return await p } catch (e) { this.headCache = null; throw e }
  }

  // ----- resolver -----

  /**
   * La respuesta para `address` (`blue-cat`, `laptop.empresa.com`…), lista para `verifyResolution`.
   * @param {string} address
   */
  async resolve (address) {
    for (const { name, sub } of addressCandidates(address)) {
      const h = await nameHash(name)
      const rec = this.state.names.get(h)
      if (!rec) continue
      // La cabecera y la prueba tienen que ser del MISMO estado: se arman sin escrituras en medio.
      return this.serial(async () => ({ name, sub, head: await this.head(), state: await stateProof(this.state, h) }))
    }
    return fail('name-not-found', 'name not found')
  }

  // ----- cobrar -----

  /**
   * Empieza un cobro de `years` años. Devuelve a dónde mandar al usuario para pagar.
   * @param {{ years: unknown }} args
   */
  async checkout ({ years: input }) {
    if (!this.paypal) fail('payments-unavailable', 'payments are not configured')
    const years = checkYears(input)
    const price = priceFor(years)
    const custom = randomUUID()
    const order = await this.paypal.createOrder({
      ...price, description: `Dotrino name, ${years} year${years > 1 ? 's' : ''}`, customId: custom,
      returnUrl: `${this.publicUrl}/paid`, cancelUrl: `${this.publicUrl}/`
    })
    this.store.putOrder({ id: order.id, years, custom, amount: price.total, ts: this.now() })
    return { orderId: order.id, approveUrl: order.approveUrl, price }
  }

  /**
   * Cierra el cobro y da el recibo. Quien confirma es ESTE proceso, preguntándole a PayPal con
   * su credencial: lo que diga la página no cuenta. Capturar dos veces da el mismo recibo.
   * @param {{ orderId: string }} args
   * @returns {Promise<Signed>}
   */
  capture ({ orderId }) {
    return this.serial(async () => {
      const order = this.store.order(orderId)
      if (!order) return fail('order-not-found', 'unknown order')
      if (order.receipt) return order.receipt
      // Sin cobros configurados (un pedido de antes de reiniciar, la bóveda sin contestar)
      // antes reventaba con un TypeError (500); es lo mismo que en `checkout`.
      if (!this.paypal) return fail('payments-unavailable', 'payments are not configured')
      const r = await this.paypal.captureOrder(orderId)
      if (r.status !== 'COMPLETED') fail('payment-not-completed', `payment status ${r.status}`)
      if (r.customId !== order.custom || r.amount !== order.amount) fail('payment-mismatch', 'the payment does not match the order')
      const ts = this.now()
      const receipt = await this.sign({ v: FORMAT_V, aud: AUDIENCE, kind: 'receipt', id: randomUUID(), years: order.years, iat: ts, exp: ts + RECEIPT_TTL_MS })
      this.store.setReceipt(orderId, receipt)
      return receipt
    })
  }
}
