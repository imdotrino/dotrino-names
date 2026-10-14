import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Identity } from '@dotrino/identity/node'
import { AUDIENCE, FORMAT_V, REQUEST_TTL_MS, RECEIPT_TTL_MS, applyEntry, emptyState, Segment, checkpointBody, accountId, pubkeyId } from '../src/index.js'

const dirs = []
const ids = []

/** Una identidad de usar y tirar: `account` (huella de la cuenta) y `device` (huella de su aparato). */
export async function account () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'names-'))
  dirs.push(dir)
  const id = await Identity.connect({ dir })
  ids.push(id)
  const { profileId, publickey } = await id.signData({ aud: AUDIENCE, probe: true })
  return { id, account: await accountId(profileId), device: await pubkeyId(publickey) }
}

export function cleanup () {
  for (const id of ids) id.destroy?.()
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
}

export async function sign (who, body) {
  const s = await who.id.signData(body)
  return { body, signature: s.signature, publickey: s.publickey, chain: s.chain }
}

/** Una petición firmada por `who`, válida en `ts`. */
export const req = (who, ts, fields) => sign(who, { v: FORMAT_V, aud: AUDIENCE, iat: ts, exp: ts + REQUEST_TTL_MS, nonce: randomUUID(), ...fields })

/** Un recibo de pago firmado por el directorio. */
export const receipt = (dir, ts, years = 1) => sign(dir, { v: FORMAT_V, aud: AUDIENCE, kind: 'receipt', id: randomUUID(), years, iat: ts, exp: ts + RECEIPT_TTL_MS })

/**
 * Un directorio de prueba: estado + tramo abierto. `add` hace lo que hará el servidor —
 * aplicar las reglas y, si pasan, añadir la entrada al tramo.
 */
export async function registry ({ dir, authorities = [] }) {
  const policy = { directoryAccount: dir.account, authorities }
  const r = {
    policy,
    state: emptyState(),
    segment: await Segment.after(null),
    async add (fields) {
      const entry = { v: FORMAT_V, seq: r.segment.nextSeq, prev: r.segment.head, account: null, exp: null, free: false, kind: null, ...fields }
      await applyEntry(r.state, entry, { policy })
      await r.segment.append(entry)
      return entry
    },
    async checkpoint (ts) { return sign(dir, await checkpointBody({ segment: r.segment, state: r.state, ts })) },
    async head (ts) { return sign(dir, await r.segment.headBody(ts)) }
  }
  return r
}
