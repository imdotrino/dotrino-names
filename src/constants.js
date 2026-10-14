/** Para quién se firma todo lo de este registro (`aud`): una firma para otro servicio no vale aquí. */
export const AUDIENCE = 'https://names.dotrino.com'

/** Versión del formato de las entradas, los cortes y las cabeceras. */
export const FORMAT_V = 1

/** El protocolo del cable (CONVENCIONES §14): sube solo cuando cambia lo que se intercambia. */
export const PROTOCOL = 1

export const DAY_MS = 24 * 60 * 60 * 1000
/** Un año de nombre pagado (§6 del diseño). */
export const YEAR_MS = 365 * DAY_MS
/** Tras vencer, el nombre no resuelve pero solo el dueño lo puede renovar. */
export const GRACE_MS = 30 * DAY_MS
/** Cuánto vale una petición firmada: pasado esto, se tiene que firmar otra. */
export const REQUEST_TTL_MS = DAY_MS
/** Cuánto vale un recibo de pago sin canjear. */
export const RECEIPT_TTL_MS = 30 * DAY_MS
/** Cuántos tramos mensuales se conservan; los cortes se conservan todos (§3.4). */
export const RETAINED_SEGMENTS = 12
