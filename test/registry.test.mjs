import test from 'node:test'
import assert from 'node:assert/strict'
import { nameHash, matchesAccount, YEAR_MS, GRACE_MS, DAY_MS, INACTIVITY_MS, QUARANTINE_MS, emptyState, cloneState, stateProof, replaySegment, verifyResolution, checkpointBody, applyEntry, POLICY } from '../src/index.js'
import { account, cleanup, req, receipt, registry, sign } from './helpers.mjs'

const T0 = Date.UTC(2026, 9, 14)
let dir, ana, beto, auth

test.before(async () => { [dir, ana, beto, auth] = await Promise.all([account(), account(), account(), account()]) })
test.after(cleanup)

const claimFree = async (r, who, name, ts = T0) => r.add({ op: 'claim-free', ts, h: await nameHash(name), account: who.account, exp: ts + INACTIVITY_MS, free: true, kind: 'native', reqs: [await req(who, ts, { op: 'claim-free', account: who.account })] })
const claim = async (r, who, name, ts = T0, years = 1) => r.add({ op: 'claim', ts, h: await nameHash(name), account: who.account, exp: ts + years * YEAR_MS, kind: 'native', reqs: [await req(who, ts, { op: 'claim', h: await nameHash(name), account: who.account })], receipt: await receipt(dir, ts, years) })

test('sin saber quién firma como directorio no se da nada por bueno', async () => {
  await assert.rejects(applyEntry(emptyState(), { v: 1, op: 'expire', h: 'a'.repeat(64), ts: T0 }, { policy: { directoryAccount: null, authorities: [] } }), { code: 'no-policy' })
  assert.equal(POLICY.directoryAccount, '6729403e6024f4f71d5bdba1', 'la de producción es la cuenta de Dotrino')
})

test('el nombre gratuito: uno por cuenta, y no se cambia, no se suelta, no se traspasa', async () => {
  const r = await registry({ dir })
  await claimFree(r, ana, 'blue-cat')
  assert.equal(r.state.names.get(await nameHash('blue-cat')).free, true)
  await assert.rejects(claimFree(r, ana, 'red-dog'), { code: 'already-has-free' })
  const h = await nameHash('blue-cat')
  await assert.rejects(r.add({ op: 'release', ts: T0, h, reqs: [await req(ana, T0, { op: 'release', h })] }), { code: 'free-name-fixed' })
  await assert.rejects(r.add({ op: 'renew', ts: T0, h, account: ana.account, kind: 'native', receipt: await receipt(dir, T0) }), { code: 'free-name-fixed' })
  await assert.rejects(r.add({ op: 'transfer', ts: T0, h, account: beto.account }), { code: 'free-name-fixed' })
})

test('un nombre pagado: con recibo, un año por año pagado, y el recibo vale una vez', async () => {
  const r = await registry({ dir })
  const e = await claim(r, ana, 'ana', T0, 3)
  assert.equal(r.state.names.get(e.h).exp, T0 + 3 * YEAR_MS)
  await assert.rejects(claim(r, beto, 'ana'), { code: 'name-taken' })

  const h = await nameHash('anita')
  const rc = await receipt(dir, T0)
  await r.add({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + YEAR_MS, kind: 'native', reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: rc })
  const h2 = await nameHash('anaa')
  await assert.rejects(r.add({ op: 'claim', ts: T0, h: h2, account: ana.account, exp: T0 + YEAR_MS, kind: 'native', reqs: [await req(ana, T0, { op: 'claim', h: h2, account: ana.account })], receipt: rc }), { code: 'replayed' })
})

test('un recibo que no firmó el directorio no vale', async () => {
  const r = await registry({ dir })
  const h = await nameHash('gratis')
  await assert.rejects(r.add({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + YEAR_MS, kind: 'native', reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: await receipt(ana, T0) }), { code: 'bad-directory-signature' })
})

test('pedir a nombre de otra cuenta no vale', async () => {
  const r = await registry({ dir })
  const h = await nameHash('beto')
  await assert.rejects(r.add({ op: 'claim', ts: T0, h, account: beto.account, exp: T0 + YEAR_MS, kind: 'native', reqs: [await req(ana, T0, { op: 'claim', h, account: beto.account })], receipt: await receipt(dir, T0) }), { code: 'bad-request-signature' })
})

test('una entrada que no cuadra con las reglas no entra, y no toca el estado', async () => {
  const r = await registry({ dir })
  const h = await nameHash('ana')
  const before = cloneState(r.state)
  await assert.rejects(r.add({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + 2 * YEAR_MS, kind: 'native', reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: await receipt(dir, T0) }), { code: 'entry-mismatch' })
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
  await r.add({ op: 'transfer', ts, h, account: beto.account, exp, kind: 'native', reqs: [give, accept] })
  assert.equal(r.state.names.get(h).account, beto.account)
})

test('renovar, la gracia y el vencimiento', async () => {
  const r = await registry({ dir })
  const { h, exp } = await claim(r, ana, 'ana')
  // Antes de vencer lo puede pagar cualquiera, sin firma del dueño.
  await r.add({ op: 'renew', ts: T0 + DAY_MS, h, account: ana.account, exp: exp + YEAR_MS, kind: 'native', receipt: await receipt(dir, T0 + DAY_MS) })
  const exp2 = exp + YEAR_MS
  // Vencido, en la gracia: solo con la firma del dueño.
  const tg = exp2 + DAY_MS
  await assert.rejects(r.add({ op: 'renew', ts: tg, h, account: ana.account, exp: tg + YEAR_MS, kind: 'native', receipt: await receipt(dir, tg) }), { code: 'bad-request-signature' })
  await assert.rejects(r.add({ op: 'expire', ts: tg, h }), { code: 'not-expired' })
  // Pasada la gracia: ya no se renueva, se da por vencido y queda libre.
  const tx = exp2 + GRACE_MS + DAY_MS
  await assert.rejects(r.add({ op: 'renew', ts: tx, h, account: ana.account, exp: tx + YEAR_MS, kind: 'native', receipt: await receipt(dir, tx) }), { code: 'name-expired' })
  await r.add({ op: 'expire', ts: tx, h })
  assert.equal(r.state.names.has(h), false)
  await claim(r, beto, 'ana', tx)
})

test('solo una cuenta autoridad quita un nombre, y quien pierde su gratuito recibe otro', async () => {
  const r = await registry({ dir, authorities: [auth.account] })
  const { h } = await claimFree(r, ana, 'apple-store')
  const replacement = await nameHash('quiet-river')
  const fields = { op: 'seize', h, to: beto.account, reason: 'trademark' }
  await assert.rejects(r.add({ op: 'seize', ts: T0, h, account: beto.account, exp: T0 + YEAR_MS, kind: 'native', reason: 'trademark', replacement, reqs: [await req(ana, T0, fields)] }), { code: 'not-authority' })
  await r.add({ op: 'seize', ts: T0, h, account: beto.account, exp: T0 + YEAR_MS, kind: 'native', reason: 'trademark', replacement, reqs: [await req(auth, T0, fields)] })
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
  const viaCp = await verifyResolution({ address: 'ana', response: { name: 'ana.dotrino.com', checkpoint: cp, state: proof }, policy: r.policy, now })
  assert.equal(viaCp.account, ana.account)

  const e = await claim(r, beto, 'beto', now)
  const head = await r.head(now)
  const viaEntry = await verifyResolution({ address: 'beto', response: { name: 'beto.dotrino.com', head, entry: e, inclusion: await r.segment.inclusion(e.seq) }, policy: r.policy, now })
  assert.equal(viaEntry.account, beto.account)

  // La prueba de `ana` no sirve para `beto`, ni con la cuenta cambiada.
  await assert.rejects(verifyResolution({ address: 'beto', response: { name: 'beto.dotrino.com', checkpoint: cp, state: proof }, policy: r.policy, now }), { code: 'bad-resolution' })
  await assert.rejects(verifyResolution({ address: 'ana', response: { name: 'ana.dotrino.com', checkpoint: cp, state: { ...proof, leaf: { ...proof.leaf, account: beto.account } } }, policy: r.policy, now }), { code: 'bad-resolution' })
  // Un corte que no firmó el directorio.
  await assert.rejects(verifyResolution({ address: 'ana', response: { name: 'ana.dotrino.com', checkpoint: await sign(ana, cp.body), state: proof }, policy: r.policy, now }), { code: 'bad-directory-signature' })
  // Vencido no resuelve.
  await assert.rejects(verifyResolution({ address: 'ana', response: { name: 'ana.dotrino.com', checkpoint: cp, state: proof }, policy: r.policy, now: T0 + 2 * YEAR_MS }), { code: 'name-expired' })
})

const touch = async (r, who, name, ts) => r.add({ op: 'touch', ts, h: await nameHash(name), account: who.account, exp: ts + INACTIVITY_MS, free: true, kind: 'native', reqs: [await req(who, ts, { op: 'touch', account: who.account })] })

test('el gratuito se mantiene con señales de vida, como mucho una por semana', async () => {
  const r = await registry({ dir })
  const { h } = await claimFree(r, ana, 'blue-cat')
  await assert.rejects(touch(r, ana, 'blue-cat', T0 + DAY_MS), { code: 'too-soon' })
  await touch(r, ana, 'blue-cat', T0 + 7 * DAY_MS)
  await touch(r, ana, 'blue-cat', T0 + 30 * DAY_MS)
  assert.equal(r.state.names.get(h).exp, T0 + 60 * DAY_MS)
  // La señal la firma la cuenta del nombre, no otra.
  await assert.rejects(r.add({ op: 'touch', ts: T0 + 40 * DAY_MS, h, account: ana.account, exp: T0 + 70 * DAY_MS, free: true, kind: 'native', reqs: [await req(beto, T0 + 40 * DAY_MS, { op: 'touch', account: ana.account })] }), { code: 'bad-request-signature' })
})

test('un mes sin señal: caduca, queda guardado seis meses y su cuenta lo recupera', async () => {
  const r = await registry({ dir })
  const { h } = await claimFree(r, ana, 'blue-cat')
  await assert.rejects(r.add({ op: 'expire', ts: T0 + 29 * DAY_MS, h }), { code: 'not-expired' })
  const tx = T0 + 31 * DAY_MS
  await r.add({ op: 'expire', ts: tx, h, account: ana.account, exp: tx + QUARANTINE_MS, free: true, kind: 'native', held: true })
  // Guardado: no resuelve, nadie más lo toma, y la cuenta no puede llevarse otro en su lugar.
  await assert.rejects(touch(r, ana, 'blue-cat', tx + DAY_MS), { code: 'name-not-found' })
  await assert.rejects(claimFree(r, beto, 'blue-cat', tx + DAY_MS), { code: 'name-taken' })
  await assert.rejects(claimFree(r, ana, 'red-dog', tx + DAY_MS), { code: 'must-recover' })
  await claimFree(r, ana, 'blue-cat', tx + 2 * DAY_MS)
  assert.equal(r.state.names.get(h).held, undefined)
})

test('pasada la reserva el par vuelve a circular, y la cuenta vieja saca otro', async () => {
  const r = await registry({ dir })
  const { h } = await claimFree(r, ana, 'blue-cat')
  const tx = T0 + 31 * DAY_MS
  await r.add({ op: 'expire', ts: tx, h, account: ana.account, exp: tx + QUARANTINE_MS, free: true, kind: 'native', held: true })
  const later = tx + QUARANTINE_MS + DAY_MS
  await claimFree(r, beto, 'blue-cat', later)
  assert.equal(r.state.names.get(h).account, beto.account)
  assert.equal(r.state.freeOf.has(ana.account), false)
  await claimFree(r, ana, 'red-dog', later)
})

test('un gratuito caducado no resuelve', async () => {
  const r = await registry({ dir })
  await claimFree(r, ana, 'blue-cat')
  const cp = await r.checkpoint(T0)
  const proof = await stateProof(r.state, await nameHash('blue-cat'))
  assert.equal((await verifyResolution({ address: 'blue-cat', response: { name: 'blue-cat.dotrino.com', checkpoint: cp, state: proof }, policy: r.policy, now: T0 + DAY_MS })).free, true)
  await assert.rejects(verifyResolution({ address: 'blue-cat', response: { name: 'blue-cat.dotrino.com', checkpoint: cp, state: proof }, policy: r.policy, now: T0 + 31 * DAY_MS }), { code: 'name-expired' })
})

test('la política fija a Dotrino por el prefijo de su huella, y con menos de 96 bits no vale', () => {
  const id = '6729403e6024f4f71d5bdba1' + 'a'.repeat(40)
  assert.ok(matchesAccount(id, '6729403e6024f4f71d5bdba1'))
  assert.equal(matchesAccount(id, '6729403e6024'), false)
  assert.equal(matchesAccount('ff' + id.slice(2), '6729403e6024f4f71d5bdba1'), false)
})

const proofFor = (who, ts) => ({ kind: 'dns-txt', value: `dotrino-names=${who.account}`, ts })

test('un dominio real solo entra con la prueba de que es tuyo, y se vuelve a probar al renovar', async () => {
  const r = await registry({ dir })
  const h = await nameHash('empresa.com')
  const base = async (proof) => ({ op: 'claim', ts: T0, h, account: ana.account, exp: T0 + YEAR_MS, kind: 'domain', proof, reqs: [await req(ana, T0, { op: 'claim', h, account: ana.account })], receipt: await receipt(dir, T0) })
  await assert.rejects(r.add(await base(undefined)), { code: 'no-domain-proof' })
  await assert.rejects(r.add(await base(proofFor(beto, T0))), { code: 'bad-domain-proof' })
  await assert.rejects(r.add(await base(proofFor(ana, T0 - 2 * DAY_MS))), { code: 'bad-domain-proof' })
  await r.add(await base(proofFor(ana, T0)))
  const t = T0 + 100 * DAY_MS
  await assert.rejects(r.add({ op: 'renew', ts: t, h, account: ana.account, exp: T0 + 2 * YEAR_MS, kind: 'domain', receipt: await receipt(dir, t) }), { code: 'no-domain-proof' })
  await r.add({ op: 'renew', ts: t, h, account: ana.account, exp: T0 + 2 * YEAR_MS, kind: 'domain', proof: proofFor(ana, t), receipt: await receipt(dir, t) })
})

test('un gratuito siempre es de dotrino.com', async () => {
  const r = await registry({ dir })
  const ts = T0
  await assert.rejects(r.add({ op: 'claim-free', ts, h: await nameHash('empresa.com'), account: ana.account, exp: ts + INACTIVITY_MS, free: true, kind: 'domain', reqs: [await req(ana, ts, { op: 'claim-free', account: ana.account })] }), { code: 'bad-entry' })
})

const setSub = async (r, who, name, sub, device, ts = T0) => {
  const h = await nameHash(name)
  const rec = r.state.names.get(h)
  return r.add({ op: 'sub', ts, h, sub, device, account: rec.account, exp: rec.exp, free: rec.free, kind: rec.kind, reqs: [await req(who, ts, { op: 'sub', h, sub, device })] })
}

test('un subdominio por aparato: solo uno del acta, y se resuelve con el corte', async () => {
  const r = await registry({ dir })
  await claim(r, ana, 'ana')
  await assert.rejects(setSub(r, ana, 'ana', 'laptop', beto.device), { code: 'not-a-member' })
  await assert.rejects(setSub(r, beto, 'ana', 'laptop', beto.device), { code: 'bad-request-signature' })
  await setSub(r, ana, 'ana', 'laptop', ana.device)
  const h = await nameHash('ana')
  assert.deepEqual(r.state.names.get(h).subs, { laptop: ana.device })

  const cp = await r.checkpoint(T0)
  const state = await stateProof(r.state, h)
  const got = await verifyResolution({ address: 'laptop.ana.dotrino.com', response: { name: 'ana.dotrino.com', sub: 'laptop', checkpoint: cp, state }, policy: r.policy, now: T0 })
  assert.equal(got.device, ana.device)
  assert.equal(got.account, ana.account)
  await assert.rejects(verifyResolution({ address: 'phone.ana.dotrino.com', response: { name: 'ana.dotrino.com', sub: 'phone', checkpoint: cp, state }, policy: r.policy, now: T0 }), { code: 'sub-not-found' })

  // Se quita con `device: null`, y al traspasar el nombre los aparatos del dueño anterior se van.
  await setSub(r, ana, 'ana', 'laptop', null)
  assert.equal(r.state.names.get(h).subs, undefined)
  await setSub(r, ana, 'ana', 'laptop', ana.device)
  const ts = T0 + DAY_MS
  const rec = r.state.names.get(h)
  await r.add({ op: 'transfer', ts, h, account: beto.account, exp: rec.exp, kind: 'native', reqs: [await req(ana, ts, { op: 'transfer', h, to: beto.account }), await req(beto, ts, { op: 'accept', h, from: ana.account })] })
  assert.equal(r.state.names.get(h).subs, undefined)
})

test('resolver contra la cabecera de ahora: lleva la raíz del estado vigente', async () => {
  const r = await registry({ dir })
  await claim(r, ana, 'ana')
  const head = await r.head(T0)
  const got = await verifyResolution({ address: 'ana', response: { name: 'ana.dotrino.com', head, state: await stateProof(r.state, await nameHash('ana')) }, policy: r.policy, now: T0 })
  assert.equal(got.account, ana.account)
})
