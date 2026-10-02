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

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), devServerSocket()],
    /** Minify the renderer; electron-vite builds are unminified by default. */
    build: { minify: true }
  }
})
