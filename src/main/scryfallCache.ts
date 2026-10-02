import { cardImageUrl } from '../shared/images'
import { PRINTINGS_MAX_AGE_MS } from '../shared/pricing'
import type { CardInfo, Printing, PrintingsResult } from '../shared/types'
import { readCacheFile, writeCacheFile, writeCacheFileNow } from './cacheFiles'

/**
 * Persistent Scryfall cache (`userData/scryfall-cache.json`) of printings and card data, served
 * immediately regardless of age. Saves are debounced. Only Scryfall's EUR trend is stored (guide
 * prices are overlaid at read time). Printings are stored compactly: derivable image and
 * Cardmarket URLs are omitted.
 *
 * @packageDocumentation
 */

/** Entries older than this are dropped on load. */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** Save debounce delay. */
const SAVE_DELAY_MS = 2_000
/** Max time changes stay unsaved under continuous updates. */
const MAX_SAVE_DELAY_MS = 60_000
/** Cache schema version. */
const VERSION = 7

/** Cached card data with fetch time. */
export interface CachedCardInfo {
  fetchedAt: number
  card: CardInfo
}

/** Compact on-disk printing. */
export type StoredPrinting = Omit<
  Printing,
  'imageSmall' | 'imageNormal' | 'cardmarketUrl' | 'cardmarketId' | 'price' | 'priceFoil'
> & {
  /** Set only if not the id-derived URL; null = no image. */
  imageSmall?: string | null
  /** Set only if not the id-derived URL; null = no image. */
  imageNormal?: string | null
  /** Product id (derives URL and id), or the full URL if not a standard product link. */
  cardmarket?: number | string
  /** Product id, if not implied by `cardmarket`. */
  cardmarketId?: number
  /** Scryfall EUR trend, non-foil; null in v6 means none. */
  eur?: number | null
  /** Scryfall EUR trend, foil; null in v6 means none. */
  eurFoil?: number | null
}

/** Standard Scryfall-generated Cardmarket product URL. */
const CARDMARKET_PRODUCT =
  /^https:\/\/www\.cardmarket\.com\/en\/Magic\/Products\?idProduct=(\d+)&referrer=scryfall&utm_campaign=card_prices&utm_medium=text&utm_source=scryfall$/
/** Builds a {@link CARDMARKET_PRODUCT} URL. */
const cardmarketProduct = (id: number) =>
  `https://www.cardmarket.com/en/Magic/Products?idProduct=${id}&referrer=scryfall&utm_campaign=card_prices&utm_medium=text&utm_source=scryfall`

/** @returns Compact form; only Scryfall trend prices are kept. */
export function packPrinting(printing: Printing): StoredPrinting {
  const { imageSmall, imageNormal, cardmarketUrl, cardmarketId, price, priceFoil, ...rest } = printing
  const stored: StoredPrinting = rest
  if (imageSmall !== cardImageUrl(printing.id, 'small')) stored.imageSmall = imageSmall
  if (imageNormal !== cardImageUrl(printing.id, 'normal')) stored.imageNormal = imageNormal
  const product = CARDMARKET_PRODUCT.exec(cardmarketUrl ?? '')
  if (product) stored.cardmarket = Number(product[1])
  else if (cardmarketUrl) stored.cardmarket = cardmarketUrl
  if (cardmarketId !== null && cardmarketId !== stored.cardmarket) stored.cardmarketId = cardmarketId
  if (price.trend !== undefined) stored.eur = price.trend
  if (priceFoil.trend !== undefined) stored.eurFoil = priceFoil.trend
  return stored
}

/** @returns Printing from a v6/v7 compact form. */
export function unpackPrinting(stored: StoredPrinting): Printing {
  const { imageSmall, imageNormal, cardmarket, cardmarketId, eur, eurFoil, ...rest } = stored
  return {
    ...rest,
    imageSmall: imageSmall === undefined ? cardImageUrl(stored.id, 'small') : imageSmall,
    imageNormal: imageNormal === undefined ? cardImageUrl(stored.id, 'normal') : imageNormal,
    cardmarketUrl: typeof cardmarket === 'number' ? cardmarketProduct(cardmarket) : (cardmarket ?? null),
    cardmarketId: cardmarketId ?? (typeof cardmarket === 'number' ? cardmarket : null),
    price: typeof eur === 'number' ? { trend: eur } : {},
    priceFoil: typeof eurFoil === 'number' ? { trend: eurFoil } : {}
  }
}

/** Converts a v3–v5 printing (full URLs, query-versioned image URLs). */
function fromOldFormat(stored: unknown): Printing {
  const old = stored as StoredPrinting & { cardmarketUrl?: string | null; scryfallUrl?: string }
  const { scryfallUrl: _unused, cardmarketUrl, imageSmall, imageNormal, ...rest } = old
  const product = CARDMARKET_PRODUCT.exec(cardmarketUrl ?? '')
  return unpackPrinting({
    ...rest,
    imageSmall: imageSmall?.split('?')[0] ?? null,
    imageNormal: imageNormal?.split('?')[0] ?? null,
    cardmarket: product ? Number(product[1]) : (cardmarketUrl ?? undefined)
  })
}

/** On-disk cache. */
interface CacheFile {
  /** 7: compact. 6: compact, null prices. 3–5: full printings (3–4 lack newer card data). */
  version: number
  /** Printings results by nameKey. */
  entries: Record<string, Omit<PrintingsResult, 'printings'> & { printings: StoredPrinting[] }>
  /** Card data by nameKey. */
  cards: Record<string, CachedCardInfo>
}

/** In-memory cache by nameKey, mutated by the Scryfall client; call {@link scryfallCacheChanged} after changes. */
export const scryfallCache = {
  entries: {} as Record<string, PrintingsResult>,
  cards: {} as Record<string, CachedCardInfo>
}

/** Cache file name. */
const FILE = 'scryfall-cache.json'

let loading: Promise<void> | null = null
/** Load finished; saves are allowed. */
let loaded = false

/**
 * Loads the cache once (shared promise). Drops expired and damaged entries, marks v3–v4 entries
 * stale, and schedules a rewrite for older versions. Read errors are ignored.
 */
export function loadScryfallCache(): Promise<void> {
  loading ??= (async () => {
    let upgrade = false
    try {
      const file = await readCacheFile<CacheFile>(FILE)
      if (!file) return
      upgrade = file.version < VERSION
      if (file.version < 3 || file.version > VERSION) return
      const cutoff = Date.now() - CACHE_MAX_AGE_MS
      const stale = file.version < 5 ? Date.now() - PRINTINGS_MAX_AGE_MS - 60_000 : Infinity
      for (const [key, entry] of Object.entries(file.entries)) {
        if (!(entry?.fetchedAt > cutoff)) continue
        try {
          const printings = file.version >= 6 ? entry.printings.map(unpackPrinting) : entry.printings.map(fromOldFormat)
          if (!Array.isArray(printings)) continue
          scryfallCache.entries[key] = { ...entry, printings, fetchedAt: Math.min(entry.fetchedAt, stale) }
        } catch {}
      }
      for (const [key, info] of Object.entries(file.cards ?? {})) {
        if (info.fetchedAt > cutoff) scryfallCache.cards[key] = info
      }
    } catch {
    } finally {
      loaded = true
    }
    if (upgrade) scryfallCacheChanged()
  })()
  return loading
}

/** @returns Promise resolving once the cache is loaded; starts loading if needed. */
export function scryfallCacheReady(): Promise<void> {
  return loadScryfallCache()
}

/** @returns On-disk form of the current cache. */
function snapshot(): CacheFile {
  const entries: CacheFile['entries'] = {}
  for (const [key, entry] of Object.entries(scryfallCache.entries)) {
    entries[key] = { ...entry, printings: entry.printings.map(packPrinting) }
  }
  return { version: VERSION, entries, cards: { ...scryfallCache.cards } }
}

let saveTimer: NodeJS.Timeout | null = null
/** Epoch ms of the first unsaved change; 0 if clean. */
let dirtySince = 0
let writing: Promise<void> = Promise.resolve()

/** Snapshots the cache and queues a whole-file write after pending ones. */
function save(): void {
  saveTimer = null
  dirtySince = 0
  const data = snapshot()
  writing = writing.then(() => writeCacheFile(FILE, data))
}

/**
 * Schedules a debounced save ({@link SAVE_DELAY_MS}, forced after {@link MAX_SAVE_DELAY_MS}).
 * No-op while loading, to avoid overwriting the unread file.
 */
export function scryfallCacheChanged(): void {
  if (loading && !loaded) return
  const now = Date.now()
  dirtySince ||= now
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(save, now - dirtySince >= MAX_SAVE_DELAY_MS ? 0 : SAVE_DELAY_MS)
}

/** Synchronously writes pending changes (on quit). */
export function flushScryfallCache(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  dirtySince = 0
  writeCacheFileNow(FILE, snapshot())
}

/** @returns Promise settling after pending writes (tests). */
export function scryfallCacheSaved(): Promise<void> {
  return writing
}
