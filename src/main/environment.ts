// Where the main process keeps things and which services it talks to. Electron
// fills this in at startup (index.ts); tests fill it with temporary folders and a
// local stand-in for the services, so storage and the card-data clients run without Electron.

export interface Environment {
  /** Settings and caches (%APPDATA%\MTG Dreams). */
  userData: string
  /** Parent of the default data folder. */
  documents: string
  /** Parent of the old app's settings folder, for the one-time migration. */
  appData: string
  /** Moves a file to the Recycle Bin. */
  trash(path: string): Promise<void>
  /** Sent with every request to card-data services. */
  userAgent: string
  scryfallApi: string
  mtgjsonApi: string
  /** Cardmarket's daily price guide for Magic. */
  priceGuideUrl: string
}

export const SERVICES = {
  scryfallApi: 'https://api.scryfall.com',
  mtgjsonApi: 'https://mtgjson.com/api/v5',
  priceGuideUrl: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json'
}

let current: Environment | null = null

export function setEnvironment(environment: Environment): void {
  current = environment
}

export function env(): Environment {
  if (!current) throw new Error('The app environment has not been set up yet.')
  return current
}
