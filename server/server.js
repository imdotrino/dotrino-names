#!/usr/bin/env node
/**
 * dotrino-names — el servidor del directorio de nombres (`names.dotrino.com`).
 *
 *   dotrino-names serve              arranca (PORT, NAMES_DB, NAMES_DIR, NAMES_PUBLIC_URL, NAMES_WEB)
 *   dotrino-names enroll <invite>    se empareja con la bóveda de Dotrino
 *   dotrino-names info [--json]      qué aparato es (CONVENCIONES §15.1)
 *
 * Sin la bóveda no se cobra: la credencial de PayPal sale del cajón `names`. Resolver y lo
 * firmado por cuentas funciona igual, porque la llave del aparato está en el enlace.
 */
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyDnsTxt } from '@dotrino/verifier'
import { watchForUpdate } from '@dotrino/update'
import { Store } from './store.js'
import { Directory } from './directory.js'
import { paypalClient } from './paypal.js'
import { makeHandler } from './http.js'
import { loadDirectoryIdentity, loadSecrets, enrollDirectory, info } from './identity.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const log = (...a) => console.log(new Date().toISOString(), ...a)
const [cmd = 'serve', arg] = process.argv.slice(2)

// Un fallo con código se dice en una línea, no con una pila: «not enrolled» es un estado, no un bug.
const die = (e) => { console.error(`dotrino-names: ${e.message}${e.code ? ` (${e.code})` : ''}`); process.exit(1) }

if (cmd === 'info') {
  console.log(await info({ json: process.argv.includes('--json') }).catch(die))
} else if (cmd === 'enroll') {
  if (!arg) { console.error('usage: dotrino-names enroll <invite>'); process.exit(2) }
  const link = await enrollDirectory(arg).catch(die)
  console.log(`enrolled as a device of the directory account (${link.iss.slice(0, 16)}…)`)
} else if (cmd === 'serve') {
  const identity = await loadDirectoryIdentity({ log }).catch(die)
  const store = new Store(process.env.NAMES_DB || 'names.db')
  const publicUrl = process.env.NAMES_PUBLIC_URL || 'https://names.dotrino.com'
  const directory = await Directory.open({
    store, signer: identity, publicUrl, log,
    checkDomain: (domain, expected) => verifyDnsTxt({ domain, expected })
  })
  // La página: `web/dist` del repo (se construye con `npm run build` en `web/`), o NAMES_WEB.
  const webDir = process.env.NAMES_WEB || fileURLToPath(new URL('../web/dist/', import.meta.url))
  if (!existsSync(webDir)) log(`[names] no page at ${webDir}: only the API is served`)
  const handler = makeHandler({ directory, version: pkg.version, product: pkg.name, webDir: existsSync(webDir) ? webDir : null, log })
  const port = Number(process.env.PORT || 8094)
  http.createServer(handler).listen(port, '127.0.0.1', () => log(`[names] listening on 127.0.0.1:${port}`))

  // Los cobros: en cuanto la bóveda entregue la credencial. Hasta entonces, `payments-unavailable`.
  loadSecrets(identity, { log }).then((s) => {
    if (!s.PAYPAL_CLIENT_ID || !s.PAYPAL_SECRET) return log('[names] no PAYPAL_CLIENT_ID/PAYPAL_SECRET in drawer "names": payments stay off')
    directory.paypal = paypalClient({ clientId: s.PAYPAL_CLIENT_ID, secret: s.PAYPAL_SECRET, live: s.PAYPAL_LIVE === '1' })
    log(`[names] payments on (${s.PAYPAL_LIVE === '1' ? 'live' : 'sandbox'})`)
  }).catch((e) => log(`[names] secrets: ${e.message}`))

  // Lo que corre solo: vencimientos cada hora; un corte al cambiar de mes (UTC).
  const sweep = () => directory.sweep().then((n) => n && log(`[names] expired ${n}`)).catch((e) => log(`[names] sweep: ${e.message}`))
  setInterval(sweep, 60 * 60 * 1000).unref()
  sweep()
  const monthOf = (ts) => new Date(ts).toISOString().slice(0, 7)
  let month = monthOf(Date.now())
  setInterval(() => {
    const m = monthOf(Date.now())
    if (m === month) return
    month = m
    directory.closeSegment().catch((e) => log(`[names] checkpoint: ${e.message}`))
  }, 60 * 1000).unref()
  if (!directory.checkpoint) directory.closeSegment().catch((e) => log(`[names] first checkpoint: ${e.message}`))

  watchForUpdate({ name: pkg.name, version: pkg.version, log }).catch?.(() => {})
} else {
  console.error('usage: dotrino-names serve | enroll <invite> | info [--json]')
  process.exit(2)
}
