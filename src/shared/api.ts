import type { SortKey } from './cards'
import type { ThemeColor } from './themes'
import type { CardInfo, ListKind, PreconDeck, PreconSummary, PriceBasis, PrintingsResult } from './types'

export type Theme = 'system' | 'light' | 'dark'

export interface AppSettings {
  /** Light, dark, or following Windows. */
  theme: Theme
  /** The color theme (and app icon), one per mana color. */
  color: ThemeColor
  /** Count every version of Plains, Island, Swamp, Mountain and Forest as one generic, free card. */
  bundleBasics: boolean
  /** Your name on shared trade lists. */
  tradeName: string
  /** How decks, wishlists and the inventory are sorted (one choice for all of them). */
  sort: SortKey
  /** Which Cardmarket price cards are valued at, everywhere. */
  priceBasis: PriceBasis
}

export interface ListFile {
  name: string
  text: string
}

export interface LoadedData {
  dataDir: string
  decks: ListFile[]
  wishlists: ListFile[]
  inventory: string
  /** Friends' trade lists (MTG Dreams trade files), named after the friend. */
  trades: ListFile[]
  /** Files skipped because they couldn't be read (e.g. "decks/Burn.txt"). */
  unreadable: string[]
}

/**
 * Starts the message of a save refused because the file changed on disk since the app
 * last read or wrote it (e.g. synced from another PC). Saving again with `force` overwrites it.
 */
export const CONFLICT_ERROR = 'Changed outside MTG Dreams:'

export interface PrintingsOptions {
  /** Ignore the cache and fetch fresh prices. */
  force?: boolean
  /** Interactive lookups jump ahead of background price refreshes. */
  priority?: 'high' | 'low'
  /** Fetch every printing, even for basic lands (normally only the newest page). */
  full?: boolean
}

/** The bridge exposed by the preload script as `window.api`. */
export interface TrackerApi {
  loadData(): Promise<LoadedData>
  createList(kind: ListKind, name: string, text: string): Promise<void>
  /** Rejects with CONFLICT_ERROR if the file changed outside the app, unless `force`. */
  writeList(kind: ListKind, name: string, text: string, force?: boolean): Promise<void>
  renameList(kind: ListKind, from: string, to: string): Promise<void>
  /** Moves a list between decks and wishlists; resolves to its final name. */
  moveList(from: ListKind, to: ListKind, name: string): Promise<string>
  deleteList(kind: ListKind, name: string): Promise<void>
  /** Rejects with CONFLICT_ERROR if the file changed outside the app, unless `force`. */
  writeInventory(text: string, force?: boolean): Promise<void>
  /** Saves a friend's trade list, replacing any with the same name. */
  writeTrade(name: string, text: string): Promise<void>
  deleteTrade(name: string): Promise<void>
  /** Lets the user pick a trade list or collection export; null if cancelled. */
  openTradeFile(): Promise<{ fileName: string; text: string } | null>
  /** Lets the user save their own trade list; resolves to the path, or null if cancelled. */
  saveTradeFile(defaultName: string, text: string): Promise<string | null>
  chooseDataDir(): Promise<string | null>
  openDataDir(): Promise<void>
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<void>
  autocomplete(query: string): Promise<string[]>
  /** A card's printings, with Cardmarket prices. */
  getPrintings(name: string, options?: PrintingsOptions): Promise<PrintingsResult>
  /** Checks Cardmarket for newer prices now; `pricedAt` is when the current ones were published. */
  refreshPrices(): Promise<{ updated: boolean; pricedAt: number | null }>
  /** Called whenever new prices are in. Returns an unsubscribe function. */
  onPricesUpdated(callback: () => void): () => void
  /** Card data keyed by nameKey; null for names Scryfall doesn't know. */
  getCardInfos(names: string[]): Promise<Record<string, CardInfo | null>>
  getPreconIndex(): Promise<PreconSummary[]>
  getPrecon(fileName: string): Promise<PreconDeck>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  onWindowFocus(callback: () => void): () => void
}
