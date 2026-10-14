/**
 * Qué es un nombre válido (§5.3 del diseño): ASCII en minúsculas, `a-z`, `0-9` y `-`, de 3 a
 * 32 caracteres, sin `-` al principio, al final ni dos seguidos. Así no hay letras que se
 * confunden entre alfabetos.
 */
import { NamesError } from './errors.js'
import { sha256, toHex } from './hash.js'

const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Los que no se venden ni se asignan. Política del código (CONVENCIONES §14): cambia con una
 * versión nueva.
 */
export const RESERVED = Object.freeze(new Set([
  'dotrino', 'admin', 'administrator', 'root', 'support', 'help', 'security', 'abuse', 'postmaster',
  'names', 'vault', 'id', 'identity', 'proxy', 'store', 'content', 'profile', 'wiki', 'home',
  'chat', 'messenger', 'eco', 'trueque', 'here', 'qrshare', 'chess', 'cuarenta', 'ecuavoley', 'padel',
  'gymbro', 'diamonds', 'sudoku', 'critters', 'trivia', 'gridgame', 'favicon', 'mundial', 'pronostico',
  'wallet', 'terminal', 'facturero', 'reputation', 'geo', 'signer', 'results', 'tunnel', 'enterprise'
]))

/** Normaliza y valida. Lanza `invalid-name` o `reserved-name`. */
export function normalizeName (input) {
  if (typeof input !== 'string') throw new NamesError('invalid-name', 'name must be a string')
  const name = input.trim().toLowerCase()
  if (name.length < 3 || name.length > 32 || !SHAPE.test(name)) {
    throw new NamesError('invalid-name', `invalid name: ${JSON.stringify(input)}`)
  }
  if (RESERVED.has(name)) throw new NamesError('reserved-name', `reserved name: ${name}`)
  return name
}

/** `h` del registro: el hash del nombre, no el nombre (§3.1). */
export async function nameHash (input) {
  return toHex(await sha256('dotrino-names/v1:' + normalizeName(input)))
}
