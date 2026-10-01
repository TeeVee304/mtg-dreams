import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The page's Content-Security-Policy (index.html) allows no WebSocket connections.
 * Only the dev server needs one, for hot reload, so it is added there alone.
 */
function devServerSocket(): Plugin {
  return {
    name: 'mtg-dreams:dev-server-socket',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("connect-src 'self'", "connect-src 'self' ws:")
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), devServerSocket()],
    // electron-vite leaves builds unminified; the UI is the one big bundle worth shrinking.
    build: { minify: true }
  }
})
