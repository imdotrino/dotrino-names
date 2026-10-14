# Directorio de nombres — diseño

> Decidido por el dueño el 2026-09-17 (directorio aparte, solo traduce, se cobra) y el
> 2026-10-14 (servicio pagado, **nombre → cuenta**, **pago anual**, sin token en Ethereum).
> El cobro es la excepción declarada en `MODELO-NEGOCIO.md`.

## 1. Qué hace y qué no

- **Traduce `nombre` → id de la cuenta** (`profileId`, la huella completa, no los 48 bits del
  código). Nada más: **no hay búsqueda, ni lista, ni «nombres parecidos»**.
- **Apunta a la cuenta, nunca a un aparato.** La cuenta no cambia nunca; los aparatos entran,
  se revocan y rotan su llave. El aparato va delante de la `@` (`laptop@juan`) y lo resuelve
  el acta, como hoy.
- **No es una autoridad de identidad.** Quien resuelve un nombre comprueba después el acta
  contra el id recibido (`dotrino-passmanager/docs/temporary-access.md` §3.2). Un directorio
  comprometido puede **desviar o negar**: decir que `juan` es otra cuenta, o no contestar.
  **No puede firmar por nadie ni sacar una contraseña** (OPAQUE no la enseña a la bóveda
  equivocada). Y desviar no es mudo: para cambiar a quién apunta un nombre hace falta una
  entrada en el registro, que los testigos ven (§3), y el cliente **recuerda a qué cuenta
  resolvió cada nombre** y avisa si cambia.
- **Un nombre gratuito, si se pide** (dueño, 2026-10-14): tener perfil **no** da nombre. La
  cuenta lo **solicita** (una petición firmada, `claim-free`) y el directorio le asigna uno
  generado, un **adjetivo y un sustantivo en inglés** (`blue-cat`), §5.1. **Pagando, se elige** el
  que uno quiera (§5.2). La cuenta sigue funcionando entera con su código sin ninguno de los dos.

## 2. Por qué no una blockchain pública ni un token

Comparado y descartado el 2026-10-14:

| Ethereum / token | Lo que pedía el ecosistema |
|---|---|
| el usuario necesita billetera y paga gas | lenguaje llano, nada de JS de terceros |
| todo es público y se puede recorrer para siempre | no se puede enumerar quién tiene cuenta |
| un token es un activo: especulación y regulación | se paga un servicio, no se vende un activo |
| depende de una cadena ajena | el ecosistema no depende de nadie para resolver |

Lo que sí se toma de una blockchain: **el historial no se reescribe sin que se note**, y
**los traspasos los firman los dueños**. Eso lo da un **registro de transparencia** (§3), del
mismo tipo que Certificate Transparency (RFC 9162), Sigstore Rekor o la sigchain de Keybase,
sin minería ni consenso.

## 3. El registro

**Un solo escritor y varios testigos.** El directorio escribe; los proxios vigilan. El modelo
de confianza, dicho entero: *Dotrino puede negarse a registrar un nombre, pero no puede
cambiar el historial sin que los testigos lo vean.*

### 3.1. Las entradas

El registro es de **solo añadir** dentro de cada tramo (lo viejo se poda, §3.4). Cada entrada lleva `seq`, `prev` (hash de la anterior),
`ts` y `op`:

| `op` | Qué dice | Firmado por |
|---|---|---|
| `claim` | el nombre `h` pasa a la cuenta `A` hasta `exp` | un aparato del acta de `A` con `sign` + el directorio |
| `touch` | la cuenta de un nombre gratuito sigue activa | un aparato del acta de `A` con `sign` |
| `renew` | `h` sigue en `A` hasta `exp'` | el directorio (al cobrar; cualquiera puede pagar la renovación) |
| `transfer` | `h` pasa de `A` a `B`, con el tiempo pagado que le quede | un aparato de `A` **y** uno de `B` + el directorio |
| `release` | `A` suelta `h` | un aparato de `A` |
| `expire` | `h` venció: un pagado queda libre; un gratuito pasa a guardado, y al acabar la reserva, libre | nadie: entra solo si de verdad toca |
| `seize` | una cuenta autoridad le quita `h` a `A` y lo pasa a `C`, con `reason` | un aparato del acta de la autoridad con `sign` + el directorio |

- **`h` es el hash del nombre**, no el nombre: `h = SHA-256("dotrino-names/v1:" + nombre)`.
  Así el registro no se lee como una lista de nombres. **El límite, dicho:** un nombre común
  se adivina probándolo (ataque de diccionario). Lo que se protege es la lista entera, no un
  nombre que alguien ya sospecha.
- **`seize` existe porque tiene que existir** (una orden judicial, una marca registrada). Lo
  que lo hace aceptable es que **queda a la vista** en el registro, con su motivo. No hay
  forma de quitar un nombre sin una entrada.
- **Quién puede hacer `seize`: las cuentas autoridad** (dueño, 2026-10-14), como la de
  Dotrino. Es una lista corta de ids de cuenta que **vive en el código y viaja con la
  versión** (política del código, §14 de CONVENCIONES), y que los testigos también tienen: un
  `seize` firmado por una cuenta que no está en su lista no lo cofirman. Lo firma un aparato
  de esa cuenta con `sign`, como cualquier otra entrada; el directorio solo lo registra.
- **El nombre pasa a la cuenta `C`** que diga la entrada: el titular de la marca, quien gana
  la orden, o la propia autoridad para dejarlo fuera de circulación. El tiempo pagado que le
  quedara a `A` no se le devuelve en el registro; si procede devolver dinero, se hace fuera.
- **Un nombre gratuito también se puede quitar.** A la cuenta afectada se le asigna otro par
  gratuito en la misma entrada, para que nunca se quede sin nombre.
- **El directorio firma con una llave de comunicación** de la cuenta de Dotrino, miembro de su
  acta. Nunca con la maestra (regla de la maestra, `CLAUDE.md`).
- **Ningún permiso nuevo**: reservar o traspasar lo firma un aparato con `sign`, igual que
  cualquier otra cosa que se firma en nombre de la persona.

### 3.2. Árbol y cabecera firmada

Las entradas son las hojas de un **árbol de Merkle** (RFC 9162). Cada vez que entra algo, el
directorio publica una **cabecera firmada** (`{ size, root, ts }`). Con ella se dan dos
pruebas:

- **de inclusión**: esta entrada está en el árbol de tamaño `size`;
- **de consistencia**: el árbol de ahora contiene entero al de antes, sin cambios.

### 3.3. Testigos

- **Cada proxio es testigo.** Guarda la última cabecera que vio, pide la prueba de
  consistencia contra la nueva, y si cuadra **la cofirma** y la publica en un canal del
  proxio. Si no cuadra (el directorio enseñó dos historias), **lo dice en su log y en su
  pantalla de estado**, y deja de dar por buenas las respuestas nuevas.
- Un verificador federado (`@dotrino/verifier`) puede ser testigo igual: es el mismo trabajo.
- **Anclaje externo:** la raíz del día se sella en `dotrino-signer` (prueba de cuándo).
  Anclarla también en Bitcoin con OpenTimestamps, que es gratis y no pide nada al usuario,
  queda como pendiente.

### 3.4. El historial caduca: cortes y poda

> Dueño, 2026-10-14: *«es una especie de blockchain con caducidad»*. Caducan los nombres
> (§6) **y también el historial**, para que el registro se quede pequeño.

- **Un corte por mes.** El directorio cierra el tramo del mes y firma un **corte**:
  `{ n, prev, stateRoot, segmentRoot, ts }`.
  - `stateRoot` es la raíz de Merkle del **estado vivo**: cada `h` con su cuenta, su `exp` y
    si es gratuito, ordenado por `h`. Es lo único que hace falta para resolver.
  - `segmentRoot` es la raíz del tramo de entradas de ese mes (§3.2).
  - `prev` es el hash del corte anterior: **los cortes forman la cadena**.
- **Los testigos validan cada corte antes de cofirmarlo**: aplican el tramo al estado del
  corte anterior y comprueban que sale el mismo `stateRoot`. Un corte cofirmado dice «este
  estado sale de aplicar estas entradas, y lo vi». El corte se sella en `dotrino-signer`.
- **Se poda lo de más de 12 meses.** Los tramos de entradas más viejos que eso se borran, del
  directorio y de los testigos. **Los cortes no se borran nunca**: ocupan unos cientos de
  bytes cada uno, y son lo que permite comprobar que la cadena sigue sin huecos.
- **Lo que se gana**: el registro guarda el estado vivo y un año de movimientos, no toda la
  historia. Un nombre vencido y liberado deja de constar al año.
- **Lo que se pierde, dicho**: pasado un año ya no se puede ver *cómo* llegó un nombre a su
  dueño, solo que los testigos de entonces dieron por bueno cada paso. Un `seize` (§3.1) se ve
  durante ese año y después solo queda su efecto.
- **Resolver no cambia**: la respuesta lleva la prueba de inclusión del nombre en el último
  corte y, si cambió después, la de la entrada del tramo abierto.

### 3.5. Lo que el núcleo ya fija (0.1.0)

- **La cuenta es el `profileId` del pilar** (lo que devuelve `signData` y compara
  `verifySignedFor`), no una abreviatura: la comprobación del acta se hace contra eso mismo.
- **Toda firma se comprueba con `@dotrino/identity/assertion`** (`verifySignedFor`, con
  `aud = https://names.dotrino.com`): miembro con `sign` del acta de esa cuenta, y para este
  servicio. Peticiones, recibos, cabeceras y cortes, todo por el mismo camino.
- **Una entrada que no vale no toca el estado**: primero se comprueba todo, después se escribe.
- **Antirrepetición**: cada petición lleva `nonce` y caduca en un día; cada recibo, en 30. Lo
  usado se recuerda hasta que caduca. Ese recuerdo **no entra en la raíz del estado**, así que
  un testigo que empieza en un corte sin el tramo anterior no lo tiene; con 12 tramos guardados
  y caducidades de un día y 30 días, el que repite desde el tramo anterior sí lo tiene.
- **La política de producción (`src/policy.js`) está vacía**: falta el id de la cuenta de
  Dotrino. Mientras tanto todo para con `no-policy`, que es lo que tiene que pasar.

## 4. Resolver

```
app ──resolveName('juan')──► proxio ──GET /resolve/<h>──► directorio
                               │   ◄── entrada + prueba de inclusión + cabecera
                               │   comprueba la prueba contra la cabecera que cofirmó
app ◄── { accountId, exp } ────┘   cachea hasta exp o hasta la próxima cabecera
app: comprueba el acta contra accountId (como hoy con el código)
```

- **Lo resuelve el proxio, y eso protege al usuario**: el directorio ve qué `h` se pregunta,
  pero no quién pregunta, porque las preguntas le llegan del proxio, mezcladas y cacheadas.
- **El proxio no es el registro** (decisión del 2026-09-17): solo consulta, verifica y
  cachea. Si el directorio está caído, lo cacheado sigue sirviendo hasta su `exp`, y un nombre
  sin caché da un error con código (`name-unavailable`), nunca un id por defecto.
- **En el cliente**, `@dotrino/proxy-client` gana `resolveName(name)`. La verificación de las
  pruebas vive en un paquete pequeño, `@dotrino/names`, que usan el proxio y quien quiera
  comprobarlas por su cuenta.
- **Nombre que no existe y nombre vencido dan errores distintos** (`name-not-found`,
  `name-expired`): se arreglan de formas distintas.

## 5. El nombre

### 5.1. El nombre gratuito: sustantivo + adjetivo

- **Lo ASIGNA el directorio, no se calcula de la huella.** Dos palabras dan del orden de un
  millón de pares (≈ 20 bits). Sacarlas de la huella haría que dos cuentas cayeran en el mismo
  par a partir de unas mil (paradoja del cumpleaños), y con 20 bits cualquiera fabrica una
  cuenta que caiga en el par de otro en segundos. Así que el nombre gratuito es una entrada
  `claim` más, con `free: true` y sin recibo, y **la seguridad la sigue dando el acta contra
  el id completo**, como con el nombre pagado.
- **Solo a quien lo pide**: lo solicita el usuario, a propósito, desde la página o desde una app
  (`claim-free` firmado). Nada lo pide solo: ni el pilar al identificarse ni una app al abrirse.
- **Se elige al azar entre los pares libres**, uno por cuenta. El
  directorio puede limitar cuántos asigna por origen para que nadie se los lleve todos.
- **Solo en inglés** (dueño, 2026-10-14): `blue-cat`, adjetivo y sustantivo, en ese orden.
  Una lista para todos, sin concordancia de género y en ASCII de por sí. La lista española
  (a medio puntuar y sin categoría gramatical) se descarta.
- **Palabras comunes solamente**: las de popularidad ≥ 7 de la lista del dueño
  (`/mnt/sda1/dns/en`, `seyacat/dns`, escala 0–10), con la categoría gramatical de
  `english_dictionary.db`, solo `a-z` y de 3 a 10 letras. Sin plurales (`cats` sobra si está `cat`) y fuera
  una lista de exclusión (`src/words/exclude.json`): palabras ofensivas o sensibles, personas y
  parentescos (para que ningún adjetivo caiga sobre alguien), palabras de función. Quedan
  **442 adjetivos × 1 075 sustantivos ≈ 475 000 pares** (2026-10-14). Las genera
  `scripts/build-words.py`.
- **Cuando queden pocos pares libres**, se añade un número detrás (`blue-cat-7`) en vez de
  agrandar las listas con palabras raras.
- **La lista viaja con el código** (§14 de CONVENCIONES): se copia a este repo, con su
  versión, en vez de leerse de `/mnt/sda1/dns`.
- **No se cambia y no se traspasa** (dueño, 2026-10-14). Sale una vez: no hay «dame otro» ni
  nada que vender. Así nadie puede ir pidiendo pares hasta dar con uno que le guste, que sería
  elegir gratis.
- **Caduca tras un mes sin actividad** (dueño, 2026-10-14). El directorio no ve quién usa un
  nombre (las consultas le llegan por el proxio), así que la actividad la **prueba la cuenta**:
  una **señal de vida firmada** (`touch`) por cualquier aparato de su acta. La manda **el
  pilar, solo** (`@dotrino/proxy-client`, tras `identify`), **solo si la cuenta tiene un
  nombre gratuito**, como mucho una vez por semana:
  ninguna app hace nada y el usuario tampoco. 30 días sin señal y cualquiera puede escribir el
  `expire`, que entra solo si de verdad pasaron.
- **Caducado, queda guardado 6 meses para su cuenta**: no resuelve y nadie más lo toma. Si la
  cuenta vuelve en ese tiempo **recupera ese mismo** (el registro la obliga: `must-recover`), lo
  que también cierra el atajo de dejar de usarla para cambiar de nombre. Pasada la reserva, el
  par vuelve a circular y la cuenta, si vuelve, recibe otro.
- **Lo que cuesta, dicho**: el registro deja ver que una cuenta estuvo activa en tal semana
  (no más fino: la señal es semanal). Y quien pasa un mes sin encender ningún aparato pierde el
  nombre de la vista hasta que vuelve. Quien quiere otro, lo paga (§5.2), y el gratuito se le queda igual.

### 5.2. El nombre pagado

- Lo elige el usuario, con las reglas de §5.3, si está libre. Es el que vence, se renueva y se
  traspasa (§6). **No caduca por inactividad**: lo mantiene el pago.
- **Puede tener la forma de un par** (`happy-dog`) si ese par no está asignado: es un solo
  espacio de nombres.

### 5.3. Reglas comunes

- **Solo ASCII** en minúsculas: `a-z`, `0-9` y `-`, de 3 a 32 caracteres, sin `-` al
  principio ni al final ni dos seguidos. Se normaliza a minúsculas antes de hashear. Así no
  hay caracteres que se confunden (`а` cirílica frente a `a` latina). Otros alfabetos,
  pendiente.
- **Reservados** que no se venden: `dotrino`, los nombres de las apps del catálogo, `admin`,
  `root`, `support` y parecidos. La lista vive en el código y viaja con la versión (§14 de
  CONVENCIONES: es política del código).
- **Un precio para todos los nombres** (regla de simplificar los procesos). Nombres cortos más
  caros, subastas o precios por demanda: no, mientras no haga falta.

## 6. Pago anual

- **Esto es solo del nombre pagado** (§5.2): el gratuito no se paga; caduca por inactividad (§5.1).
- **Precio: USD 0,99 por año, más impuestos** (dueño, 2026-10-14). En Ecuador el IVA es del
  15 %: USD 1,14 en total. El mismo precio para cualquier nombre (§5.3).
- **Se paga por año.** `claim` y `renew` dan 12 meses.
- **La comisión fija del procesador pesa mucho con un precio así**: un cobro de PayPal lleva
  una parte fija del orden de USD 0,30–0,49, casi la mitad de lo que se cobra. Por eso se
  pueden **pagar varios años de una vez** (`claim` y `renew` con `years`), **sin tope**
  (dueño, 2026-10-14), y la página lo ofrece. Cada cobro lleva además su factura electrónica del SRI.
- **Aviso antes de vencer**: a los aparatos del acta, 30 y 7 días antes, por los avisos que ya
  existen.
- **30 días de gracia** después de `exp`: el nombre deja de resolver (`name-expired`) pero solo
  el dueño puede renovarlo. Pasado ese plazo, `expire` y queda libre.
- **Se puede pagar con todo lo posible** (dueño, 2026-10-14). Cada medio es un **adaptador**
  con el mismo contrato: crea el cobro y lo confirma **del lado del directorio**. Todos acaban
  en lo mismo, un recibo firmado (abajo); el registro no sabe con qué se pagó.

  | Medio | Para quién | Notas |
  |---|---|---|
  | **PayPal** (el primero) | cualquiera, también con tarjeta sin cuenta de PayPal | detalle abajo |
  | **PayPhone** | tarjetas de Ecuador | procesador local; API de botón de pago por redirección |
  | **Bitcoin por Lightning** (el segundo) | quien tenga billetera | **BTCPay Server autohosteado**: sin intermediario y con comisión de céntimos, lo que mejor encaja con USD 0,99 |
  | **Códigos prepagados** | quien no puede pagar en línea, regalos, transferencias | un código de un solo uso = N años; se venden por cualquier vía (transferencia bancaria, Ko-fi, en mano) y se canjean en la página |
  | **App Store / Google Play** | solo dentro de las apps nativas | las tiendas **obligan** a usar su compra integrada para bienes digitales y se quedan un 15 %; fuera de ellas, nunca |

  **Orden** (dueño, 2026-10-14): **PayPal, luego Lightning**; los demás después, sin orden
  fijado.

  Por qué no otros: **Stripe** no da de alta empresas de Ecuador (comprobarlo antes de
  descartarlo del todo); la **transferencia bancaria directa** obliga a conciliar a mano cada
  cobro de USD 1,14, así que entra por los códigos prepagados. Medios locales con QR (p. ej.
  Deuna) se suman si exponen una API de confirmación; si no, por códigos.

- **Ningún medio carga JavaScript de terceros** en la página: todos van por redirección
  (PayPal, PayPhone), por factura que paga la billetera del usuario (Lightning, servida por
  nuestro propio BTCPay) o por canje (códigos). Las compras de tienda viven en la app nativa.
- **El IVA y la factura del SRI van igual con cualquier medio**, Bitcoin incluido.
- **PayPal** (dueño, 2026-10-14). El directorio
  emite un **recibo firmado** de un solo uso cuando el cobro se confirma. `claim` y `renew`
  solo entran con un recibo válido. En el registro solo queda el hash del recibo.
- **Cómo se cobra, sin JavaScript de PayPal en la página** (la regla de nada de JS de
  terceros): con la API de pedidos de PayPal (Orders v2) por **redirección**.

  ```
  página ──POST /checkout { years }──► directorio ──crea el pedido──► PayPal
  página ◄── enlace de aprobación ─────┘
  usuario aprueba en paypal.com ──vuelve a names.dotrino.com/return?token=…
  página ──POST /capture──► directorio ──captura el pedido──► PayPal (COMPLETED)
  página ◄── recibo firmado ─────┘
  ```

  **Quien confirma el cobro es el directorio**, que captura el pedido con su credencial y lee
  el resultado de PayPal directamente: no se fía de lo que diga la página. El aviso por webhook
  de PayPal (`PAYMENT.CAPTURE.COMPLETED`, con su firma comprobada) solo sirve de respaldo para
  un cobro cuya vuelta se cortó, y emite el mismo recibo una sola vez.
- **A PayPal no le llega ni el nombre ni la cuenta.** El pedido lleva el importe, una
  descripción fija («Dotrino name, N years») y en `custom_id` un número de un solo uso que solo
  el directorio sabe atar al pedido. PayPal sí sabe quién paga, que es inevitable.
- **La credencial de PayPal vive en la bóveda** (cajón del servicio), como cualquier secreto
  de un servicio del ecosistema.
- **Lo que esto NO esconde**: la factura (SRI) la exige la ley y lleva datos de quien paga.
  DOTRINO S.A.S. la guarda aparte del directorio, y el directorio no la consulta. Pero existe:
  quien paga con su nombre queda ligado a su `h` en la contabilidad. Se dice en la página
  pública, no se esconde.
- **Negociar un nombre** es cosa de las dos partes: acuerdan el precio fuera del sistema y
  firman un `transfer`. El directorio no cobra comisión ni hace de intermediario (de momento:
  un depósito en garantía sería otra decisión).

## 7. Piezas

| Pieza | Qué es | Dónde |
|---|---|---|
| `dotrino-names` (este repo) | el servidor del registro y su página | `names.dotrino.com`, en proxy2 junto a reputation (Postgres) |
| `@dotrino/names` | verificar pruebas y cabeceras, sin red | npm, publicado desde CI (§ CLAUDE.md) |
| `websocket-proxy` | op `resolve-name` + testigo | proxy1 y proxy2 |
| `@dotrino/proxy-client` | `resolveName(name)` | npm |

- **La página `names.dotrino.com` es una app del ecosistema** (§1 de CONVENCIONES):
  topbar, perfil, store, bilingüe, lenguaje llano. Pantalla **informativa** (qué es, precio)
  separada de la **administrativa** (mis nombres, renovar, traspasar) — §5.1.
- **Versiones** (§14): el servidor anuncia `{ product, version, protocol }`, y el formato de
  las entradas lleva su `v`.

## 8. Pendientes

- Nombres en otros alfabetos.
- La lista de exclusión de pares ofensivos.
- El id de la cuenta de Dotrino en `src/policy.js` (directorio y autoridad).
- Orden de los medios de pago después de PayPal y Lightning, y confirmar Stripe y Deuna.
- Anclaje en Bitcoin (OpenTimestamps).
- Los criterios escritos con los que una autoridad decide un `seize` (qué marca, qué orden), publicados antes de abrir el servicio. El mecanismo ya está (§3.1).
