/**
 * Pedir algo a Dotrino desde la página, FIRMADO con la identidad: el mismo camino que el
 * «Solicita una app» del home (`feedback.dotrino.com`, el Worker `@dotrino/feedback`).
 * Firma `{ op: 'app-request', text, ts }`, que es lo que el Worker verifica; sin firma no
 * se manda (`code: 'unsigned'`), para que no lleguen correos que nadie pueda atribuir.
 */
export const FEEDBACK_URL = 'https://feedback.dotrino.com'

export async function sendRequest (identity, { text, app, locale }) {
  const unsigned = (why) => Object.assign(new Error(`request: ${why}`), { code: 'unsigned' })
  const pubkey = identity?.me?.publickey || ''
  if (!identity || !pubkey) throw unsigned('no identity on this page')
  const ts = Date.now()
  const s = await identity.signData({ op: 'app-request', text, ts })
  const signature = (typeof s === 'string' ? s : s?.signature) || ''
  if (!signature) throw unsigned('the identity returned no signature')
  const res = await fetch(FEEDBACK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, app, locale, pubkey, nickname: identity.me?.nickname || '', ts, signature })
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error(`request: the server answered ${res.status}`), { code: body?.error || 'send-failed' })
  }
}
