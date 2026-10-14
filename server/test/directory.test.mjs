/**
 * El directorio de punta a punta, sin red: identidades de Node reales, un DNS fingido y un
 * PayPal fingido. Lo que decide si algo vale ya lo prueban las suites del núcleo: aquí se
 * prueba lo que el servidor pone de su parte (elegir el gratuito, mirar el DNS, cobrar,
 * contestar por HTTP) y que arranca igual desde el disco.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Identity } from '@dotrino/identity/node'
import { AUDIENCE, FORMAT_V, REQUEST_TTL_MS, verifyResolution, accountId, pubkeyId, DAY_MS } from '@dotrino/names'
import { Store } from '../store.js'
import { Directory, priceFor } from '../directory.js'
import { makeHandler } from '../http.js'

const dirs = []
const ids = []
async function account () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'names-srv-'))
  dirs.push(dir)
  const id = await Identity.connect({ dir })
  ids.push(id)
  const { profileId, publickey } = await id.signData({ aud: AUDIENCE, probe: true })
  return { id, account: await accountId(profileId), device: await pubkeyId(publickey), signData: (d) => id.signData(d) }
}
const signed = async (who, body) => { const s = await who.id.signData(body); return { body, signature: s.signature, publickey: s.publickey, chain: s.chain } }
const req = (who, ts, fields) => signed(who, { v: FORMAT_V, aud: AUDIENCE, iat: ts, exp: ts + REQUEST_TTL_MS, nonce: randomUUID(), ...fields })

let clock = Date.UTC(2026, 9, 14)
const now = () => clock
const dns = new Map() // dominio → [valores TXT]
const checkDomain = async (domain, expected) => (dns.get(domain) || []).includes(expected) ? { ok: true } : { ok: false, reason: 'no-record' }
const paypal = {
  orders: new Map(),
  async createOrder ({ total, customId }) { const id = 'ORD' + randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(); this.orders.set(id, { total, customId, paid: false }); return { id, approveUrl: 'https://paypal.test/approve/' + id } },
  async captureOrder (id) { const o = this.orders.get(id); return o?.paid ? { status: 'COMPLETED', customId: o.customId, amount: o.total } : { status: 'PAYER_ACTION_REQUIRED', customId: null, amount: null } },
  pay (id) { this.orders.get(id).paid = true }
}

let dotrino, ana, beto, policy
test.before(async () => {
  ;[dotrino, ana, beto] = await Promise.all([account(), account(), account()])
  policy = { directoryAccount: dotrino.account, authorities: [dotrino.account] }
})
test.after(() => { for (const id of ids) id.destroy?.(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }) })

const open = (store = new Store()) => Directory.open({ store, signer: dotrino, policy, now, checkDomain, paypal })

test('el precio: USD 0,99 por año más el 15 % de IVA', () => {
  assert.deepEqual(priceFor(1), { subtotal: '0.99', tax: '0.15', total: '1.14' })
  assert.deepEqual(priceFor(10), { subtotal: '9.90', tax: '1.49', total: '11.39' })
  assert.throws(() => priceFor(0), { code: 'bad-years' })
})

test('un nombre gratuito: lo elige el directorio, resuelve, y la señal de vida lo mantiene', async () => {
  const d = await open()
  const { name } = await d.claimFree({ req: await req(ana, now(), { op: 'claim-free', account: ana.account }) })
  assert.match(name, /^[a-z]+-[a-z]+\.dotrino\.com$/)
  const r = await verifyResolution({ address: name, response: await d.resolve(name), policy, now: now() })
  assert.equal(r.account, ana.account); assert.equal(r.free, true)
  clock += 7 * DAY_MS
  const t = await d.touch({ req: await req(ana, now(), { op: 'touch', account: ana.account }) })
  assert.equal(t.name, name)
  const mine = await d.mine({ req: await req(ana, now(), { op: 'mine', account: ana.account }) })
  assert.deepEqual(mine.map((x) => x.name), [name])
})

test('cobrar: el recibo sale al capturar un pedido pagado, y vale para reservar', async () => {
  const d = await open()
  const { orderId, approveUrl, price } = await d.checkout({ years: 2 })
  assert.match(approveUrl, /^https:\/\/paypal\.test\//); assert.equal(price.total, '2.28')
  await assert.rejects(d.capture({ orderId }), { code: 'payment-not-completed' })
  paypal.pay(orderId)
  const receipt = await d.capture({ orderId })
  assert.equal(receipt.body.years, 2)
  assert.deepEqual(await d.capture({ orderId }), receipt, 'capturar dos veces da el mismo recibo')
  const h = (await import('@dotrino/names')).nameHash
  const { name, entry } = await d.claim({ name: 'Ana', req: await req(ana, now(), { op: 'claim', h: await h('ana'), account: ana.account }), receipt })
  assert.equal(name, 'ana.dotrino.com'); assert.equal(entry.kind, 'native')
  await assert.rejects(d.claim({ name: 'anita', req: await req(ana, now(), { op: 'claim', h: await h('anita'), account: ana.account }), receipt }), { code: 'replayed' })
})

test('un dominio real: solo con el TXT en el DNS, y se vuelve a mirar al renovar', async () => {
  const d = await open()
  const { nameHash } = await import('@dotrino/names')
  const rc = async () => { const { orderId } = await d.checkout({ years: 1 }); paypal.pay(orderId); return d.capture({ orderId }) }
  const h = await nameHash('empresa.com')
  await assert.rejects(d.claim({ name: 'empresa.com', req: await req(beto, now(), { op: 'claim', h, account: beto.account }), receipt: await rc() }), { code: 'no-domain-proof' })
  dns.set('empresa.com', [`dotrino-names=${beto.account}`])
  const { entry } = await d.claim({ name: 'empresa.com', req: await req(beto, now(), { op: 'claim', h, account: beto.account }), receipt: await rc() })
  assert.equal(entry.kind, 'domain'); assert.equal(entry.proof.kind, 'dns-txt')
  dns.delete('empresa.com')
  await assert.rejects(d.renew({ name: 'empresa.com', receipt: await rc() }), { code: 'no-domain-proof' })
})

test('subdominio por aparato, y se resuelve', async () => {
  const d = await open()
  const { nameHash } = await import('@dotrino/names')
  const { orderId } = await d.checkout({ years: 1 }); paypal.pay(orderId); const receipt = await d.capture({ orderId })
  const h = await nameHash('beto')
  await d.claim({ name: 'beto', req: await req(beto, now(), { op: 'claim', h, account: beto.account }), receipt })
  await d.sub({ name: 'beto', req: await req(beto, now(), { op: 'sub', h, sub: 'laptop', device: beto.device }) })
  const r = await verifyResolution({ address: 'laptop.beto', response: await d.resolve('laptop.beto'), policy, now: now() })
  assert.equal(r.device, beto.device)
})

test('arranca desde el disco igual que estaba, y el corte cierra el tramo', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'names-db-')), 'names.db')
  dirs.push(path.dirname(file))
  const d1 = await open(new Store(file))
  const { name } = await d1.claimFree({ req: await req(ana, now(), { op: 'claim-free', account: ana.account }) })
  const cp = await d1.closeSegment()
  assert.equal(cp.body.n, 0); assert.equal(cp.body.segmentSize, 1)
  await d1.touch({ req: await req(ana, now() + 7 * DAY_MS, { op: 'touch', account: ana.account }) }).catch(() => {})
  d1.store.db.close()
  const d2 = await open(new Store(file))
  assert.equal(d2.segment.n, 1)
  assert.equal(d2.checkpoint.body.n, 0)
  const r = await verifyResolution({ address: name, response: await d2.resolve(name), policy, now: now() })
  assert.equal(r.account, ana.account)
  d2.store.db.close()
})

test('por HTTP: version, resolve y los errores con su código', async () => {
  const d = await open()
  const srv = http.createServer(makeHandler({ directory: d, version: '0.0.0' }))
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  try {
    const v = await (await fetch(base + '/version')).json()
    assert.equal(v.protocol, 1)
    const nf = await fetch(base + '/resolve/nadie')
    assert.equal(nf.status, 404); assert.equal((await nf.json()).code, 'name-not-found')
    const cf = await fetch(base + '/claim-free', { method: 'POST', body: JSON.stringify({ req: await req(ana, now(), { op: 'claim-free', account: ana.account }) }) })
    assert.equal(cf.status, 200)
    const { name } = await cf.json()
    const res = await (await fetch(base + '/resolve/' + name)).json()
    assert.equal((await verifyResolution({ address: name, response: res, policy, now: now() })).account, ana.account)
    const bad = await fetch(base + '/claim', { method: 'POST', body: '{"name":"x"}' })
    assert.equal(bad.status, 400)
    assert.equal((await fetch(base + '/price?years=3')).status, 200)
  } finally { srv.close() }
})
