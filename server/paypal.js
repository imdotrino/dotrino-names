/**
 * PayPal, por la API de pedidos (Orders v2) y por REDIRECCIÓN: el usuario aprueba el pago en
 * paypal.com y vuelve. En la página no se carga NADA de PayPal (la regla de nada de
 * JavaScript de terceros, `CLAUDE.md`).
 *
 * A PayPal le llega el importe, una descripción fija y un número de un solo uso
 * (`custom_id`). Ni el nombre ni la cuenta.
 */
const BASES = { live: 'https://api-m.paypal.com', sandbox: 'https://api-m.sandbox.paypal.com' }

export function paypalClient ({ clientId, secret, live = false, fetch = globalThis.fetch }) {
  if (!clientId || !secret) throw new Error('paypal: clientId and secret are required')
  const base = live ? BASES.live : BASES.sandbox
  let token = null

  async function call (path, { method = 'GET', body, auth } = {}) {
    const headers = { 'content-type': 'application/json' }
    if (auth) headers.authorization = auth
    else headers.authorization = `Bearer ${await accessToken()}`
    const res = await fetch(base + path, { method, headers, body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (_) { data = { raw: text } }
    if (!res.ok) {
      // PayPal pone el motivo real en `details[].issue` (INSTRUMENT_DECLINED, ORDER_NOT_APPROVED…);
      // `message` es siempre la misma frase genérica. Un rechazo del medio de pago es del
      // comprador, no del servidor: lleva su propio código para que la página lo diga y
      // le mande de vuelta a PayPal a elegir otro.
      const issue = data?.details?.[0]?.issue || null
      const declined = issue === 'INSTRUMENT_DECLINED'
      throw Object.assign(new Error(`paypal ${method} ${path}: ${res.status} ${issue || data?.name || ''} ${declined ? '' : data?.message || ''}`.trim()), { code: declined ? 'payment-declined' : 'paypal-error', issue, status: res.status })
    }
    return data
  }

  async function accessToken () {
    if (token && token.until > Date.now()) return token.value
    const auth = 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64')
    const res = await fetch(base + '/v1/oauth2/token', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.access_token) throw Object.assign(new Error(`paypal token: ${res.status}`), { code: 'paypal-error', status: res.status })
    token = { value: data.access_token, until: Date.now() + Math.max(0, (data.expires_in - 60) * 1000) }
    return token.value
  }

  return {
    /** @returns {Promise<{ id:string, approveUrl:string }>} */
    async createOrder ({ subtotal, tax, total, description, customId, returnUrl, cancelUrl }) {
      const data = await call('/v2/checkout/orders', {
        method: 'POST',
        body: {
          intent: 'CAPTURE',
          purchase_units: [{
            description,
            custom_id: customId,
            amount: { currency_code: 'USD', value: total, breakdown: { item_total: { currency_code: 'USD', value: subtotal }, tax_total: { currency_code: 'USD', value: tax } } }
          }],
          payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' } } }
        }
      })
      const approveUrl = (data.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href
      if (!data.id || !approveUrl) throw Object.assign(new Error('paypal: order without approval link'), { code: 'paypal-error' })
      return { id: data.id, approveUrl }
    },

    /** @returns {Promise<{ status:string, customId:string|null, amount:string|null }>} */
    async captureOrder (id) {
      if (!/^[A-Z0-9]{6,40}$/.test(id)) throw Object.assign(new Error('paypal: bad order id'), { code: 'bad-order' })
      const data = await call(`/v2/checkout/orders/${id}/capture`, { method: 'POST', body: '{}' })
      const unit = data.purchase_units?.[0]
      const cap = unit?.payments?.captures?.[0]
      return { status: cap?.status || data.status, customId: cap?.custom_id ?? unit?.custom_id ?? null, amount: cap?.amount?.value ?? null }
    }
  }
}
