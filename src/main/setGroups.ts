/**
 * Set groups to prefer Versions from ({@link SetGroup}), built from Scryfall's sets and cached in
 * userData for a week. Whether a set is a Universes Beyond franchise comes with the app for the sets
 * it knows ({@link KNOWN_FRANCHISES}); newer ones are looked up once and kept, ahead of other
 * Scryfall requests. A stale cache is served offline.
 *
 * @packageDocumentation
 */

import type { SetGroupsProgress } from '@shared/api'
import { buildSetGroups, FRANCHISE_SHARE, franchiseCandidates, KNOWN_FRANCHISES, type SetGroup, type SetSummary } from '@shared/setGroups'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { countUniversesBeyond, fetchSets } from './scryfall'

/** Cache file name. */
const FILE = 'set-groups.json'

/** Cache schema version; 2 added short names and icons, 3 merged universes (Marvel, Middle-earth), 4 added Edge of Eternities, 5 Forgotten Realms, 6 more worlds and sets. */
const VERSION = 6

/** Groups TTL: new sets appear a few times a year. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** On-disk cache. */
interface SetGroupsCache {
  version: number
  fetchedAt: number
  groups: SetGroup[]
  /** Whether each checked set is a Universes Beyond franchise, by code. */
  franchise: Record<string, boolean>
}

/** In-memory cache. */
let cache: SetGroupsCache | null = null
/** Pending refresh, shared by concurrent callers. */
let refreshing: Promise<SetGroup[]> | null = null

/** @returns The cache, loaded once; invalid or older files give none. */
async function load(): Promise<SetGroupsCache | null> {
  if (cache) return cache
  const file = await readCacheFile<SetGroupsCache>(FILE)
  cache = file?.version === VERSION && Array.isArray(file.groups) ? file : null
  return cache
}

/**
 * Fetches the sets, checks the candidates the app doesn't know yet, and caches the groups. A set not
 * released yet may have no Cards to tell by, so its answer isn't kept.
 */
async function refresh(previous: SetGroupsCache | null, onProgress: (progress: SetGroupsProgress) => void): Promise<SetGroup[]> {
  const sets: SetSummary[] = await fetchSets()
  const franchise = { ...KNOWN_FRANCHISES, ...previous?.franchise }
  const candidates = franchiseCandidates(sets)
  const unknown = candidates.filter((set) => !(set.code in franchise))
  const today = new Date().toISOString().slice(0, 10)
  const found: Record<string, boolean> = {}
  for (const [index, set] of unknown.entries()) {
    onProgress({ checked: index, of: unknown.length })
    const count = await countUniversesBeyond(set.code)
    const size = set.card_count ?? 0
    found[set.code] = size > 0 && count / size >= FRANCHISE_SHARE
    if ((set.released_at ?? '') <= today) franchise[set.code] = found[set.code]
  }
  const groups = buildSetGroups(
    sets,
    candidates.filter((set) => franchise[set.code] ?? found[set.code]).map((set) => set.code)
  )
  cache = { version: VERSION, fetchedAt: Date.now(), groups, franchise }
  await writeCacheFile(FILE, cache)
  return groups
}

/**
 * @param onProgress - Told how many unknown sets are checked, while some are.
 * @returns Set groups: from the cache while fresh, else refreshed. A failed refresh serves the stale
 * cache, or none.
 */
export async function getSetGroups(onProgress: (progress: SetGroupsProgress) => void = () => undefined): Promise<SetGroup[]> {
  const cached = await load()
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.groups
  refreshing ??= refresh(cached, onProgress)
    .catch(() => cached?.groups ?? [])
    .finally(() => (refreshing = null))
  return refreshing
}
