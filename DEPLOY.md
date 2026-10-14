# Deploy — `names.dotrino.com`

El servidor (`server/`) corre en el VPS **74.208.11.221** (proxy2, el de geo/reputación/sso),
detrás del nginx que termina TLS. Node ≥ 22.13 (`node:sqlite`).

```
~/dotrino-names              clon del repo (https, es público)
~/dotrino-verifier           clon hermano: server/ lo usa por `file:` hasta que @dotrino/verifier 0.3.0 esté en npm
~/.dotrino-names/            el enlace con la bóveda (`link.json`, 0600) y `names.db`
~/cc-names.config.cjs        pm2: PORT 8094, NAMES_DB, NAMES_DIR, NAMES_PUBLIC_URL
nginx: /etc/nginx/sites-available/names.dotrino.com → 127.0.0.1:8094, con access_log off
```

## Variables

| Var | Default | Qué es |
|---|---|---|
| `PORT` | `8094` | puerto HTTP, solo en 127.0.0.1 |
| `NAMES_DB` | `names.db` | el archivo SQLite |
| `NAMES_DIR` | `~/.local/share/dotrino-names` | el enlace con la bóveda |
| `NAMES_PUBLIC_URL` | `https://names.dotrino.com` | a dónde vuelve PayPal |
| `NAMES_WEB` | `../web/dist` (del repo) | la página construida; sin ella solo se sirve la API |

## La página (`web/`)

Vite + Vue, servida por el mismo proceso en el mismo origen (la vuelta de PayPal y las
peticiones firmadas no cruzan dominios). Se construye en proxy2 tras cada `git pull`:

```bash
cd ~/dotrino-names/web && npm install && npm run build && pm2 restart dotrino-names
```

## Enrolar (una vez)

El directorio es un **aparato del acta de Dotrino** con `sign` y su cajón `names`:

```bash
# en la bóveda de Dotrino (VPS del vault), con el perfil abierto:
dotrino-vault pair --service names --scope sign
# en proxy2:
cd ~/dotrino-names/server && NAMES_DIR=~/.dotrino-names/link node server.js enroll '<invitación>'
node server.js info          # el ID del aparato, para `dotrino-vault caps`
```

## Cobrar

La credencial de PayPal vive en el cajón `names` de la bóveda, no en ningún `.env`:

```bash
dotrino-vault secret set names PAYPAL_CLIENT_ID=… PAYPAL_SECRET=… PAYPAL_LIVE=1
```

Sin ella el servidor arranca igual y contesta `payments-unavailable` al cobrar.

## Arrancar

```bash
pm2 start ~/cc-names.config.cjs && pm2 save
curl -s https://names.dotrino.com/version
```

## Qué guarda, y qué no

El registro (tramos, cortes, estado), los nombres en claro de cada hash (privado: el registro
público solo lleva el hash) y los cobros en curso. **Ni quién consulta ni desde dónde**: el
nginx lleva `access_log off` en los dos bloques, como el del SSO.
