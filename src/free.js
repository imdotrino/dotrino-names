/**
 * El nombre gratuito (§5.1 del diseño): un adjetivo y un sustantivo en inglés, `blue-cat`.
 *
 * Lo ASIGNA el directorio, al azar entre los pares libres; no se calcula de la huella de la
 * cuenta. Con ~20 bits, un nombre derivado de la huella se repetiría a partir de unas mil
 * cuentas y cualquiera podría fabricar una cuenta que cayera en el par de otra.
 */
import adjectives from './words/adjectives.js'
import nouns from './words/nouns.js'
import { normalizeName } from './name.js'
import { NamesError } from './errors.js'

export { adjectives, nouns }

/** Un entero uniforme en [0, n), sin el sesgo del módulo. */
function uniform (n, random) {
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    random(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

const defaultRandom = (buf) => globalThis.crypto.getRandomValues(buf)

/** Un par al azar; con `suffix`, además un número del 2 al 99 (`blue-cat-7`). */
export function randomPair ({ suffix = false, random = defaultRandom } = {}) {
  const name = adjectives[uniform(adjectives.length, random)] + '-' + nouns[uniform(nouns.length, random)]
  return normalizeName(suffix ? `${name}-${2 + uniform(98, random)}` : name)
}

/**
 * Busca un par libre. `isTaken(name)` lo responde quien tiene el registro. Primero sin número;
 * si tras `tries` intentos todos estaban ocupados, con número.
 */
export async function pickFreeName ({ isTaken, tries = 32, random = defaultRandom } = {}) {
  if (typeof isTaken !== 'function') throw new TypeError('isTaken is required')
  for (const suffix of [false, true]) {
    for (let i = 0; i < tries; i++) {
      const name = randomPair({ suffix, random })
      if (!(await isTaken(name))) return name
    }
  }
  throw new NamesError('no-free-name', 'could not find a free name')
}
