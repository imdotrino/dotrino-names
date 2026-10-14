/**
 * LA POLÍTICA DE PRODUCCIÓN, y es del código (CONVENCIONES §14): se cambia publicando una
 * versión nueva, no hay nada en marcha que la cambie a distancia.
 *
 * `directoryAccount`: la cuenta cuyo acta firma cabeceras, cortes y recibos (la de Dotrino; el
 * directorio firma como un aparato suyo, nunca con la maestra).
 * `authorities`: las cuentas que pueden hacer `seize` (§3.1 del diseño).
 *
 * PENDIENTE antes de abrir el servicio: el id de la cuenta de Dotrino. Mientras sea `null`,
 * `checkPolicy` para con `no-policy`: sin saber quién firma no se da nada por bueno.
 */
export const POLICY = Object.freeze({
  directoryAccount: null,
  authorities: Object.freeze([])
})
