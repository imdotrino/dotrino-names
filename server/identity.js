/**
 * La identidad del directorio: un aparato del acta de Dotrino, enrolado por el camino estándar
 * de los agentes headless (`@dotrino/remote-agent/link`), como el bot social. Firma como aparato
 * con `sign` (cabeceras, cortes, recibos) y lee SOLO su cajón de secretos (`vault:secrets:names`:
 * la credencial de PayPal). Se empareja con `dotrino-vault pair --service names --scope sign`.
 *
 * La firma lleva la CADENA de actas (`chain`): es lo que `verifySignedFor` necesita para
 * comprobar que el aparato es miembro con `sign` de la cuenta del directorio.
 */
import { loadLink, clientLink, dataDir, renewLink, refreshChain, enroll } from '@dotrino/remote-agent/link'
import { waitForSecrets } from '@dotrino/vault/service'
import { formatDeviceInfo, deviceInfo } from '@dotrino/vault/device-info'

export const NS = 'names'
export const LABEL = 'names'

export function identityDir () { return process.env.NAMES_DIR || dataDir('dotrino-names') }

export async function enrollDirectory (invite, { dir = identityDir() } = {}) {
  return enroll({ qr: invite, dir, label: LABEL, ns: NS })
}

export function info ({ dir = identityDir(), json = false } = {}) {
  const i = deviceInfo({ dir })
  return json ? JSON.stringify(i, null, 2) : formatDeviceInfo(i)
}

/** @returns {Promise<{ signData:(d:object)=>Promise<{signature,publickey,chain}>, secretsArgs:object, device:string }>} */
export async function loadDirectoryIdentity ({ dir = identityDir(), log = console.log } = {}) {
  const raw = loadLink(dir)
  if (!raw?.device?.privateJwk) {
    throw Object.assign(new Error(`not enrolled: run \`dotrino-names enroll <invite>\` (dir ${dir})`), { code: 'not-enrolled' })
  }
  if (!raw.enc?.privateJwk) throw Object.assign(new Error('this link has no encryption key: enroll again'), { code: 'no-enc' })
  const r = await renewLink(raw, { dir })
  if (r.renewed) log(`[identity] cert renewed · acta #${r.seq}`)
  else if (r.reason && r.reason !== 'not due') log(`[identity] cert not renewed: ${r.reason}`)
  // LA CADENA DE SELLADORES, para firmar a nombre de la cuenta ante un extraño: sin ella
  // cabeceras, cortes y recibos no pasan `verifySignedFor`. Se pide al arrancar y se
  // refresca una vez al día; si no se puede, se dice y se para, porque firmar sin ella es
  // firmar algo que nadie va a aceptar.
  const chain = await refreshChain(raw, { dir })
  if (!chain.ok) throw Object.assign(new Error(`could not get the sealer chain of the directory account: ${chain.reason}`), { code: 'no-chain' })
  log(`[identity] sealer chain at acta #${chain.seq}`)
  setInterval(() => refreshChain(raw, { dir }).then((r) => { if (!r.ok) log(`[identity] sealer chain not refreshed: ${r.reason}`) }), 24 * 60 * 60 * 1000).unref()
  const link = clientLink(raw, { dir })
  return {
    device: raw.device.publickey,
    signData: (data) => link.id.signData(data),
    secretsArgs: { ns: NS, proxyUrl: link.proxy, masterPubkey: raw.iss, device: raw.device, cert: raw.cert, enc: raw.enc }
  }
}

/** Los secretos del cajón `names`. Espera a la bóveda: sin ella no se cobra. */
export async function loadSecrets (identity, { log = console.log } = {}) {
  return waitForSecrets({ ...identity.secretsArgs, onRetry: (e, ms) => log(`[vault] ${e.message}; retry in ${Math.round(ms / 1000)}s`) })
}
