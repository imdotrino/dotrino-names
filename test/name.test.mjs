import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeName, nameHash, addressCandidates, checkName, randomPair, pickFreeName, adjectives, nouns } from '../src/index.js'

test('se escribe corto y se guarda completo, con su clase', () => {
  assert.equal(normalizeName('  Blue-Cat '), 'blue-cat.dotrino.com')
  assert.equal(normalizeName('blue-cat.dotrino.com'), 'blue-cat.dotrino.com')
  assert.equal(normalizeName('Empresa.com'), 'empresa.com')
  assert.equal(checkName('blue-cat.dotrino.com'), 'native')
  assert.equal(checkName('empresa.com'), 'domain')
  assert.equal(checkName('dotrino.com'), 'domain', 'dotrino.com es un dominio: solo lo tiene quien lo prueba')
})

test('rechaza lo que no es un nombre', () => {
  for (const bad of ['ab', 'a'.repeat(33), '-cat', 'cat-', 'blue--cat', 'blue_cat', 'gatö', 'blue cat', 'аpple', 'empresa.c0m', 'x.dotrino.com', 'laptop.blue-cat.dotrino.com']) {
    assert.throws(() => normalizeName(bad), { code: 'invalid-name' }, bad)
  }
  assert.throws(() => normalizeName('Dotrino'), { code: 'reserved-name' })
})

test('un aparato va delante, y con un dominio real hay que preguntar las dos lecturas', () => {
  assert.deepEqual(addressCandidates('laptop.blue-cat.dotrino.com'), [{ name: 'blue-cat.dotrino.com', sub: 'laptop' }])
  assert.deepEqual(addressCandidates('laptop.empresa.com'), [{ name: 'laptop.empresa.com', sub: null }, { name: 'empresa.com', sub: 'laptop' }])
  assert.deepEqual(addressCandidates('blue-cat'), [{ name: 'blue-cat.dotrino.com', sub: null }])
  // Escrito corto con aparato. `laptop.blue-cat` no puede ser un dominio real (un TLD no lleva
  // guion), así que solo queda una lectura; `laptop.beto` sí podría serlo y se prueban las dos.
  assert.deepEqual(addressCandidates('laptop.blue-cat'), [{ name: 'blue-cat.dotrino.com', sub: 'laptop' }])
  assert.deepEqual(addressCandidates('laptop.beto'), [{ name: 'laptop.beto', sub: null }, { name: 'beto.dotrino.com', sub: 'laptop' }])
})

test('el hash no depende de mayúsculas ni espacios', async () => {
  assert.equal(await nameHash('Blue-Cat'), await nameHash('blue-cat '))
  assert.notEqual(await nameHash('blue-cat'), await nameHash('blue-dog'))
})

test('las listas no traen plurales ni palabras raras, y hay pares de sobra', () => {
  assert.ok(adjectives.length * nouns.length > 400000)
  for (const w of [...adjectives, ...nouns]) assert.match(w, /^[a-z]{3,10}$/)
  assert.ok(nouns.includes('apple') && !nouns.includes('apples'))
})

test('un par es adjetivo-sustantivo y con número si se pide', () => {
  const pair = randomPair()
  assert.match(pair, /\.dotrino\.com$/)
  const [a, n] = pair.split('.')[0].split('-')
  assert.ok(adjectives.includes(a) && nouns.includes(n))
  assert.match(randomPair({ suffix: true }), /^[a-z]+-[a-z]+-([2-9]|[1-9][0-9])\.dotrino\.com$/)
})

test('si los pares sin número están ocupados, saca uno con número; si no hay ninguno, lo dice', async () => {
  assert.match(await pickFreeName({ isTaken: async (n) => !/-\d+\.dotrino\.com$/.test(n) }), /-\d+\.dotrino\.com$/)
  await assert.rejects(pickFreeName({ isTaken: async () => true, tries: 3 }), { code: 'no-free-name' })
})
