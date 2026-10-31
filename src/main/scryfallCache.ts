import { nameKey } from '@shared/decklist'
import { cardImageUrl } from '@shared/images'
import type { Language } from '@shared/languages'
import { PRINTINGS_MAX_AGE_MS } from '@shared/pricing'
import type { CardInfo, Printing, PrintingsResult, ResolvedCard } from '@shared/types'
import { readCacheFile, writeCacheFile, writeCacheFileNow } from './cacheFiles'

/**
 * Persistent Scryfall cache (`userData/scryfall-cache.json`) of printings and card data, served
 * immediately regardless of age. Saves are debounced. Only Scryfall's EUR trend is stored (guide
 * prices are overlaid at read time). Printings are stored compactly: derivable image and
 * Cardmarket URLs are omitted.
 *
 * Each card is stored once, under its own name; other names for it (a flavor name, a name in another
 * language, text a list left after the name) are aliases of it. The cache keeps the cards the data
 * folder uses ({@link pinCards}) as long as they stay used, and other cards only while recently used:
 * {@link MAX_RECENT} at most, for {@link RECENT_MS}.
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
const VERSION = 19
/** How long a card no list, inventory or trade uses stays cached after its last use. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000
/** Most cards no list, inventory or trade uses kept at once; the least recently used go first. */
export const MAX_RECENT = 500

/** Cached card data with fetch time. */
export interface CachedCardInfo {
  fetchedAt: number
  card: CardInfo
}

/** Compact on-disk printing. */
export type StoredPrinting = Omit<
  Printing,
  'imageSmall' | 'imageNormal' | 'imageBack' | 'cardmarketUrl' | 'cardmarketId' | 'price' | 'priceFoil'
> & {
  /** Set only if not the id-derived URL; null = no image. */
  imageSmall?: string | null
  /** Set only if not the id-derived URL; null = no image. */
  imageNormal?: string | null
  /** Two-sided card with the id-derived back image. */
  back?: true
  /** Back image, set only if not the id-derived URL. */
  imageBack?: string
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
  const { imageSmall, imageNormal, imageBack, cardmarketUrl, cardmarketId, price, priceFoil, ...rest } = printing
  const stored: StoredPrinting = rest
  if (imageSmall !== cardImageUrl(printing.id, 'small')) stored.imageSmall = imageSmall
  if (imageNormal !== cardImageUrl(printing.id, 'normal')) stored.imageNormal = imageNormal
  if (imageBack === cardImageUrl(printing.id, 'normal', 'back')) stored.back = true
  else if (imageBack) stored.imageBack = imageBack
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
  const { imageSmall, imageNormal, back, imageBack, cardmarket, cardmarketId, eur, eurFoil, ...rest } = stored
  return {
    ...rest,
    imageSmall: imageSmall === undefined ? cardImageUrl(stored.id, 'small') : imageSmall,
    imageNormal: imageNormal === undefined ? cardImageUrl(stored.id, 'normal') : imageNormal,
    imageBack: imageBack ?? (back ? cardImageUrl(stored.id, 'normal', 'back') : null),
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
  /** 13: as 12, each card once (with aliases), and when each was last used. 12: as 11, with the card resolver's answers. 11: as 10, with Universes Beyond flags. 10: as 9, with artwork ids. 9: as 8, with partner abilities. 8: compact. 7: compact, no back images. 6: as 7, null prices. 3–5: full printings (3–4 lack newer card data). */
  version: number
  /** Printings results by nameKey. */
  entries: Record<string, Omit<PrintingsResult, 'printings'> & { printings: StoredPrinting[] }>
  /** Card data by nameKey. */
  cards: Record<string, CachedCardInfo>
  /** The card resolver's answers by query key (see `cardResolver`); absent before v12. */
  resolved?: Record<string, CachedResolved>
  /** Other names of cards, by nameKey; absent before v13. */
  aliases?: Record<string, Alias>
  /** When each entry was last used, by nameKey; absent before v13. */
  usedAt?: Record<string, number>
}

/** Another name of a card: a flavor name, a name in another language, or a name with text a list left after it. */
export interface Alias {
  /** The card's own nameKey, its entry's key. */
  key: string
  /** Language the name is printed in; absent for English. */
  lang?: Language
}

/** A card resolver answer, with when Scryfall gave it. */
export interface CachedResolved {
  fetchedAt: number
  /** null: Scryfall knows no such card. */
  card: ResolvedCard | null
}

/** In-memory cache by nameKey, mutated by the Scryfall client; call {@link scryfallCacheChanged} after changes. */
export const scryfallCache = {
  entries: {} as Record<string, PrintingsResult>,
  cards: {} as Record<string, CachedCardInfo>,
  /** By query key: see `cardResolver`. */
  resolved: {} as Record<string, CachedResolved>,
  /** Other names of cards, by nameKey: see {@link Alias}. */
  aliases: {} as Record<string, Alias>,
  /** When each entry was last used (epoch ms), by nameKey; an entry without one was last used when fetched. */
  usedAt: {} as Record<string, number>
}

/** @returns The printings cached for a nameKey, through its alias if it is one (with the alias's language). */
export function cachedEntry(key: string): PrintingsResult | undefined {
  const alias = scryfallCache.aliases[key]
  if (!alias) return scryfallCache.entries[key]
  const entry = scryfallCache.entries[alias.key]
  return entry && alias.lang ? { ...entry, lang: alias.lang } : entry
}

/**
 * Caches a lookup of `key`: under the card's own name, `key` becoming an alias of it if it is another
 * name. Unknown names stay under `key`.
 */
export function storeEntry(key: string, result: PrintingsResult): void {
  const own = nameKey(result.name)
  delete scryfallCache.aliases[key]
  if (result.notFound || own === key) {
    scryfallCache.entries[key] = result
  } else {
    const { lang, ...entry } = result
    scryfallCache.entries[own] = entry
    scryfallCache.aliases[key] = lang ? { key: own, lang } : { key: own }
    delete scryfallCache.entries[key]
  }
  touchEntry(key)
}

/** Records a use of the entry for a nameKey (or the card it is an alias of). */
export function touchEntry(key: string): void {
  scryfallCache.usedAt[scryfallCache.aliases[key]?.key ?? key] = Date.now()
}

/** nameKeys the data folder uses; null until {@link pinCards} is first called, and nothing is dropped. */
let pinned: Set<string> | null = null

/**
 * Sets the cards the data folder's lists, inventory and trades use, which stay cached, then drops the
 * other cards not used for {@link RECENT_MS}, and the least recently used past {@link MAX_RECENT}.
 * @param keys - nameKeys, as the files name the cards (aliases included).
 */
export function pinCards(keys: Iterable<string>): void {
  pinned = new Set([...keys].map((key) => scryfallCache.aliases[key]?.key ?? key))
  if (pruneCache(Date.now())) scryfallCacheChanged()
}

/** Drops cards no file uses past {@link RECENT_MS} or {@link MAX_RECENT}, with their aliases. @returns Whether any went. */
function pruneCache(now: number): boolean {
  if (!pinned) return false
  const { entries, cards, aliases, usedAt } = scryfallCache
  const lastUse = (key: string) => usedAt[key] ?? entries[key]?.fetchedAt ?? cards[key]?.fetchedAt ?? 0
  const unpinned = (keys: string[]) => keys.filter((key) => !pinned!.has(key)).sort((a, b) => lastUse(b) - lastUse(a))
  const drop = (keys: string[]) => keys.filter((key, i) => i >= MAX_RECENT || now - lastUse(key) > RECENT_MS)
  const gone = drop(unpinned(Object.keys(entries)))
  for (const key of gone) delete entries[key]
  const goneCards = drop(unpinned(Object.keys(cards)))
  for (const key of goneCards) delete cards[key]
  for (const [name, alias] of Object.entries(aliases)) if (!entries[alias.key]) delete aliases[name]
  for (const key of Object.keys(usedAt)) if (!entries[key] && !cards[key]) delete usedAt[key]
  return gone.length + goneCards.length > 0
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
      const stale = Date.now() - PRINTINGS_MAX_AGE_MS - 60_000
      // Before v19, card data had no faces with rules text (v18), no mana costs, mana made, ramp or energy
      // (v15), no Game Changer flags, Rulebreakers or Companions, or took them from every face (v14;
      // before v9, no partner abilities): all cards refresh.
      const outdated = file.version < 19
      // Before v18, a reversible card (Secret Lair's two-art printings, "X // X") had mana value 0:
      // those cards go, and are looked up again when needed.
      const twoArt = (info?: CardInfo | null) => file.version < 18 && !!info && /^(.+) \/\/ \1$/.test(info.name)
      for (const [key, entry] of Object.entries(file.entries)) {
        if (!(entry?.fetchedAt > cutoff)) continue
        try {
          const printings = file.version >= 6 ? entry.printings.map(unpackPrinting) : entry.printings.map(fromOldFormat)
          if (!Array.isArray(printings) || twoArt(entry.card)) continue
          // Before v12, a fuzzy match could take a name in another language for the wrong card ("Relampago"
          // for Lightning Greaves): entries found by another name go, and are looked up again when needed.
          const matched = !entry.notFound && nameKey(entry.name) !== key
          if (matched && file.version < 12) continue
          // Before v11, printings had no artwork ids or Universes Beyond flags: all refresh, in the background.
          const fetchedAt = file.version < 11 || outdated ? Math.min(entry.fetchedAt, stale) : entry.fetchedAt
          // Before v13, a card found by another name was stored again under that name: it becomes an alias.
          const own = nameKey(entry.name)
          if (matched && scryfallCache.entries[own]) scryfallCache.aliases[key] = entry.lang ? { key: own, lang: entry.lang } : { key: own }
          else if (matched) {
            const { lang, ...card } = { ...entry, printings, fetchedAt }
            scryfallCache.entries[own] = card
            scryfallCache.aliases[key] = lang ? { key: own, lang } : { key: own }
          }
          else scryfallCache.entries[key] = { ...entry, printings, fetchedAt }
        } catch {}
      }
      for (const [key, info] of Object.entries(file.cards ?? {})) {
        if (info.fetchedAt > cutoff && !outdated && !twoArt(info.card)) scryfallCache.cards[key] = info
      }
      for (const [key, answer] of Object.entries(file.resolved ?? {})) {
        if (answer?.fetchedAt > cutoff) scryfallCache.resolved[key] = answer
      }
      for (const [key, alias] of Object.entries(file.aliases ?? {})) {
        if (scryfallCache.entries[alias?.key] && !scryfallCache.entries[key]) scryfallCache.aliases[key] = alias
      }
      Object.assign(scryfallCache.usedAt, file.usedAt ?? {})
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

/** @returns Scryfall ids of every cached printing, whose saved images stay (see `cardImages`). */
export function cachedPrintingIds(): Set<string> {
  const ids = new Set<string>()
  for (const entry of Object.values(scryfallCache.entries)) for (const printing of entry.printings) ids.add(printing.id)
  return ids
}

/** @returns On-disk form of the current cache. */
function snapshot(): CacheFile {
  const entries: CacheFile['entries'] = {}
  for (const [key, entry] of Object.entries(scryfallCache.entries)) {
    entries[key] = { ...entry, printings: entry.printings.map(packPrinting) }
  }
  const { cards, resolved, aliases, usedAt } = scryfallCache
  return { version: VERSION, entries, cards: { ...cards }, resolved: { ...resolved }, aliases: { ...aliases }, usedAt: { ...usedAt } }
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
