/**
 * Los errores llevan un `code` que es el contrato: quien llama compara el código, nunca la
 * frase (la frase se puede traducir o mejorar sin romper a nadie).
 */
export class NamesError extends Error {
  constructor (code, message = code) {
    super(message)
    this.name = 'NamesError'
    this.code = code
  }
}

export const fail = (code, message) => { throw new NamesError(code, message) }
