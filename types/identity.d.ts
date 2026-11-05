// @dotrino/identity no publica tipos para estos subpaths: aquí se declara SOLO lo que usa
// este repo, con la forma que tiene el código del pilar (vault/assertion.js, vault/keyid.js,
// vault/core.js).
declare module '@dotrino/identity/assertion' {
  export type SignedForResult =
    | { ok: true, profileId: string, signer: string, seq: number, aud: string }
    | { ok: false, reason: string }
  export function verifySignedFor (args: {
    data: unknown
    signature: string
    publickey: string
    chain?: unknown
    audience: string
    expectedProfileId?: string | null
    ns?: string | null
    now?: number
    maxSkewMs?: number
  }): Promise<SignedForResult>
  export function signedFor (
    identity: { signData (d: object): Promise<{ signature: string, publickey: string, chain?: unknown[] }> },
    opts: { aud: string, fields?: object, ttlMs?: number, now?: number }
  ): Promise<{ body: { aud: string } & Record<string, unknown>, signature: string, publickey: string, chain: unknown[] }>
}

declare module '@dotrino/identity/keyid' {
  export function pubkeyId (publicJwkStr: string): Promise<string>
  export function keyLabel (publicJwkStr: string): Promise<string>
}

declare module '@dotrino/identity/vault/core.js' {
  export function canonicalStringify (v: unknown): string
}
