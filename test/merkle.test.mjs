import test from 'node:test'
import assert from 'node:assert/strict'
import { leafHash, root, inclusionProof, verifyInclusion, consistencyProof, verifyConsistency } from '../src/merkle.js'

const enc = new TextEncoder()
const leaves = async (n) => Promise.all(Array.from({ length: n }, (_, i) => leafHash(enc.encode('leaf ' + i))))

test('la raíz vacía es el hash de nada, y la de una hoja es la hoja', async () => {
  assert.equal(await root([]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  const [a] = await leaves(1)
  assert.equal(await root([a]), a)
})

test('toda hoja de todo tamaño hasta 33 se prueba, y una prueba tocada no', async () => {
  for (let n = 1; n <= 33; n++) {
    const L = await leaves(n)
    const r = await root(L)
    for (let m = 0; m < n; m++) {
      const proof = await inclusionProof(m, L)
      assert.ok(await verifyInclusion({ index: m, size: n, leaf: L[m], proof, root: r }), `n=${n} m=${m}`)
      // Otra hoja en el mismo sitio u otro sitio: no. (Un tamaño mentido no hace falta probarlo:
      // la cabecera firma tamaño y raíz juntos, y con otro tamaño la raíz es otra.)
      assert.equal(await verifyInclusion({ index: m, size: n, leaf: L[(m + 1) % n], proof, root: r }), n === 1 ? true : false)
      if (n > 1) assert.equal(await verifyInclusion({ index: (m + 1) % n, size: n, leaf: L[m], proof, root: r }), false)
    }
  }
})

test('cada árbol es el principio del siguiente, y uno cambiado no lo es', async () => {
  for (let n = 1; n <= 20; n++) {
    const L = await leaves(n)
    const second = await root(L)
    for (let m = 1; m <= n; m++) {
      const first = await root(L.slice(0, m))
      const proof = await consistencyProof(m, L)
      assert.ok(await verifyConsistency({ firstSize: m, secondSize: n, firstRoot: first, secondRoot: second, proof }), `m=${m} n=${n}`)
      if (m < n) {
        // Si el árbol viejo tenía otra hoja, el nuevo ya no lo contiene.
        const altered = [...L.slice(0, m - 1), await leafHash(enc.encode('other')), ...L.slice(m)]
        assert.equal(await verifyConsistency({ firstSize: m, secondSize: n, firstRoot: await root(altered.slice(0, m)), secondRoot: second, proof }), false)
      }
    }
  }
})
