import type { SortKey } from './cards'
import type { CopiesMode } from './copies'
import type { DeckTokenData } from './tokens'
import type { ThemeColor } from './themes'
import type { CardInfo, ListKind, PreconDeck, PreconSummary, PriceBasis, PrintingsResult } from './types'

/** UI theme mode; `system` follows the OS. */
export type Theme = 'system' | 'light' | 'dark'

/** Persisted user settings. */
export interface AppSettings {
  theme: Theme
  /** Accent color theme and app icon. */
  color: ThemeColor
  /** Treat all printings of the five basic lands as one generic, zero-cost card. */
  bundleBasics: boolean
  /** How owned copies count toward lists. */
  copies: CopiesMode
  /** Show card thumbnails in lists and search. */
  cardImages: boolean
  /** List layout for decks and wishlists. */
  cardView: 'table' | 'grid'
  /** Owner name written into exported trade lists. */
  tradeName: string
  /** Sort order shared by decks, wishlists and inventory. */
  sort: SortKey
  /** Global price basis for valuation. */
  priceBasis: PriceBasis
  /** Wishlist price-drop alert threshold, in percent below the baseline. */
  dropAlertPercent: number
}

/** Daily price snapshot keyed by Cardmarket product id. */
export interface PriceSnapshot {
  /** Epoch ms of Cardmarket publication. */
  date: number
  /** `[nonFoil, foil]` trend prices in EUR; 0 means unknown. */
  prices: Record<string, [number, number]>
}

/** Wishlist card's prices on first being added to a wishlist. */
export interface PriceBaseline {
  /** Epoch ms of capture. */
  at: number
  prices: Partial<Record<PriceBasis, number>>
}

/** Raw list file: name without extension, and contents. */
export interface ListFile {
  name: string
  text: string
}

/** Full contents of the data directory. */
export interface LoadedData {
  dataDir: string
  decks: ListFile[]
  wishlists: ListFile[]
  /** Inventory file contents. */
  inventory: string
  /** Friends' trade lists, named after the friend. */
  trades: ListFile[]
  /** Relative paths of unreadable files that were skipped, e.g. "decks/Burn.txt". */
  unreadable: string[]
}

/**
 * Message prefix of a save rejected because the file changed on disk since last read or
 * write (e.g. external sync). Retry with `force` to overwrite.
 */
export const CONFLICT_ERROR = 'Changed outside MTG Dreams:'

/** Options for {@link TrackerApi.getPrintings}. */
export interface PrintingsOptions {
  /** Bypass the cache. */
  force?: boolean
  /** Queue priority: `high` for interactive lookups, `low` for background refreshes. */
  priority?: 'high' | 'low'
  /** Fetch all printings, including every basic land printing (default: newest page only). */
  full?: boolean
}

/** IPC bridge exposed by the preload script as `window.api`. */
export interface TrackerApi {
  loadData(): Promise<LoadedData>
  createList(kind: ListKind, name: string, text: string): Promise<void>
  /** @throws `CONFLICT_ERROR` if the file changed externally and `force` is not set. */
  writeList(kind: ListKind, name: string, text: string, force?: boolean): Promise<void>
  renameList(kind: ListKind, from: string, to: string): Promise<void>
  /**
   * Moves a list to another kind.
   * @returns Final name, deduplicated against the target kind.
   */
  moveList(from: ListKind, to: ListKind, name: string): Promise<string>
  deleteList(kind: ListKind, name: string): Promise<void>
  /** @throws `CONFLICT_ERROR` if the file changed externally and `force` is not set. */
  writeInventory(text: string, force?: boolean): Promise<void>
  /** Saves a friend's trade list, replacing any of the same name. */
  writeTrade(name: string, text: string): Promise<void>
  deleteTrade(name: string): Promise<void>
  /**
   * Shows an open dialog for a trade list or collection export.
   * @returns File name and contents; null if cancelled.
   */
  openTradeFile(): Promise<{ fileName: string; text: string } | null>
  /**
   * Shows a save dialog for the user's trade list.
   * @returns Saved path; null if cancelled.
   */
  saveTradeFile(defaultName: string, text: string): Promise<string | null>
  /** @returns Chosen directory; null if cancelled. */
  chooseDataDir(): Promise<string | null>
  /** Opens the data directory in the OS file manager. */
  openDataDir(): Promise<void>
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<void>
  /** @returns Scryfall card name suggestions. */
  autocomplete(query: string): Promise<string[]>
  /** @returns The card's printings with Cardmarket prices. */
  getPrintings(name: string, options?: PrintingsOptions): Promise<PrintingsResult>
  /**
   * Checks Cardmarket for a newer price guide.
   * @returns Whether prices changed, and the current guide's publication time.
   */
  refreshPrices(): Promise<{ updated: boolean; pricedAt: number | null }>
  /** @returns Publication time of the price guide on disk, without checking for a newer one; null if none. */
  getPriceDate(): Promise<number | null>
  /** @returns Unsubscribe function. */
  onPricesUpdated(callback: () => void): () => void
  /** Adds Cardmarket product ids to the daily price history. */
  trackPrices(ids: number[]): Promise<void>
  /**
   * @param ago - Ms before the newest snapshot.
   * @returns Newest snapshot and the snapshot in force `ago` before it; null without history.
   */
  pricesAt(ids: number[], ago: number[]): Promise<{ latest: PriceSnapshot; then: PriceSnapshot[] } | null>
  /** @returns Wishlist baselines keyed by line key. */
  getBaselines(): Promise<Record<string, PriceBaseline>>
  /**
   * @param set - Baselines to add or replace, by line key.
   * @param remove - Line keys to delete.
   */
  updateBaselines(set: Record<string, PriceBaseline>, remove: string[]): Promise<void>
  /**
   * @param names - At most 75 names.
   * @returns Small image URL per nameKey; null if none.
   */
  getCardImages(names: string[]): Promise<Record<string, string | null>>
  /** @returns Card data per nameKey; null for names unknown to Scryfall. */
  getCardInfos(names: string[]): Promise<Record<string, CardInfo | null>>
  /**
   * Tokens, emblems and helpers created by cards; never rejects (see {@link DeckTokenData}).
   * @param names - At most 3000 names.
   */
  getDeckTokens(names: string[]): Promise<DeckTokenData>
  getPreconIndex(): Promise<PreconSummary[]>
  getPrecon(fileName: string): Promise<PreconDeck>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  /** @returns Unsubscribe function. */
  onWindowFocus(callback: () => void): () => void
}
