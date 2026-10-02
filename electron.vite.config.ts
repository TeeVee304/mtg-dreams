import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev-server-only plugin adding `ws:` to the CSP `connect-src` (index.html) for hot reload. */
function devServerSocket(): Plugin {
  return {
    name: 'mtg-dreams:dev-server-socket',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("connect-src 'self'", "connect-src 'self' ws:")
  }
}

/** `@shared/*` import alias, mirrored in the tsconfig `paths` and `vitest.config.ts`. */
const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: {
    resolve: { alias },
    plugins: [react(), devServerSocket()],
    /** Minify the renderer; electron-vite builds are unminified by default. */
    build: { minify: true }
  }
})
