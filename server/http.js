/**
 * La cara HTTP del directorio. JSON por dentro, sin sesiones ni cookies: cada cosa que cambia
 * algo trae su petición firmada, y resolver es público.
 *
 *   GET  /version                      { product, version, protocol }
 *   GET  /resolve/<dirección>          cabecera firmada + prueba (para `verifyResolution`)
 *   GET  /checkpoints?from=N           los cortes firmados desde N (para los testigos)
 *   GET  /checkpoint/<n>               un corte
 *   GET  /segment/<n>                  las entradas de un tramo (para repetirlo)
 *   GET  /head                         la cabecera firmada del tramo abierto
 *   GET  /price?years=N                cuánto cuesta
 *   POST /mine          { req }        mis nombres
 *   POST /claim-free    { req }        un nombre gratuito
 *   POST /claim         { name, req, receipt }
 *   POST /renew         { name, req?, receipt }
 *   POST /transfer      { name, give, accept }
 *   POST /release       { name, req }
 *   POST /touch         { req }
 *   POST /sub           { name, req }
 *   POST /seize         { name, req }
 *   POST /checkout      { years }      → { orderId, approveUrl, price }
 *   POST /capture       { orderId }    → el recibo firmado
 *
 * Los errores van con su `code` (el contrato), nunca solo con la frase.
 */
import { PROTOCOL, NamesError } from '@dotrino/names'
import { priceFor } from './directory.js'

const MAX_BODY = 256 * 1024

const readJson = (req) => new Promise((resolve, reject) => {
  let b = ''
  req.on('data', (c) => { b += c; if (b.length > MAX_BODY) { reject(new NamesError('body-too-large', 'body too large')); req.destroy() } })
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}) } catch (_) { reject(new NamesError('bad-json', 'body is not JSON')) } })
  req.on('error', reject)
})

const STATUS = {
  'name-not-found': 404, 'sub-not-found': 404, 'order-not-found': 404, 'entry-not-found': 404,
  'name-taken': 409, 'already-has-free': 409, 'must-recover': 409, 'replayed': 409, 'too-soon': 429,
  'bad-request-signature': 401, 'bad-directory-signature': 401, 'not-authority': 403,
  'payments-unavailable': 503, 'domain-check-failed': 502, 'paypal-error': 502,
  'body-too-large': 413
}

export function makeHandler ({ directory, version, product = '@dotrino/names-server', log = () => {} }) {
  const json = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' })
    res.end(JSON.stringify(obj))
  }
  const routes = {
    'POST /mine': (b) => directory.mine(b),
    'POST /claim-free': (b) => directory.claimFree(b),
    'POST /claim': (b) => directory.claim(b),
    'POST /renew': (b) => directory.renew(b),
    'POST /transfer': (b) => directory.transfer(b),
    'POST /release': (b) => directory.release(b),
    'POST /touch': (b) => directory.touch(b),
    'POST /sub': (b) => directory.sub(b),
    'POST /seize': (b) => directory.seize(b),
    'POST /checkout': (b) => directory.checkout({ years: b.years }),
    'POST /capture': (b) => directory.capture({ orderId: String(b.orderId || '') })
  }

  return async function handle (req, res) {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    try {
      if (req.method === 'OPTIONS') return json(res, 204, {})
      if (req.method === 'GET') {
        if (path === '/version') return json(res, 200, { product, version, protocol: PROTOCOL })
        if (path === '/head') return json(res, 200, await directory.head())
        if (path === '/price') return json(res, 200, priceFor(Number(url.searchParams.get('years') || 1)))
        if (path === '/checkpoints') return json(res, 200, directory.store.checkpointsFrom(Number(url.searchParams.get('from') || 0)))
        let m
        if ((m = path.match(/^\/resolve\/([a-z0-9.-]{1,253})$/i))) return json(res, 200, await directory.resolve(decodeURIComponent(m[1])))
        if ((m = path.match(/^\/checkpoint\/(\d+)$/))) {
          const cp = directory.store.checkpoint(Number(m[1]))
          return cp ? json(res, 200, cp) : json(res, 404, { code: 'checkpoint-not-found' })
        }
        if ((m = path.match(/^\/segment\/(\d+)$/))) {
          const n = Number(m[1])
          const entries = n === directory.segment.n ? directory.segment.entries : directory.store.entriesOf(n)
          return json(res, 200, { n, entries })
        }
        return json(res, 404, { code: 'not-found' })
      }
      if (req.method === 'POST') {
        const fn = routes[`POST ${path}`]
        if (!fn) return json(res, 404, { code: 'not-found' })
        return json(res, 200, await fn(await readJson(req)))
      }
      return json(res, 405, { code: 'method-not-allowed' })
    } catch (e) {
      const code = e?.code || 'internal'
      if (code === 'internal' || code === 'paypal-error' || code === 'domain-check-failed') log(`[names] ${req.method} ${path}: ${e?.stack || e}`)
      return json(res, STATUS[code] || (code === 'internal' ? 500 : 400), { code, error: code === 'internal' ? 'internal error' : e.message })
    }
  }
}
