/**
 * LA POLÍTICA DE PRODUCCIÓN, y es del código (CONVENCIONES §14): se cambia publicando una
 * versión nueva, no hay nada en marcha que la cambie a distancia.
 *
 * `directoryAccount`: la cuenta cuyo acta firma cabeceras, cortes y recibos. Es la de Dotrino,
 * la misma de los proxios, fijada por la huella que enseña `dotrino-vault info` en su bóveda
 * (`6729-403E-6024f4f71d5bdba1`, 96 bits). El directorio firma como un aparato suyo, nunca con
 * la maestra.
 * `authorities`: las cuentas que pueden hacer `seize` (§3.1 del diseño). Por ahora, Dotrino.
 */
const DOTRINO = '6729403e6024f4f71d5bdba1'

export const POLICY = Object.freeze({
  directoryAccount: DOTRINO,
  authorities: Object.freeze([DOTRINO])
})
