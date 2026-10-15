// Bilingüe es/en (CONVENCIONES §9), tuteo, sin voseo. Lenguaje llano (§9.1): se dice lo
// que la persona ve, no cómo está hecho. El idioma lo manda el <dotrino-topbar> ('dotrino-lang').
export const LANG_KEY = 'dotrino.lang'

export function detectLang () {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch (_) {}
  return (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
}

export const messages = {
  es: {
    title: 'Tu nombre en Dotrino',
    intro: 'Un nombre que lleva a tu cuenta, en vez del código de letras y números. Puedes pedir uno gratis o reservar el que quieras.',
    introFree: 'Un nombre que lleva a tu cuenta, en vez del código de letras y números. Puedes pedir uno gratis.',
    loading: 'Cargando…',
    needProfile: 'Para tener un nombre hace falta tu perfil de Dotrino en este navegador.',
    openProfile: 'Abrir mi perfil',
    retry: 'Volver a intentar',
    mine: { title: 'Tus nombres', none: 'Todavía no tienes ningún nombre.', refresh: 'Actualizar' },
    free: {
      title: 'Un nombre gratis',
      text: 'Te damos uno al azar, dos palabras en inglés como «blue-cat». No se puede elegir ni cambiar. Se mantiene mientras uses tu cuenta; tras un mes sin uso caduca, y durante seis meses lo puedes recuperar.',
      button: 'Pedir mi nombre gratis',
      got: 'Tu nombre gratis es'
    },
    reserve: {
      title: 'Reservar un nombre',
      text: 'Elige el nombre que quieras bajo dotrino.com, o usa un dominio que ya sea tuyo. Se paga por año.',
      placeholder: 'mi-nombre  ·  o  ·  midominio.com',
      years: 'Años',
      checking: 'Comprobando…',
      available: 'está libre',
      taken: 'ya está tomado',
      invalid: 'No vale: solo letras, números y guiones, de 3 a 32 caracteres.',
      reserved: 'Ese nombre está reservado.',
      domainHint: 'Es un dominio tuyo. Antes de pagar, publica en su DNS un registro TXT con este valor; lo comprobamos al reservar y en cada renovación:',
      price: (p) => `${p.subtotal} + ${p.tax} de impuestos = USD ${p.total}`,
      pay: 'Pagar con PayPal',
      paying: 'Preparando el pago…',
      unavailable: 'El pago todavía no está disponible. Vuelve a intentarlo más tarde.'
    },
    paid: {
      working: 'Confirmando tu pago…',
      claimed: (n) => `Listo: ${n} es tuyo.`,
      renewed: (n) => `Listo: ${n} renovado.`,
      lost: 'Volviste de PayPal pero no encontramos qué estabas pagando. Si te cobraron, escríbenos.',
      failed: 'El pago no se completó.',
      retry: 'Volver a PayPal'
    },
    name: {
      free: 'gratis', paid: 'reservado', domain: 'tu dominio', held: 'caducado, guardado para ti hasta',
      expires: 'vence el', until: 'activo hasta el', recover: 'Recuperar',
      renew: 'Renovar', renewYears: 'Años a sumar', release: 'Soltar', releaseSure: '¿Seguro? Cualquiera podrá tomarlo.', releaseYes: 'Sí, soltarlo', cancel: 'Cancelar',
      devices: 'Tus aparatos', devicesText: 'Cada aparato tuyo puede tener su propio nombre, como «laptop.{name}». Apunta a ese aparato mientras siga en tu cuenta.',
      noDevices: 'Ningún aparato con nombre todavía.', addDevice: 'Añadir', deviceLabel: 'nombre del aparato', pick: 'elige un aparato', remove: 'Quitar',
      unknownDevice: 'aparato que ya no está en tu cuenta'
    },
    errors: {
      unreachable: 'No se pudo hablar con el directorio. Revisa tu conexión.',
      'no-chain': 'Este navegador no puede demostrar que es de tu cuenta. Abre tu perfil y vuelve.',
      'bad-request-signature': 'La firma no se aceptó. Abre tu perfil y vuelve a intentarlo.',
      'name-taken': 'Ese nombre ya está tomado.',
      'already-has-free': 'Ya tienes tu nombre gratis.',
      'must-recover': 'Tu nombre gratis anterior sigue guardado: recupéralo.',
      'no-domain-proof': 'No encontramos el registro TXT en el DNS de ese dominio.',
      'domain-check-failed': 'No se pudo consultar el DNS de ese dominio. Inténtalo más tarde.',
      'payments-unavailable': 'El pago todavía no está disponible.',
      'payment-not-completed': 'El pago no se completó.',
      'payment-declined': 'PayPal no aceptó esa forma de pago. Elige otra.',
      'too-many-subs': 'Ya tienes el máximo de aparatos con nombre.',
      'not-a-member': 'Ese aparato no está en tu cuenta.',
      'free-name-fixed': 'Un nombre gratis no se puede soltar ni renovar.',
      'invalid-name': 'Ese nombre no vale.',
      'reserved-name': 'Ese nombre está reservado.',
      'bad-entry': 'Ese nombre de aparato no vale: solo letras, números y guiones.',
      'name-expired': 'El nombre ya venció del todo: resérvalo de nuevo.',
      generic: 'No se pudo. Inténtalo de nuevo.'
    },
    payMethod: {
      title: 'Solicitar otra forma de pago',
      placeholder: '¿Con qué te gustaría pagar?',
      send: 'Solicitar', sending: 'Enviando…',
      sent: 'Recibido. Te leemos.',
      failed: 'No se pudo enviar. Inténtalo de nuevo.'
    },
    footer: { page: 'página', server: 'servidor', wiki: 'Cómo funciona' }
  },
  en: {
    title: 'Your name in Dotrino',
    intro: 'A name that leads to your account, instead of the letters-and-numbers code. Ask for a free one or reserve the one you want.',
    introFree: 'A name that leads to your account, instead of the letters-and-numbers code. Ask for a free one.',
    loading: 'Loading…',
    needProfile: 'To have a name you need your Dotrino profile in this browser.',
    openProfile: 'Open my profile',
    retry: 'Try again',
    mine: { title: 'Your names', none: 'You have no names yet.', refresh: 'Refresh' },
    free: {
      title: 'A free name',
      text: 'We give you a random one, two English words like “blue-cat”. It cannot be chosen or changed. It stays while you use your account; after a month without use it expires, and for six months you can get it back.',
      button: 'Get my free name',
      got: 'Your free name is'
    },
    reserve: {
      title: 'Reserve a name',
      text: 'Pick the name you want under dotrino.com, or use a domain you already own. Paid per year.',
      placeholder: 'my-name  ·  or  ·  mydomain.com',
      years: 'Years',
      checking: 'Checking…',
      available: 'is available',
      taken: 'is already taken',
      invalid: 'Not valid: letters, digits and hyphens only, 3 to 32 characters.',
      reserved: 'That name is reserved.',
      domainHint: 'That is a domain of yours. Before paying, publish a TXT record in its DNS with this value; we check it when reserving and on every renewal:',
      price: (p) => `${p.subtotal} + ${p.tax} tax = USD ${p.total}`,
      pay: 'Pay with PayPal',
      paying: 'Preparing the payment…',
      unavailable: 'Payments are not available yet. Please try again later.'
    },
    paid: {
      working: 'Confirming your payment…',
      claimed: (n) => `Done: ${n} is yours.`,
      renewed: (n) => `Done: ${n} renewed.`,
      lost: 'You came back from PayPal but we could not find what you were paying for. If you were charged, write to us.',
      failed: 'The payment did not complete.',
      retry: 'Back to PayPal'
    },
    name: {
      free: 'free', paid: 'reserved', domain: 'your domain', held: 'expired, kept for you until',
      expires: 'expires on', until: 'active until', recover: 'Get it back',
      renew: 'Renew', renewYears: 'Years to add', release: 'Release', releaseSure: 'Sure? Anyone will be able to take it.', releaseYes: 'Yes, release it', cancel: 'Cancel',
      devices: 'Your devices', devicesText: 'Each of your devices can have its own name, like “laptop.{name}”. It points to that device while it stays in your account.',
      noDevices: 'No named devices yet.', addDevice: 'Add', deviceLabel: 'device name', pick: 'pick a device', remove: 'Remove',
      unknownDevice: 'device no longer in your account'
    },
    errors: {
      unreachable: 'Could not reach the directory. Check your connection.',
      'no-chain': 'This browser cannot prove it belongs to your account. Open your profile and come back.',
      'bad-request-signature': 'The signature was not accepted. Open your profile and try again.',
      'name-taken': 'That name is already taken.',
      'already-has-free': 'You already have your free name.',
      'must-recover': 'Your previous free name is still kept: get it back.',
      'no-domain-proof': 'We did not find the TXT record in that domain’s DNS.',
      'domain-check-failed': 'Could not query that domain’s DNS. Try again later.',
      'payments-unavailable': 'Payments are not available yet.',
      'payment-not-completed': 'The payment did not complete.',
      'payment-declined': 'PayPal did not accept that payment method. Pick another one.',
      'too-many-subs': 'You already have the maximum of named devices.',
      'not-a-member': 'That device is not in your account.',
      'free-name-fixed': 'A free name cannot be released or renewed.',
      'invalid-name': 'That name is not valid.',
      'reserved-name': 'That name is reserved.',
      'bad-entry': 'That device name is not valid: letters, digits and hyphens only.',
      'name-expired': 'The name has fully expired: reserve it again.',
      generic: 'It did not work. Try again.'
    },
    payMethod: {
      title: 'Request another way to pay',
      placeholder: 'How would you like to pay?',
      send: 'Request', sending: 'Sending…',
      sent: 'Received. We read every request.',
      failed: 'Could not send. Try again.'
    },
    footer: { page: 'page', server: 'server', wiki: 'How it works' }
  }
}
