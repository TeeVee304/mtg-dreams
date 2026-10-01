/// <reference types="vite/client" />
import type { TrackerApi } from '../../shared/api'

declare global {
  interface Window {
    api: TrackerApi
  }
}

export {}
