/**
 * @dotrino/names — el núcleo del directorio de nombres de Dotrino (docs/DISENO.md).
 *
 * Funciones puras y sin red: reglas del nombre, árbol de Merkle (RFC 9162), las reglas que
 * cambian el estado, tramos y cortes, y comprobar una respuesta. Lo usan el servidor del
 * directorio, los testigos (el proxio) y cualquier cliente que quiera comprobar por su cuenta.
 */
export * from './constants.js'
export { NamesError } from './errors.js'
export { DOMAIN, normalizeName, nameHash, addressCandidates, checkName, isNative, isLabel, RESERVED } from './name.js'
export { randomPair, pickFreeName, adjectives, nouns } from './free.js'
export { root, leafHash, inclusionProof, verifyInclusion, consistencyProof, verifyConsistency } from './merkle.js'
export { OPS, KINDS, MAX_SUBS, emptyState, cloneState, applyEntry, stateRoot, stateProof, stateLeafData } from './state.js'
export { Segment, entryLeaf, checkpointBody, checkpointHash, replaySegment } from './log.js'
export { verifyResolution } from './resolve.js'
export { checkPolicy, verifySigned, verifyDirectorySigned, accountId, matchesAccount, isActaMember, pubkeyId } from './verify.js'
export { POLICY } from './policy.js'
