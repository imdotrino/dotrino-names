# dotrino-names

> **Parte del ecosistema [Dotrino](https://dotrino.com).** Dotrino es un ecosistema de aplicaciones centradas en la privacidad de los datos: tu información es tuya, y las decisiones sobre ella también — qué compartes, con quién, cuándo y por qué. Sin anuncios, sin cookies, sin rastreo de datos, sin vender tu identidad a nadie.

**Directorio de nombres** del ecosistema: traduce un nombre legible (`blue-cat.dotrino.com`,
o un dominio tuyo como `empresa.com`) al id de una cuenta (`AB12-CD34-EF56…`), y
`laptop.blue-cat.dotrino.com` a la llave de ese aparato.
Lo resuelve el proxio. Una cuenta puede pedir gratis un nombre generado (adjetivo + sustantivo en
inglés, `blue-cat`), que caduca tras un mes sin actividad; elegir uno propio se paga, por año.

**Estado:** el núcleo (`@dotrino/names` 0.1.0, sin publicar) y el servidor (`server/`, con el
cobro por PayPal y la prueba de dominio por TXT) están hechos y probados; el servidor está
clonado en proxy2 sin arrancar (falta enrolarlo, el DNS y la credencial de PayPal:
[`DEPLOY.md`](./DEPLOY.md)). Faltan el proxio (resolver + testigo), el pilar (`resolveName`,
la señal de vida) y la página. El diseño está en [`docs/DISENO.md`](./docs/DISENO.md).

## El núcleo

Funciones puras, sin red ni disco, para el servidor, los testigos y los clientes:

- `normalizeName`, `addressCandidates`, `nameHash`: qué es un nombre válido, cómo se lee lo escrito y su hash.
- `pickFreeName`, `randomPair`: el nombre gratuito (`blue-cat`), de `src/words/`.
- `applyEntry`: las reglas que cambian el estado (`claim`, `claim-free`, `touch`, `sub`, `renew`, `transfer`,
  `release`, `expire`, `seize`).
- `Segment`, `checkpointBody`, `replaySegment`: tramos, cortes y lo que hace un testigo.
- `verifyResolution`: comprobar una respuesta del directorio.
- Árbol de Merkle de RFC 9162: `root`, `inclusionProof`, `verifyInclusion`,
  `consistencyProof`, `verifyConsistency`.

Las firmas se comprueban con `@dotrino/identity` (dependencia `peer`).

```bash
npm install
npm test
# regenerar las listas de palabras desde la lista del dueño (seyacat/dns)
python3 -I scripts/build-words.py /mnt/sda1/dns/en
```
