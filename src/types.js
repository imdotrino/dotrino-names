/**
 * Las formas de datos del registro, en un solo sitio (JSDoc; no exporta código).
 *
 * @typedef {'native' | 'domain'} NameKind
 * @typedef {'claim' | 'claim-free' | 'touch' | 'sub' | 'renew' | 'transfer' | 'release' | 'expire' | 'seize'} Op
 *
 * @typedef {object} Policy
 * @property {string} directoryAccount  huella (o prefijo de ≥ 24 hex) de la cuenta que firma como directorio
 * @property {string | null} [directoryNs]  el cajón del aparato que firma por el directorio
 * @property {readonly string[]} authorities  las cuentas que pueden hacer `seize`
 *
 * @typedef {object} NameRecord  lo que el estado guarda de un nombre
 * @property {string} account
 * @property {number} exp
 * @property {boolean} free
 * @property {NameKind} kind
 * @property {boolean} [held]
 * @property {Record<string, string>} [subs]  aparato → huella de su llave
 *
 * @typedef {object} State
 * @property {Map<string, NameRecord>} names  h → registro
 * @property {Map<string, string>} freeOf  cuenta → su h gratuito
 * @property {Map<string, number>} seen  nonce o id de recibo ya usado → su caducidad
 *
 * @typedef {object} SignedBody  lo mínimo que lleva todo cuerpo firmado de este registro
 * @property {string} aud
 * @property {number} [v]
 * @property {string} [kind]
 * @property {string} [op]
 * @property {string} [h]
 * @property {number} [exp]
 * @property {string} [nonce]
 *
 * @typedef {object} Signed  lo que da `identity.signData(body)`
 * @property {SignedBody & Record<string, unknown>} body
 * @property {string} signature
 * @property {string} publickey
 * @property {unknown[]} [chain]  la cadena de actas (cada una, un `Acta`)
 *
 * @typedef {object} ActaMember
 * @property {string} [pub]
 *
 * @typedef {object} Acta  lo que se usa aquí de un acta de la cadena
 * @property {ActaMember[]} [members]
 *
 * @typedef {object} DomainProof
 * @property {'dns-txt'} kind
 * @property {string} value
 * @property {number} ts
 *
 * @typedef {object} Entry  una entrada del registro
 * @property {number} v
 * @property {Op} op
 * @property {string} h
 * @property {number} ts
 * @property {number} [seq]
 * @property {string | null} [prev]
 * @property {string | null} [account]
 * @property {number | null} [exp]
 * @property {boolean} [free]
 * @property {NameKind | null} [kind]
 * @property {boolean} [held]
 * @property {Signed[]} [reqs]
 * @property {Signed} [receipt]
 * @property {DomainProof} [proof]
 * @property {string} [sub]
 * @property {string | null} [device]
 * @property {string} [reason]
 * @property {string} [replacement]
 *
 * @typedef {Entry & { seq: number, prev: string | null }} LoggedEntry  una entrada ya en su sitio del tramo
 *
 * @typedef {object} CheckpointBody
 * @property {number} v
 * @property {string} aud
 * @property {'checkpoint'} kind
 * @property {number} n
 * @property {string | null} prev
 * @property {number} firstSeq
 * @property {number} segmentSize
 * @property {string} segmentRoot
 * @property {string} stateRoot
 * @property {number} ts
 *
 * @typedef {object} HeadBody
 * @property {number} v
 * @property {string} aud
 * @property {'head'} kind
 * @property {number} n
 * @property {number} firstSeq
 * @property {number} size
 * @property {string} root
 * @property {string} stateRoot
 * @property {number} ts
 *
 * @typedef {object} StateLeaf
 * @property {string} h
 * @property {string} account
 * @property {number} exp
 * @property {boolean} free
 * @property {NameKind} kind
 * @property {boolean} held
 * @property {Record<string, string>} subs
 *
 * @typedef {object} StateProof
 * @property {number} index
 * @property {number} size
 * @property {StateLeaf} leaf
 * @property {string[]} proof
 *
 * @typedef {object} ResolutionResponse  lo que contesta el directorio a «¿a quién apunta este nombre?»
 * @property {string} name
 * @property {string | null} [sub]
 * @property {Signed} [head]
 * @property {Signed} [checkpoint]
 * @property {StateProof} [state]
 * @property {Entry} [entry]
 * @property {{ index: number, size?: number, proof: string[] }} [inclusion]
 *
 * @typedef {object} Resolution
 * @property {string} name
 * @property {string | null} sub
 * @property {string} account
 * @property {string | null} device
 * @property {number} exp
 * @property {boolean} free
 * @property {NameKind} kind
 */
export {}
