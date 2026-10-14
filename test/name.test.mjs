import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeName, nameHash, randomPair, pickFreeName, adjectives, nouns } from '../src/index.js'

test('normaliza a minúsculas y rechaza lo que no es un nombre', () => {
  assert.equal(normalizeName('  Blue-Cat '), 'blue-cat')
  for (const bad of ['ab', 'a'.repeat(33), '-cat', 'cat-', 'blue--cat', 'blue_cat', 'gatö', 'blue cat', 'аpple']) {
    assert.throws(() => normalizeName(bad), { code: 'invalid-name' }, bad)
  }
  assert.throws(() => normalizeName('Dotrino'), { code: 'reserved-name' })
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
  const [a, n] = randomPair().split('-')
  assert.ok(adjectives.includes(a) && nouns.includes(n))
  assert.match(randomPair({ suffix: true }), /^[a-z]+-[a-z]+-([2-9]|[1-9][0-9])$/)
})

test('si los pares sin número están ocupados, saca uno con número; si no hay ninguno, lo dice', async () => {
  assert.match(await pickFreeName({ isTaken: async (n) => !/-\d+$/.test(n) }), /-\d+$/)
  await assert.rejects(pickFreeName({ isTaken: async () => true, tries: 3 }), { code: 'no-free-name' })
})
