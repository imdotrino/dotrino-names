import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import prerender from '@dotrino/prerender/vite'

// <meta name="commit"> con el hash del commit del build (CONVENCIONES-APPS §3).
function commitMeta () {
  let hash = 'dev'
  try { hash = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* sin git */ }
  return {
    name: 'commit-meta',
    transformIndexHtml: (html) => html.replace('</head>', `  <meta name="commit" content="${hash}" />\n  </head>`)
  }
}

export default defineConfig({
  base: './',
  plugins: [
    // El HTML llega con contenido para quien lo lee sin ejecutar JavaScript (§7).
    prerender({ links: [{ href: 'https://wiki.dotrino.com/desarrollo/servicios/', text: 'Los servicios del ecosistema' }] }),
    commitMeta(),
    // Los `dotrino-*` son Web Components, no componentes Vue.
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('dotrino-') } } })
  ],
  server: { port: 3194, host: true }
})
