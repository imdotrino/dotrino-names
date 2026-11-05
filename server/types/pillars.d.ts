// Los pilares que usa el servidor no publican tipos: aquí se declara SOLO lo que se usa,
// con la forma que tiene su código (@dotrino/pay 0.1.0, verifier 0.3.0, update 0.7.0,
// remote-agent 0.32.1, vault 0.116.0).

declare module '@dotrino/pay' {
  export interface Price { subtotal: string, tax: string, total: string }
  export function priceWithTax (args: { unitCents: number, quantity?: number, taxPercent: number }): Price
  export interface PaypalClient {
    provider: 'paypal'
    live: boolean
    createOrder (args: Price & { description: string, customId: string, returnUrl: string, cancelUrl: string }): Promise<{ id: string, approveUrl: string }>
    captureOrder (id: string): Promise<{ status: string, customId: string | null, amount: string | null }>
  }
  export function paypalClient (args: { clientId: string, secret: string, live?: boolean, fetch?: typeof fetch }): PaypalClient
}

declare module '@dotrino/verifier' {
  export function verifyDnsTxt (args: { domain: string, expected: string, resolveTxt?: ((domain: string) => Promise<string[][]>) | null }): Promise<{ ok: boolean, reason?: string }>
}

declare module '@dotrino/update/deps' {
  export function watchDependencies (args: {
    dir: string
    match?: RegExp
    name?: string
    log?: (line: string) => void
    onNewer?: (r: { pkg: string, version: string, current: string }) => void
  }): () => void
}

declare module '@dotrino/remote-agent/link' {
  export interface Link {
    iss: string
    cert?: { seq?: number } & Record<string, unknown>
    proxy?: string
    device?: { publickey?: string, privateJwk?: unknown }
    enc?: { privateJwk?: unknown } & Record<string, unknown>
  }
  export interface Signature { signature: string, publickey: string, chain?: unknown[] }
  export function dataDir (name?: string): string
  export function loadLink (dir?: string): Link | null
  export function clientLink (link: Link, opts?: { dir?: string }): { id: { signData (data: object): Promise<Signature> }, cert: unknown, iss: string, proxy: string }
  export function renewLink (link: Link, opts?: { dir?: string, force?: boolean }): Promise<{ renewed: boolean, seq?: number | null, reason?: string }>
  export function refreshChain (link: Link, opts?: { dir?: string }): Promise<{ ok: true, seq: number, self?: boolean } | { ok: false, reason: string }>
  export function enroll (args: { qr: string, label?: string, dir?: string, ns?: string | null, onChallenge?: (c: unknown) => void, timeoutMs?: number }): Promise<Link>
}

declare module '@dotrino/vault/service' {
  export function waitForSecrets (args: {
    ns: string
    proxyUrl: string
    masterPubkey: string
    device: unknown
    cert: unknown
    enc: unknown
    dir?: string
    retryMs?: number
    maxRetryMs?: number
    onRetry?: (e: Error, ms: number) => void
  }): Promise<Record<string, string>>
}

declare module '@dotrino/vault/device-info' {
  export function deviceInfo (link: { device?: { publickey?: string }, cert?: object, iss?: string, proxy?: string }, extra?: Record<string, unknown>): Promise<Record<string, unknown>>
  export function formatDeviceInfo (info: Record<string, unknown>): string
}
