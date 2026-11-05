/**
 * Lo que contesta el directorio a la página (`server/http.js`), en un solo sitio.
 *
 * @typedef {{ subtotal: string, tax: string, total: string }} Price
 *
 * @typedef {import('@dotrino/names/types').NameRecord & { name: string, h: string }} MineName
 *   un nombre de la cuenta, con su nombre en claro (`POST /mine`). El directorio guarda el nombre
 *   en claro con cada entrada que crea un nombre, así que viene siempre.
 *
 * @typedef {{ name: string, kind: import('@dotrino/names/types').NameKind, available: boolean, error?: undefined } | { error: string | undefined, name?: undefined, kind?: undefined, available?: undefined }} CheckResult
 *   `GET /check/<nombre>`, o el código del error si no es un nombre
 *
 * @typedef {{ orderId: string, name: string, years: number, action: 'claim' | 'renew', approveUrl: string }} PendingPayment
 *   el cobro a medias mientras se va y se vuelve de PayPal (`sessionStorage`)
 */
export {}
