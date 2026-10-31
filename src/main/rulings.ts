/**
 * Card rulings, for the card dialog: looked up when a card's dialog opens, then cached in userData,
 * so a card seen once shows its rulings offline. Rulings belong to the card, not the printing.
 *
 * @packageDocumentation
 */

import { nameKey } from '@shared/decklist'
import type { Ruling } from '@shared/types'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { fetchRulings } from './scryfall'

/** Cache file name. */
const FILE = 'rulings.json'
/** Cache schema version. */
const VERSION = 1
/** How long rulings are kept before they are looked up again: new ones come with new sets. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000

/** On-disk cache: rulings by card name key, with fetch time. */
interface RulingsCache {
  version: number
  entries: Record<string, { at: number; rulings: Ruling[] }>
}

/** In-memory cache. */
let cache: RulingsCache | null = null
/** Lookups in progress, by card: a dialog opened twice looks its card up once. */
const pending = new Map<string, Promise<Ruling[] | null>>()

/** @returns The cache, loaded once; an invalid file resets it. */
async function load(): Promise<RulingsCache> {
  if (cache) return cache
  const file = await readCacheFile<RulingsCache>(FILE)
  cache = file?.version === VERSION && file.entries ? file : { version: VERSION, entries: {} }
  return cache
}

/**
 * @returns A card's rulings, newest first ({@link fetchRulings}, by the Scryfall id of one of its
 * printings); the cached ones while fresh. Never rejects: offline, the cached ones however old, else
 * null (unknown), and nothing is cached.
 */
export async function getRulings(name: string, id: string): Promise<Ruling[] | null> {
  const store = await load()
  const key = nameKey(name)
  const known = store.entries[key]
  if (known && Date.now() - known.at < TTL_MS) return known.rulings
  const running = pending.get(key)
  if (running) return running
  const lookup = fetchRulings(id)
    .then(async (rulings) => {
      store.entries[key] = { at: Date.now(), rulings }
      await writeCacheFile(FILE, store)
      return rulings
    })
    .catch(() => known?.rulings ?? null)
    .finally(() => pending.delete(key))
  pending.set(key, lookup)
  return lookup
}
