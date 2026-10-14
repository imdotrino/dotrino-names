# dotrino-names

> **Parte del ecosistema [Dotrino](https://dotrino.com).** Dotrino es un ecosistema de aplicaciones centradas en la privacidad de los datos: tu información es tuya, y las decisiones sobre ella también — qué compartes, con quién, cuándo y por qué. Sin anuncios, sin cookies, sin rastreo de datos, sin vender tu identidad a nadie.

**Directorio de nombres** del ecosistema: traduce un nombre legible (`juan`) al id de una
cuenta (`AB12-CD34-EF56…`), para que `laptop@juan` sirva igual que `laptop@AB12-CD34-EF56`.
Lo resuelve el proxio. Toda cuenta recibe gratis un nombre generado (adjetivo + sustantivo en
inglés, `blue-cat`), que caduca tras un mes sin actividad; elegir uno propio se paga, por año.

**Estado:** el núcleo (`@dotrino/names` 0.1.0, sin publicar) está hecho y probado; faltan el
servidor, el cobro, el proxio y la página. El diseño está en [`docs/DISENO.md`](./docs/DISENO.md).

## El núcleo

Funciones puras, sin red ni disco, para el servidor, los testigos y los clientes:

- `normalizeName`, `nameHash`: qué es un nombre válido y su hash en el registro.
- `pickFreeName`, `randomPair`: el nombre gratuito (`blue-cat`), de `src/words/`.
- `applyEntry`: las reglas que cambian el estado (`claim`, `claim-free`, `touch`, `renew`, `transfer`,
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
