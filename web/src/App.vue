<script setup>
/**
 * La página del directorio: lo que una cuenta puede hacer con sus nombres. Es una pantalla
 * ADMINISTRATIVA (CONVENCIONES §5.1): listas, estado y botones; lo que explica va en el wiki.
 *
 * Nada aquí tiene sesión: cada acción se firma con el perfil del navegador (`signData` del
 * pilar) y el directorio comprueba la firma contra el acta de la cuenta.
 */
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { Identity } from '@dotrino/identity'
import { pubkeyId } from '@dotrino/identity/keyid'
import { Store } from '@dotrino/store'
import { get, post, signedRequest, nameHash, ApiError } from './api.js'
import { INACTIVITY_MS, TOUCH_INTERVAL_MS } from '@dotrino/names/constants'
import { detectLang, messages } from './i18n.js'
import { sendRequest } from './feedback.js'
import { noDonations } from '@dotrino/support/policy'

// Dentro de la app iOS no se cobra nada: ni reservar, ni renovar, ni pedir otra forma de pago.
// App Review no admite vender un servicio digital fuera de In-App Purchase (3.1.1, 2026-10-15).
// La regla la decide @dotrino/support, la pieza de monetización del ecosistema.
const noPay = noDonations()

const PENDING_KEY = 'names.pending' // el cobro a medias mientras se va y se vuelve de PayPal
const PROFILE_URL = 'https://profile.dotrino.com/'
const WIKI_URL = 'https://wiki.dotrino.com/desarrollo/servicios/'

const lang = ref(detectLang())
const t = computed(() => messages[lang.value])
const onLang = (e) => { const l = e.detail?.lang; if (l === 'es' || l === 'en') lang.value = l }
watchEffect(() => { document.documentElement.lang = lang.value })

// ----- quién soy -----
const identity = ref(null)
const account = ref(null) // la huella de la cuenta (lo que el directorio llama `account`)
const devices = ref([]) // [{ id, label }] los aparatos del acta, para los nombres por aparato
const phase = ref('loading') // loading | no-profile | ready
const topbar = ref(null)

async function connect () {
  phase.value = 'loading'
  try {
    const id = await Identity.connect()
    const chain = await id.sealerChain()
    if (!Array.isArray(chain) || !chain.length) { phase.value = 'no-profile'; return }
    identity.value = id
    account.value = await pubkeyId(chain[0].profileId)
    const head = chain[chain.length - 1]
    devices.value = await Promise.all((head.members || []).map(async (m) => ({ id: await pubkeyId(m.pub), label: m.label || m.cn || '' })))
    if (topbar.value) {
      topbar.value.identity = id
      Store.connect({ identity: id }).then((s) => { if (topbar.value) topbar.value.store = s }).catch(() => {})
    }
    phase.value = 'ready'
  } catch (e) {
    console.warn('[names] identity:', e)
    phase.value = 'no-profile'
  }
}

// ----- mis nombres -----
const names = ref([])
const busy = ref(false)
const notice = ref(null) // { kind: 'ok' | 'error', text }
const say = (kind, text) => { notice.value = { kind, text } }
const retryUrl = ref(null) // PayPal rechazó el medio de pago: el mismo pedido, a elegir otro
const errorText = (e) => t.value.errors[e?.code] || (e instanceof ApiError ? e.message : null) || t.value.errors.generic

const fmtDate = (ts) => new Intl.DateTimeFormat(lang.value, { dateStyle: 'medium' }).format(new Date(ts))
const shortName = (n) => n.replace(/\.dotrino\.com$/, '')
const freeName = computed(() => names.value.find((n) => n.free) || null)
const canAskFree = computed(() => !freeName.value)

async function loadMine () {
  const req = await signedRequest(identity.value, { op: 'mine', account: account.value })
  const list = await post('/mine', { req })
  names.value = list.sort((a, b) => (a.free === b.free ? a.name.localeCompare(b.name) : a.free ? -1 : 1))
  // La señal de vida del nombre gratis. Solo si la última entró hace más de lo que el directorio
  // exige entre dos (`TOUCH_INTERVAL_MS`): la fecha de vencimiento dice cuándo fue la última.
  const f = names.value.find((n) => n.free && !n.held)
  if (f && Date.now() - (f.exp - INACTIVITY_MS) >= TOUCH_INTERVAL_MS) {
    post('/touch', { req: await signedRequest(identity.value, { op: 'touch', account: account.value }) }).catch(() => {})
  }
}

async function act (fn) {
  busy.value = true
  notice.value = null
  retryUrl.value = null
  try { await fn(); await loadMine() } catch (e) { console.warn('[names]', e); say('error', errorText(e)) } finally { busy.value = false }
}

async function askFree () {
  await act(async () => {
    const req = await signedRequest(identity.value, { op: 'claim-free', account: account.value })
    const r = await post('/claim-free', { req })
    say('ok', `${t.value.free.got} ${r.name}`)
  })
}

async function release (n) {
  await act(async () => {
    const req = await signedRequest(identity.value, { op: 'release', h: n.h })
    await post('/release', { name: n.name, req })
    releasing.value = null
  })
}
const releasing = ref(null)

// ----- aparatos con nombre -----
const subForm = ref({}) // h → { label, device }
const deviceLabel = (id) => devices.value.find((d) => d.id === id)?.label || t.value.name.unknownDevice
async function addSub (n) {
  const f = subForm.value[n.h] || {}
  await act(async () => {
    const req = await signedRequest(identity.value, { op: 'sub', h: n.h, sub: String(f.label || '').trim().toLowerCase(), device: f.device || null })
    await post('/sub', { name: n.name, req })
    subForm.value[n.h] = { label: '', device: '' }
  })
}
async function removeSub (n, sub) {
  await act(async () => {
    const req = await signedRequest(identity.value, { op: 'sub', h: n.h, sub, device: null })
    await post('/sub', { name: n.name, req })
  })
}

// ----- reservar (pagar) -----
const wanted = ref('')
const years = ref(1)
const check = ref(null) // { name, kind, available } | { error }
const checking = ref(false)
const price = ref(null)
let checkTimer = null
watch(wanted, (v) => {
  check.value = null
  clearTimeout(checkTimer)
  const s = v.trim().toLowerCase()
  if (!s) return
  checkTimer = setTimeout(async () => {
    checking.value = true
    try { check.value = await get('/check/' + encodeURIComponent(s)) } catch (e) { check.value = { error: e.code } } finally { checking.value = false }
  }, 350)
})
watch(years, async (y) => {
  price.value = null
  if (Number.isInteger(y) && y >= 1 && y <= 100) price.value = await get('/price?years=' + y).catch(() => null)
}, { immediate: true })
const canPay = computed(() => check.value?.available && price.value && !busy.value)

async function checkout (action, name, y) {
  await act(async () => {
    const r = await post('/checkout', { years: y })
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ orderId: r.orderId, name, years: y, action, approveUrl: r.approveUrl })) } catch (_) {}
    location.href = r.approveUrl
  })
}
const renewYears = ref({}) // h → años

/** La vuelta de PayPal: `/paid?token=<pedido>`. Se captura, se canjea el recibo y se registra. */
async function finishPayment () {
  const token = new URLSearchParams(location.search).get('token')
  if (!token) { try { sessionStorage.removeItem(PENDING_KEY) } catch (_) {} return false }
  history.replaceState(null, '', './')
  let pending = null
  try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') } catch (_) {}
  if (!pending || pending.orderId !== token) { say('error', t.value.paid.lost); return true }
  say('ok', t.value.paid.working)
  await act(async () => {
    let receipt
    try { receipt = await post('/capture', { orderId: token }) } catch (e) {
      // El medio de pago no pasó: el pedido sigue vivo en PayPal y se vuelve a él con otro.
      // El cobro a medias se queda guardado para esa vuelta.
      if (e?.code === 'payment-declined' && pending.approveUrl) { retryUrl.value = pending.approveUrl; try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending)) } catch (_) {} }
      throw e
    }
    const h = await nameHash(pending.name)
    if (pending.action === 'renew') {
      const req = await signedRequest(identity.value, { op: 'renew', h })
      const r = await post('/renew', { name: pending.name, req, receipt })
      say('ok', t.value.paid.renewed(r.name))
    } else {
      const req = await signedRequest(identity.value, { op: 'claim', h, account: account.value })
      const r = await post('/claim', { name: pending.name, req, receipt })
      say('ok', t.value.paid.claimed(r.name))
    }
    try { sessionStorage.removeItem(PENDING_KEY) } catch (_) {}
  })
  return true
}

// ----- otra forma de pago: se pide a Dotrino, firmado, como «Solicita una app» en el home -----
const payMethod = ref('')
const payState = ref('idle') // idle | sending | sent | error
async function askPayMethod () {
  const text = payMethod.value.trim()
  if (!text || payState.value === 'sending') return
  payState.value = 'sending'
  try {
    await sendRequest(identity.value, { text: `Otra forma de pago: ${text}`, app: 'names', locale: lang.value })
    payState.value = 'sent'
  } catch (e) { console.warn('[names] pay-method request', e?.code || '', e?.message || e); payState.value = 'error' }
}

// ----- versiones (§14): la de la página y la del servidor que está corriendo -----
const pageCommit = document.querySelector('meta[name=commit]')?.content || 'dev'
const serverVersion = ref('')
get('/version').then((v) => { serverVersion.value = v.version }).catch(() => {})

onMounted(async () => {
  await connect()
  if (phase.value !== 'ready') return
  // Si se volvió de PayPal, `finishPayment` ya cargó los nombres y dejó su aviso en
  // pantalla; otra pasada de `act` lo borraría («Listo: … es tuyo» desaparecía).
  if (await finishPayment()) return
  await act(async () => {})
})
</script>

<template>
  <dotrino-topbar ref="topbar" brand="Nombres" icon="./icon.svg" brand-href="https://dotrino.com/" no-back profile theme
    support-repo="imdotrino/dotrino-names" support-discord="https://discord.gg/D648uq7cth"
    :lang.attr="lang" @dotrino-lang="onLang"></dotrino-topbar>

  <main class="wrap">
    <h1>{{ t.title }}</h1>
    <p class="intro">{{ noPay ? t.introFree : t.intro }}</p>

    <p v-if="phase === 'loading'" class="muted" data-testid="loading">{{ t.loading }}</p>

    <section v-else-if="phase === 'no-profile'" class="card" data-testid="no-profile">
      <p>{{ t.needProfile }}</p>
      <p class="row">
        <a class="btn" :href="PROFILE_URL">{{ t.openProfile }}</a>
        <button class="btn ghost" @click="connect">{{ t.retry }}</button>
      </p>
    </section>

    <template v-else>
      <p v-if="notice" :class="['notice', notice.kind]" data-testid="notice" role="status">{{ notice.text }}
        <a v-if="retryUrl" :href="retryUrl" class="btn" data-testid="retry-paypal">{{ t.paid.retry }}</a></p>

      <section class="card" data-testid="mine">
        <h2>{{ t.mine.title }} <button class="btn small ghost" :disabled="busy" @click="act(async () => {})" data-testid="refresh">{{ t.mine.refresh }}</button></h2>
        <p v-if="!names.length" class="muted">{{ t.mine.none }}</p>
        <article v-for="n in names" :key="n.h" class="name" :data-name="n.name" data-testid="name">
          <header>
            <strong>{{ n.name }}</strong>
            <span v-if="n.free || !noPay" class="tag">{{ n.free ? t.name.free : n.kind === 'domain' ? t.name.domain : t.name.paid }}</span>
          </header>
          <p class="muted">
            <template v-if="n.held">{{ t.name.held }} {{ fmtDate(n.exp) }}</template>
            <template v-else>{{ n.free ? t.name.until : t.name.expires }} {{ fmtDate(n.exp) }}</template>
          </p>

          <p v-if="n.held" class="row">
            <button class="btn" :disabled="busy" @click="askFree" data-testid="recover">{{ t.name.recover }}</button>
          </p>

          <template v-else>
            <div v-if="!n.free" class="row wrap-row">
              <template v-if="!noPay">
                <label>{{ t.name.renewYears }} <input type="number" min="1" max="100" v-model.number="renewYears[n.h]" :placeholder="1" data-testid="renew-years" /></label>
                <button class="btn" :disabled="busy" @click="checkout('renew', n.name, Number(renewYears[n.h]) || 1)" data-testid="renew">{{ t.name.renew }}</button>
              </template>
              <template v-if="releasing === n.h">
                <span class="warn">{{ t.name.releaseSure }}</span>
                <button class="btn danger" :disabled="busy" @click="release(n)" data-testid="release-yes">{{ t.name.releaseYes }}</button>
                <button class="btn ghost" @click="releasing = null">{{ t.name.cancel }}</button>
              </template>
              <button v-else class="btn ghost" :disabled="busy" @click="releasing = n.h" data-testid="release">{{ t.name.release }}</button>
            </div>

            <details class="devices" data-testid="devices">
              <summary>{{ t.name.devices }} ({{ Object.keys(n.subs || {}).length }})</summary>
              <p class="muted small">{{ t.name.devicesText.replace('{name}', n.name) }}</p>
              <ul v-if="n.subs && Object.keys(n.subs).length">
                <li v-for="(dev, sub) in n.subs" :key="sub" :data-sub="sub">
                  <code>{{ sub }}.{{ n.name }}</code> → {{ deviceLabel(dev) }}
                  <button class="btn small ghost" :disabled="busy" @click="removeSub(n, sub)" data-testid="sub-remove">{{ t.name.remove }}</button>
                </li>
              </ul>
              <p v-else class="muted small">{{ t.name.noDevices }}</p>
              <div class="row wrap-row">
                <input v-model="(subForm[n.h] ||= { label: '', device: '' }).label" :placeholder="t.name.deviceLabel" maxlength="32" data-testid="sub-label" />
                <select v-model="subForm[n.h].device" data-testid="sub-device">
                  <option value="">{{ t.name.pick }}</option>
                  <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.label || d.id.slice(0, 8) }}</option>
                </select>
                <button class="btn" :disabled="busy || !subForm[n.h].label || !subForm[n.h].device" @click="addSub(n)" data-testid="sub-add">{{ t.name.addDevice }}</button>
              </div>
            </details>
          </template>
        </article>
      </section>

      <section v-if="canAskFree" class="card" data-testid="free">
        <h2>{{ t.free.title }}</h2>
        <p>{{ t.free.text }}</p>
        <button class="btn" :disabled="busy" @click="askFree" data-testid="ask-free">{{ t.free.button }}</button>
      </section>

      <section v-if="!noPay" class="card" data-testid="reserve">
        <h2>{{ t.reserve.title }}</h2>
        <p>{{ t.reserve.text }}</p>
        <div class="row wrap-row">
          <input v-model="wanted" :placeholder="t.reserve.placeholder" autocomplete="off" spellcheck="false" data-testid="wanted" />
          <label>{{ t.reserve.years }} <input type="number" min="1" max="100" v-model.number="years" data-testid="years" /></label>
        </div>
        <p class="muted" data-testid="check">
          <template v-if="checking">{{ t.reserve.checking }}</template>
          <template v-else-if="check?.error === 'reserved-name'">{{ t.reserve.reserved }}</template>
          <template v-else-if="check?.error">{{ t.reserve.invalid }}</template>
          <template v-else-if="check">
            <code>{{ check.name }}</code> {{ check.available ? t.reserve.available : t.reserve.taken }}
          </template>
        </p>
        <p v-if="check?.available && check.kind === 'domain'" class="hint">
          {{ t.reserve.domainHint }}
          <code data-testid="txt-value">dotrino-names={{ account }}</code>
        </p>
        <p v-if="price" class="price" data-testid="price">{{ t.reserve.price(price) }}</p>
        <button class="btn" :disabled="!canPay" @click="checkout('claim', check.name, years)" data-testid="pay">{{ busy ? t.reserve.paying : t.reserve.pay }}</button>
      </section>

      <section v-if="!noPay" class="card" data-testid="pay-method">
        <h2>{{ t.payMethod.title }}</h2>
        <form class="row wrap-row" @submit.prevent="askPayMethod">
          <input v-model="payMethod" :placeholder="t.payMethod.placeholder" maxlength="200" :disabled="payState === 'sending' || payState === 'sent'" data-testid="pay-method-input" />
          <button type="submit" class="btn" :disabled="!payMethod.trim() || payState === 'sending' || payState === 'sent'" data-testid="pay-method-send">{{ payState === 'sending' ? t.payMethod.sending : t.payMethod.send }}</button>
        </form>
        <p v-if="payState === 'sent'" class="notice ok" role="status" data-testid="pay-method-notice">{{ t.payMethod.sent }}</p>
        <p v-else-if="payState === 'error'" class="notice error" role="status" data-testid="pay-method-notice">{{ t.payMethod.failed }}</p>
      </section>
    </template>

    <footer class="muted small">
      <a :href="WIKI_URL">{{ t.footer.wiki }}</a> · {{ t.footer.page }} {{ pageCommit }}<template v-if="serverVersion"> · {{ t.footer.server }} {{ serverVersion }}</template>
    </footer>
  </main>
</template>
