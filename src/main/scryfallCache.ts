import { cardImageUrl } from '../shared/images'
import { PRINTINGS_MAX_AGE_MS } from '../shared/pricing'
import type { CardInfo, Printing, PrintingsResult } from '../shared/types'
import { readCacheFile, writeCacheFile, writeCacheFileNow } from './cacheFiles'

// Scryfall answers kept on disk (userData/scryfall-cache.json): each card's printings
// and card data, shown instantly on launch however old. Loaded in the background while
// the window opens; lookups wait for it. Saved a moment after changes.
//
// Prices are not kept here: they come from Cardmarket's price guide (priceGuide.ts),
// except Scryfall's own trend price, the fallback for printings the guide lacks.
//
// On disk, each printing leaves out what can be rebuilt (image addresses come from
// the card's id, Cardmarket product pages from their number), roughly halving the file.

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SAVE_DELAY_MS = 2_000
// During a long refresh, changes keep coming: save at least this often anyway.
const MAX_SAVE_DELAY_MS = 10_000
const VERSION = 7

export interface CachedCardInfo {
  fetchedAt: number
  card: CardInfo
}

/** A printing as stored on disk. */
export type StoredPrinting = Omit<
  Printing,
  'imageSmall' | 'imageNormal' | 'cardmarketUrl' | 'cardmarketId' | 'price' | 'priceFoil'
> & {
  /** Only when not at the usual address for the card's id (null: no image). */
  imageSmall?: string | null
  imageNormal?: string | null
  /** A Cardmarket product number (its page and id), or the whole link when it isn't a product page. */
  cardmarket?: number | string
  /** The Cardmarket product number, when `cardmarket` doesn't already give it. */
  cardmarketId?: number
  /** Scryfall's EUR trend prices (null in version 6 files: none). */
  eur?: number | null
  eurFoil?: number | null
}

const CARDMARKET_PRODUCT =
  /^https:\/\/www\.cardmarket\.com\/en\/Magic\/Products\?idProduct=(\d+)&referrer=scryfall&utm_campaign=card_prices&utm_medium=text&utm_source=scryfall$/
const cardmarketProduct = (id: number) =>
  `https://www.cardmarket.com/en/Magic/Products?idProduct=${id}&referrer=scryfall&utm_campaign=card_prices&utm_medium=text&utm_source=scryfall`

/** Only Scryfall's trend is stored: guide prices are added on the way out, never cached here. */
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

/** Reads version 6 and 7 printings. */
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

/** A printing from a version 3–5 file: whole, with links instead of numbers and versioned image addresses. */
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

interface CacheFile {
  /**
   * 7: compact printings. 6: the same, with null for a missing price. 3–5: printings
   * stored whole (3 and 4 also lack newer card data, so they refresh).
   */
  version: number
  entries: Record<string, Omit<PrintingsResult, 'printings'> & { printings: StoredPrinting[] }>
  cards: Record<string, CachedCardInfo>
}

/** The cached Scryfall answers, by card name key. Read and changed by the Scryfall client. */
export const scryfallCache = {
  entries: {} as Record<string, PrintingsResult>,
  cards: {} as Record<string, CachedCardInfo>
}

const FILE = 'scryfall-cache.json'

let loading: Promise<void> | null = null
let loaded = false

/** Starts reading the cache from disk (once; later calls share the same read). */
export function loadScryfallCache(): Promise<void> {
  loading ??= (async () => {
    let upgrade = false
    try {
      const file = await readCacheFile<CacheFile>(FILE)
      if (!file) return
      upgrade = file.version < VERSION
      if (file.version < 3 || file.version > VERSION) return
      const cutoff = Date.now() - CACHE_MAX_AGE_MS
      // Versions 3 and 4 lack newer card data: shown, but refreshed soon.
      const stale = file.version < 5 ? Date.now() - PRINTINGS_MAX_AGE_MS - 60_000 : Infinity
      for (const [key, entry] of Object.entries(file.entries)) {
        if (!(entry?.fetchedAt > cutoff)) continue
        try {
          const printings = file.version >= 6 ? entry.printings.map(unpackPrinting) : entry.printings.map(fromOldFormat)
          if (!Array.isArray(printings)) continue
          scryfallCache.entries[key] = { ...entry, printings, fetchedAt: Math.min(entry.fetchedAt, stale) }
        } catch {
          // A damaged entry: that card is simply looked up again.
        }
      }
      for (const [key, info] of Object.entries(file.cards ?? {})) {
        if (info.fetchedAt > cutoff) scryfallCache.cards[key] = info
      }
    } catch {
      // No cache yet, or unreadable: card data is simply downloaded again.
    } finally {
      loaded = true
    }
    // An older file is rewritten in the current, smaller format.
    if (upgrade) scryfallCacheChanged()
  })()
  return loading
}

/** Resolves once the cache has been read, reading it now if startup hasn't already. */
export function scryfallCacheReady(): Promise<void> {
  return loadScryfallCache()
}

/** What goes on disk, taken now (later changes are saved next time). */
function snapshot(): CacheFile {
  const entries: CacheFile['entries'] = {}
  for (const [key, entry] of Object.entries(scryfallCache.entries)) {
    entries[key] = { ...entry, printings: entry.printings.map(packPrinting) }
  }
  return { version: VERSION, entries, cards: { ...scryfallCache.cards } }
}

let saveTimer: NodeJS.Timeout | null = null
let dirtySince = 0
let writing: Promise<void> = Promise.resolve()

function save(): void {
  saveTimer = null
  dirtySince = 0
  const data = snapshot()
  // One write at a time, each replacing the file whole.
  writing = writing.then(() => writeCacheFile(FILE, data))
}

/** Records that the cache changed; it is saved shortly after. */
export function scryfallCacheChanged(): void {
  if (loading && !loaded) return // never overwrite a cache that is still being read
  const now = Date.now()
  dirtySince ||= now
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(save, now - dirtySince >= MAX_SAVE_DELAY_MS ? 0 : SAVE_DELAY_MS)
}

/** Saves pending changes right away (when the app quits). */
export function flushScryfallCache(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  dirtySince = 0
  writeCacheFileNow(FILE, snapshot())
}

/** Waits for saves in progress (for tests). */
export function scryfallCacheSaved(): Promise<void> {
  return writing
}
