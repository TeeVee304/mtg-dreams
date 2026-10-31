/**
 * Card images in a copy's printed language, for the hover preview: looked up only when a card is
 * hovered, then cached in userData. A miss (no scan in that language) is cached too, for less long.
 *
 * @packageDocumentation
 */

import { nameKey } from '@shared/decklist'
import type { LocalizedImage, LocalizedQuery } from '@shared/types'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { searchLocalized } from './scryfall'

/** Cache file name. */
const FILE = 'localized-images.json'
/** Cache schema version: before 2, answers had no printed text. */
const VERSION = 2
/** How long found images are kept. */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** How long a miss is kept: Scryfall adds scans over time. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** On-disk cache: images (null for none) by {@link keyOf}, with fetch time. */
interface ImageCache {
  version: number
  entries: Record<string, { at: number; image: LocalizedImage | null }>
}

/** In-memory cache. */
let cache: ImageCache | null = null
/** Lookups in progress, by key: a card hovered twice is looked up once. */
const pending = new Map<string, Promise<LocalizedImage | null>>()

/** @returns The cache, loaded once; an invalid file resets it. */
async function load(): Promise<ImageCache> {
  if (cache) return cache
  const file = await readCacheFile<ImageCache>(FILE)
  cache = file?.version === VERSION && file.entries ? file : { version: VERSION, entries: {} }
  return cache
}

/** @returns A query's cache key: card, language and the printing asked for. */
export const keyOf = ({ name, lang, set, collector }: LocalizedQuery) =>
  [nameKey(name), lang, set?.toLowerCase() ?? '', collector ?? ''].join('|')

/**
 * @returns A Card's images in its printed language ({@link searchLocalized}); a cached answer while
 * fresh. Never rejects: offline, a stale answer, else null, and nothing is cached.
 */
export async function getLocalizedImage(query: LocalizedQuery): Promise<LocalizedImage | null> {
  const store = await load()
  const key = keyOf(query)
  const known = store.entries[key]
  if (known && Date.now() - known.at < (known.image ? FOUND_TTL_MS : MISS_TTL_MS)) return known.image
  const running = pending.get(key)
  if (running) return running
  const lookup = searchLocalized(query)
    .then(async (image) => {
      store.entries[key] = { at: Date.now(), image }
      await writeCacheFile(FILE, store)
      return image
    })
    .catch(() => known?.image ?? null)
    .finally(() => pending.delete(key))
  pending.set(key, lookup)
  return lookup
}
