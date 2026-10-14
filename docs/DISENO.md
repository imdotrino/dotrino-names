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
- **Toda cuenta tiene nombre, gratis** (dueño, 2026-10-14): el directorio le asigna uno
  generado, un **adjetivo y un sustantivo en inglés** (`blue-cat`), §5.1. **Pagando, se elige** el que
  uno quiera (§5.2). La cuenta sigue funcionando entera con su código sin ninguno de los dos.

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

El registro es de **solo añadir**. Cada entrada lleva `seq`, `prev` (hash de la anterior),
`ts` y `op`:

| `op` | Qué dice | Firmado por |
|---|---|---|
| `claim` | el nombre `h` pasa a la cuenta `A` hasta `exp` | un aparato del acta de `A` con `sign` + el directorio |
| `renew` | `h` sigue en `A` hasta `exp'` | el directorio (al cobrar; cualquiera puede pagar la renovación) |
| `transfer` | `h` pasa de `A` a `B`, con el tiempo pagado que le quede | un aparato de `A` **y** uno de `B` + el directorio |
| `release` | `A` suelta `h` | un aparato de `A` |
| `expire` | `h` venció y quedó libre | el directorio |
| `seize` | el directorio le quita `h` a `A`, con `reason` | el directorio |

- **`h` es el hash del nombre**, no el nombre: `h = SHA-256("dotrino-names/v1:" + nombre)`.
  Así el registro no se lee como una lista de nombres. **El límite, dicho:** un nombre común
  se adivina probándolo (ataque de diccionario). Lo que se protege es la lista entera, no un
  nombre que alguien ya sospecha.
- **`seize` existe porque tiene que existir** (una orden judicial, una marca registrada). Lo
  que lo hace aceptable es que **queda a la vista** en el registro, con su motivo. No hay
  forma de quitar un nombre sin una entrada.
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
- **Se elige al azar entre los pares libres**, uno por cuenta, al pedirlo por primera vez. El
  directorio puede limitar cuántos asigna por origen para que nadie se los lleve todos.
- **Solo en inglés** (dueño, 2026-10-14): `blue-cat`, adjetivo y sustantivo, en ese orden.
  Una lista para todos, sin concordancia de género y en ASCII de por sí. La lista española
  (a medio puntuar y sin categoría gramatical) se descarta.
- **Palabras comunes solamente**: las de popularidad ≥ 7 de la lista del dueño
  (`/mnt/sda1/dns/en`, `seyacat/dns`, escala 0–10), con la categoría gramatical de
  `english_dictionary.db`, solo `a-z` y de 3 a 10 letras. Contado el 2026-10-14: **1 850
  sustantivos × 547 adjetivos ≈ 1 012 000 pares** (con ≥ 8 serían 94 000, poco). Fuera nombres
  propios, siglas y una lista de exclusión de palabras y pares ofensivos o sensibles.
- **Cuando queden pocos pares libres**, se añade un número detrás (`blue-cat-7`) en vez de
  agrandar las listas con palabras raras.
- **La lista viaja con el código** (§14 de CONVENCIONES): se copia a este repo, con su
  versión, en vez de leerse de `/mnt/sda1/dns`.
- **No se cambia, no vence y no se traspasa** (dueño, 2026-10-14). Sale una vez y es el
  nombre de la cuenta mientras exista: no hay «dame otro», ni nada que renovar ni que vender.
  Así nadie puede ir pidiendo pares hasta dar con uno que le guste, que sería elegir gratis. Quien quiere otro, lo paga (§5.2), y el gratuito se le queda igual.

### 5.2. El nombre pagado

- Lo elige el usuario, con las reglas de §5.3, si está libre. Es el que vence, se renueva y se
  traspasa (§6).
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

- **Esto es solo del nombre pagado** (§5.2): el gratuito no vence.
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
- **El pago va fuera del registro.** El procesador (PayPhone en Ecuador, PayPal fuera, ver
  `MODELO-NEGOCIO.md`) avisa al directorio, y el directorio emite un **recibo firmado** de un
  solo uso. `claim` y `renew` solo entran con un recibo válido. En el registro solo queda el
  hash del recibo.
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

- Procesador de pago concreto y cómo avisa (webhook) al directorio.
- Nombres en otros alfabetos.
- La lista de exclusión de pares ofensivos.
- Anclaje en Bitcoin (OpenTimestamps).
- Política escrita de `seize` (marcas, órdenes judiciales) antes de abrir el servicio.
