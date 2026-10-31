import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CacheGroup, CacheSizes } from '@shared/api'
import { freezeCacheFiles, removeCacheEntries } from './cacheFiles'
import { IMAGES_FOLDER } from './cardImages'
import { env } from './environment'
import { scryfallCache } from './scryfallCache'

/**
 * What Settings shows of the caches in userData, and its one button that clears them. Everything here
 * downloads again; the price history (a record that cannot be downloaded again), the settings and the
 * data folder are never touched.
 *
 * @packageDocumentation
 */

/** Cache files and folders under userData, by what Settings calls them. */
export const CACHE_GROUPS: Record<CacheGroup, string[]> = {
  cards: ['scryfall-cache.json', 'rulings.json', 'localized-images.json'],
  prices: ['price-guide.json'],
  images: [IMAGES_FOLDER],
  precons: ['precons'],
  edhrec: ['edhrec'],
  tokens: ['token-cache.json'],
  setGroups: ['set-groups.json']
}

/** @returns Bytes of a file, or of a folder with what it holds; 0 if missing. */
async function sizeOf(path: string): Promise<number> {
  try {
    const info = await stat(path)
    if (!info.isDirectory()) return info.size
    const names = await readdir(path)
    let total = 0
    for (const name of names) total += await sizeOf(join(path, name))
    return total
  } catch {
    return 0
  }
}

/** @returns Bytes on disk of each cache group, and how many Cards the Scryfall cache holds. */
export async function cacheSizes(): Promise<CacheSizes> {
  const entries = await Promise.all(
    Object.entries(CACHE_GROUPS).map(async ([group, names]) => {
      const sizes = await Promise.all(names.map((name) => sizeOf(join(env().userData, name))))
      return [group, sizes.reduce((sum, size) => sum + size, 0)] as const
    })
  )
  return { bytes: Object.fromEntries(entries) as Record<CacheGroup, number>, cards: Object.keys(scryfallCache.entries).length }
}

/**
 * Deletes every cache group. Cache writes stop first, so nothing writes a cache back before the app
 * restarts; the caller restarts it, so what is in memory goes too.
 */
export async function clearCaches(): Promise<void> {
  freezeCacheFiles()
  await removeCacheEntries(Object.values(CACHE_GROUPS).flat())
}
