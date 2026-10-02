import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** Vitest config; mirrors the `@shared/*` alias from `electron.vite.config.ts`. */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } }
})
