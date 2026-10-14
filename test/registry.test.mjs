import test from 'node:test'
import assert from 'node:assert/strict'
import { nameHash, YEAR_MS, GRACE_MS, DAY_MS, emptyState, cloneState, stateProof, replaySegment, verifyResolution, checkpointBody, applyEntry, POLICY } from '../src/index.js'
import { account, cleanup, req, receipt, registry, sign } from './helpers.mjs'

const T0 = Date.UTC(2026, 9, 14)
let dir, ana, beto, auth

test.before(async () => { [dir, ana, beto, auth] = await Promise.all([account(), account(), account(), account()]) })
test.after(cleanup)

const claimFree = async (r, who, name, ts = T0) => r.add({ op: 'claim-free', ts, h: await nameHash(name), account: who.account, free: true, reqs: [await req(who, ts, { op: 'claim-free', account: who.account })] })
const claim = async (r, who, name, ts = T0, years = 1) => r.add({ op: 'claim', ts, h: await nameHash(name), account: who.account, exp: ts + years * YEAR_MS, reqs: [await req(who, ts, { op: 'claim', h: await nameHash(name), account: who.account })], receipt: await receipt(dir, ts, years) })

test('sin política de producción no se da nada por bueno', async () => {
  await assert.rejects(applyEntry(emptyState(), { v: 1, op: 'expire', h: 'a'.repeat(64), ts: T0 }, { policy: POLICY }), { code: 'no-policy' })
})

test('el nombre gratuito: uno por cuenta, y no se cambia, no se suelta, no se traspasa', async () => {
  const r = await registry({ dir })
  await claimFree(r, ana, 'blue-cat')
  assert.equal(r.state.names.get(await nameHash('blue-cat')).free, true)
  await assert.rejects(claimFree(r, ana, 'red-dog'), { code: 'already-has-free' })
  const h = await nameHash('blue-cat')
  await assert.rejects(r.add({ op: 'release', ts: T0, h, reqs: [await req(ana, T0, { op: 'release', h })] }), { code: 'free-name-fixed' })
  await assert.rejects(r.add({ op: 'renew', ts: T0, h, account: ana.account, receipt: await receipt(dir, T0) }), { code: 'free-name-fixed' })
  await assert.rejects(r.add({ op: 'transfer', ts: T0, h, account: beto.account }), { code: 'free-name-fixed' })
})

test('un nombre pagado: con recibo, un año por año pagado, y el recibo vale una vez', async () => {
  const r = await registry({ dir })
  const e = await claim(r, ana, 'ana', T0, 3)
  assert.equal(r.state.names.get(e.h).exp, T0 + 3 * YEAR_MS)
  await assert.rejects(claim(r, beto, 'ana'), { code: 'name-taken' })

  const h = await nameHash('anita')
  const rc = await receipt(dir, T0)
  await r.add({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + YEAR_MS, reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: rc })
  const h2 = await nameHash('anaa')
  await assert.rejects(r.add({ op: 'claim', ts: T0, h: h2, account: ana.account, exp: T0 + YEAR_MS, reqs: [await req(ana, T0, { op: 'claim', h: h2, account: ana.account })], receipt: rc }), { code: 'replayed' })
})

test('un recibo que no firmó el directorio no vale', async () => {
  const r = await registry({ dir })
  const h = await nameHash('gratis')
  await assert.rejects(r.add({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + YEAR_MS, reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: await receipt(ana, T0) }), { code: 'bad-directory-signature' })
})

test('pedir a nombre de otra cuenta no vale', async () => {
  const r = await registry({ dir })
  const h = await nameHash('beto')
  await assert.rejects(r.add({ op: 'claim', ts: T0, h, account: beto.account, exp: T0 + YEAR_MS, reqs: [await req(ana, T0, { op: 'claim', h, account: beto.account })], receipt: await receipt(dir, T0) }), { code: 'bad-request-signature' })
})

test('una entrada que no cuadra con las reglas no entra, y no toca el estado', async () => {
  const r = await registry({ dir })
  const h = await nameHash('ana')
  const before = cloneState(r.state)
  await assert.rejects(r.add({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + 2 * YEAR_MS, reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: await receipt(dir, T0) }), { code: 'entry-mismatch' })
  assert.deepEqual(r.state, before)
  assert.equal(r.segment.size, 0)
})

test('traspasar exige la firma de los dos', async () => {
  const r = await registry({ dir })
  const { h, exp } = await claim(r, ana, 'ana')
  const ts = T0 + DAY_MS
  const give = await req(ana, ts, { op: 'transfer', h, to: beto.account })
  await assert.rejects(r.add({ op: 'transfer', ts, h, account: beto.account, exp, reqs: [give] }), { code: 'bad-request-signature' })
  const accept = await req(beto, ts, { op: 'accept', h, from: ana.account })
  await r.add({ op: 'transfer', ts, h, account: beto.account, exp, reqs: [give, accept] })
  assert.equal(r.state.names.get(h).account, beto.account)
})

test('renovar, la gracia y el vencimiento', async () => {
  const r = await registry({ dir })
  const { h, exp } = await claim(r, ana, 'ana')
  // Antes de vencer lo puede pagar cualquiera, sin firma del dueño.
  await r.add({ op: 'renew', ts: T0 + DAY_MS, h, account: ana.account, exp: exp + YEAR_MS, receipt: await receipt(dir, T0 + DAY_MS) })
  const exp2 = exp + YEAR_MS
  // Vencido, en la gracia: solo con la firma del dueño.
  const tg = exp2 + DAY_MS
  await assert.rejects(r.add({ op: 'renew', ts: tg, h, account: ana.account, exp: tg + YEAR_MS, receipt: await receipt(dir, tg) }), { code: 'bad-request-signature' })
  await assert.rejects(r.add({ op: 'expire', ts: tg, h }), { code: 'not-expired' })
  // Pasada la gracia: ya no se renueva, se da por vencido y queda libre.
  const tx = exp2 + GRACE_MS + DAY_MS
  await assert.rejects(r.add({ op: 'renew', ts: tx, h, account: ana.account, exp: tx + YEAR_MS, receipt: await receipt(dir, tx) }), { code: 'name-expired' })
  await r.add({ op: 'expire', ts: tx, h })
  assert.equal(r.state.names.has(h), false)
  await claim(r, beto, 'ana', tx)
})

test('solo una cuenta autoridad quita un nombre, y quien pierde su gratuito recibe otro', async () => {
  const r = await registry({ dir, authorities: [auth.account] })
  const { h } = await claimFree(r, ana, 'apple-store')
  const replacement = await nameHash('quiet-river')
  const fields = { op: 'seize', h, to: beto.account, reason: 'trademark' }
  await assert.rejects(r.add({ op: 'seize', ts: T0, h, account: beto.account, exp: T0 + YEAR_MS, reason: 'trademark', replacement, reqs: [await req(ana, T0, fields)] }), { code: 'not-authority' })
  await r.add({ op: 'seize', ts: T0, h, account: beto.account, exp: T0 + YEAR_MS, reason: 'trademark', replacement, reqs: [await req(auth, T0, fields)] })
  assert.equal(r.state.names.get(h).account, beto.account)
  assert.equal(r.state.freeOf.get(ana.account), replacement)
  assert.equal(r.state.names.get(replacement).account, ana.account)
})

test('un testigo repite el tramo y llega al mismo corte; si algo cambió, lo ve', async () => {
  const r = await registry({ dir })
  await claimFree(r, ana, 'blue-cat')
  await claim(r, beto, 'beto')
  const cp = await r.checkpoint(T0 + DAY_MS)
  const { state } = await replaySegment({ prevCheckpoint: null, prevState: emptyState(), entries: r.segment.entries, checkpoint: cp, policy: r.policy, now: T0 + DAY_MS })
  assert.deepEqual([...state.names], [...r.state.names])

  // El directorio enseña un tramo sin la segunda entrada: el corte ya no sale.
  await assert.rejects(replaySegment({ prevCheckpoint: null, prevState: emptyState(), entries: r.segment.entries.slice(0, 1), checkpoint: cp, policy: r.policy, now: T0 }), { code: 'checkpoint-mismatch' })
  // Un corte con otro estado, aunque lo firme el directorio: tampoco.
  const forged = await sign(dir, { ...await checkpointBody({ segment: r.segment, state: r.state, ts: T0 }), stateRoot: '0'.repeat(64) })
  await assert.rejects(replaySegment({ prevCheckpoint: null, prevState: emptyState(), entries: r.segment.entries, checkpoint: forged, policy: r.policy, now: T0 }), { code: 'checkpoint-mismatch' })
})

test('resolver: por el corte o por una entrada posterior, y con todo comprobado', async () => {
  const r = await registry({ dir })
  await claim(r, ana, 'ana')
  const cp = await r.checkpoint(T0)
  const now = T0 + DAY_MS
  const proof = await stateProof(r.state, await nameHash('ana'))
  const viaCp = await verifyResolution({ name: 'ana', response: { checkpoint: cp, state: proof }, policy: r.policy, now })
  assert.equal(viaCp.account, ana.account)

  const e = await claim(r, beto, 'beto', now)
  const head = await r.head(now)
  const viaEntry = await verifyResolution({ name: 'beto', response: { head, entry: e, inclusion: await r.segment.inclusion(e.seq) }, policy: r.policy, now })
  assert.equal(viaEntry.account, beto.account)

  // La prueba de `ana` no sirve para `beto`, ni con la cuenta cambiada.
  await assert.rejects(verifyResolution({ name: 'beto', response: { checkpoint: cp, state: proof }, policy: r.policy, now }), { code: 'bad-resolution' })
  await assert.rejects(verifyResolution({ name: 'ana', response: { checkpoint: cp, state: { ...proof, leaf: { ...proof.leaf, account: beto.account } } }, policy: r.policy, now }), { code: 'bad-resolution' })
  // Un corte que no firmó el directorio.
  await assert.rejects(verifyResolution({ name: 'ana', response: { checkpoint: await sign(ana, cp.body), state: proof }, policy: r.policy, now }), { code: 'bad-directory-signature' })
  // Vencido no resuelve.
  await assert.rejects(verifyResolution({ name: 'ana', response: { checkpoint: cp, state: proof }, policy: r.policy, now: T0 + 2 * YEAR_MS }), { code: 'name-expired' })
})
