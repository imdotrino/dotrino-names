/**
 * Qué es un nombre (§5.3 del diseño). Hay dos clases, y las dos se guardan COMPLETAS:
 *
 *   · **propio del directorio**: `blue-cat.dotrino.com`. Una sola etiqueta delante de
 *     `.dotrino.com`, de 3 a 32 caracteres. Se puede escribir corto (`blue-cat`).
 *   · **de un dominio real**: `empresa.com`. Solo con prueba de que el dominio es de esa
 *     cuenta (un registro TXT), para que nadie se quede con el nombre de otro (dueño,
 *     2026-10-14). Así `dotrino.com` solo lo tiene Dotrino.
 *
 * Delante de cualquiera de los dos va, si se quiere, el **aparato**: `laptop.blue-cat.dotrino.com`,
 * `laptop.empresa.com`. El nombre entero entra en el hash, así que dos clases nunca chocan.
 *
 * Una etiqueta: ASCII en minúsculas, `a-z`, `0-9` y `-`, sin `-` al principio, al final ni dos
 * seguidos. Así no hay letras que se confunden entre alfabetos.
 */
import { NamesError } from './errors.js'
import { sha256, toHex } from './hash.js'

export const DOMAIN = 'dotrino.com'

const LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TLD = /^[a-z]{2,63}$/

/**
 * Los nombres propios del directorio que no se dan. Política del código (CONVENCIONES §14):
 * cambia con una versión nueva.
 */
export const RESERVED = Object.freeze(new Set([
  'dotrino', 'admin', 'administrator', 'root', 'support', 'help', 'security', 'abuse', 'postmaster',
  'names', 'vault', 'id', 'identity', 'proxy', 'proxy2', 'store', 'content', 'profile', 'wiki', 'home', 'www',
  'chat', 'messenger', 'eco', 'trueque', 'here', 'qrshare', 'chess', 'cuarenta', 'ecuavoley', 'padel',
  'gymbro', 'diamonds', 'sudoku', 'critters', 'trivia', 'gridgame', 'favicon', 'mundial', 'pronostico',
  'wallet', 'terminal', 'facturero', 'reputation', 'geo', 'signer', 'results', 'tunnel', 'enterprise',
  'goat', 'index', 'app', 'api', 'mail', 'pass', 's', 'r', 'p', 'c'
]))

const bad = (input) => new NamesError('invalid-name', `invalid name: ${JSON.stringify(input)}`)

/** Una etiqueta válida de entre `min` y `max` caracteres. */
export function isLabel (s, min = 1, max = 63) {
  return typeof s === 'string' && s.length >= min && s.length <= max && LABEL.test(s)
}

/** ¿Es un nombre propio del directorio (`x.dotrino.com`)? */
export const isNative = (name) => name.endsWith('.' + DOMAIN) && name.split('.').length === 3

/** Valida un nombre COMPLETO, sin aparato delante, y dice de qué clase es. */
export function checkName (name) {
  if (typeof name !== 'string' || name.length > 253) throw bad(name)
  const labels = name.split('.')
  if (labels.length < 2 || !labels.every((l) => isLabel(l)) || !TLD.test(labels[labels.length - 1])) throw bad(name)
  if (name.endsWith('.' + DOMAIN)) {
    if (labels.length !== 3) throw bad(name)   // `laptop.blue-cat.dotrino.com` es un aparato, no un nombre
    if (!isLabel(labels[0], 3, 32)) throw bad(name)
    if (RESERVED.has(labels[0])) throw new NamesError('reserved-name', `reserved name: ${labels[0]}`)
    return 'native'
  }
  return 'domain'
}

/** Lo que escribe una persona, en minúsculas y con `.dotrino.com` si lo escribió corto. */
function expand (input) {
  if (typeof input !== 'string') throw bad(input)
  const s = input.trim().toLowerCase().replace(/\.$/, '')
  return s.includes('.') ? s : `${s}.${DOMAIN}`
}

/** Un nombre completo y válido, sin aparato: `blue-cat` → `blue-cat.dotrino.com`. */
export function normalizeName (input) {
  const name = expand(input)
  checkName(name)
  return name
}

/**
 * Qué se puede querer decir con lo escrito: `[{ name, sub }]`, en el orden en que hay que
 * buscarlo. `laptop.empresa.com` puede ser el nombre `laptop.empresa.com` o el aparato
 * `laptop` de `empresa.com`, y solo el registro sabe cuál existe; con `.dotrino.com` no hay
 * duda.
 */
export function addressCandidates (input) {
  const full = expand(input)
  const out = []
  const tryOne = (name, sub) => {
    try { checkName(name); out.push({ name, sub }) } catch (e) { if (e.code === 'reserved-name' && !out.length) throw e }
  }
  if (full.endsWith('.' + DOMAIN) && full.split('.').length === 4) {
    const [sub, ...rest] = full.split('.')
    if (isLabel(sub, 1, 32)) tryOne(rest.join('.'), sub)
  } else {
    tryOne(full, null)
    const [sub, ...rest] = full.split('.')
    if (rest.length >= 2 && isLabel(sub, 1, 32) && !(rest.join('.') === DOMAIN)) tryOne(rest.join('.'), sub)
  }
  if (!out.length) throw bad(input)
  return out
}

/** `h` del registro: el hash del nombre completo, no el nombre (§3.1). */
export async function nameHash (input) {
  return toHex(await sha256('dotrino-names/v1:' + normalizeName(input)))
}
