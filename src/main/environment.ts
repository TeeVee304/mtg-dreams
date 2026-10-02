/**
 * Main-process paths and service endpoints. Set by `index.ts` at startup; tests inject temp
 * directories and local service stubs, so storage and clients run without Electron.
 */
export interface Environment {
  /** Settings and caches (`%APPDATA%\MTG Dreams`). */
  userData: string
  /** Parent of the default data folder. */
  documents: string
  /** Parent of the legacy app's settings folder (one-time migration). */
  appData: string
  /** Moves a file to the Recycle Bin. */
  trash(path: string): Promise<void>
  /** User-Agent header for service requests. */
  userAgent: string
  /** Scryfall API base URL. */
  scryfallApi: string
  /** MTGJSON API base URL. */
  mtgjsonApi: string
  /** Cardmarket daily price guide URL. */
  priceGuideUrl: string
}

/** Production service endpoints. */
export const SERVICES = {
  scryfallApi: 'https://api.scryfall.com',
  mtgjsonApi: 'https://mtgjson.com/api/v5',
  priceGuideUrl: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json'
}

let current: Environment | null = null

/** Installs the environment returned by {@link env}. */
export function setEnvironment(environment: Environment): void {
  current = environment
}

/** @throws Error if {@link setEnvironment} has not run. */
export function env(): Environment {
  if (!current) throw new Error('The app environment has not been set up yet.')
  return current
}
