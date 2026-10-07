import type { PriceBaseline, PriceSnapshot } from '@shared/api'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { guideTrend, loadPriceGuide, priceGuideDate } from './priceGuide'

/**
 * Local price history (`userData/price-history.json`): daily trend prices of tracked Cardmarket
 * products, accumulated from the day each is tracked, plus wishlist baselines for price-drop alerts.
 *
 * @packageDocumentation
 */

/** History file name. */
const FILE = 'price-history.json'
/** History schema version. */
const VERSION = 1
/** Max snapshots retained (~13 months). */
const MAX_DAYS = 400
/** Max tracked product ids. */
const MAX_TRACKED = 50_000

/** On-disk history. */
interface HistoryFile {
  version: number
  /** Tracked product ids, ascending. */
  tracked: number[]
  /** Snapshots, oldest first, one per guide publication. */
  days: PriceSnapshot[]
  /** Wishlist baselines by line key. */
  baselines: Record<string, PriceBaseline>
}

let history: HistoryFile | null = null
let loading: Promise<HistoryFile> | null = null
let writing: Promise<void> = Promise.resolve()

/** Loads the history once; invalid files reset to empty. */
function load(): Promise<HistoryFile> {
  loading ??= (async () => {
    const file = await readCacheFile<HistoryFile>(FILE)
    history =
      file?.version === VERSION && Array.isArray(file.days)
        ? { version: VERSION, tracked: file.tracked ?? [], days: file.days, baselines: file.baselines ?? {} }
        : { version: VERSION, tracked: [], days: [], baselines: {} }
    return history
  })()
  return loading
}

/** Queues a whole-file write after pending ones. */
function save(file: HistoryFile): Promise<void> {
  writing = writing.then(() => writeCacheFile(FILE, file))
  return writing
}

/**
 * Adds prices for tracked ids missing from the `date` snapshot, creating it if new. Ignored if
 * older than the newest snapshot.
 * @param lookup - `[nonFoil, foil]` trend per id (0 = none).
 * @returns Whether any price was added.
 */
export async function recordPrices(date: number, lookup: (id: number) => [number, number] | undefined): Promise<boolean> {
  const file = await load()
  const last = file.days.at(-1)
  if (last && last.date > date) return false
  const day = last?.date === date ? last : { date, prices: {} }
  let added = false
  for (const id of file.tracked) {
    if (String(id) in day.prices) continue
    const prices = lookup(id)
    if (prices && (prices[0] > 0 || prices[1] > 0)) {
      day.prices[id] = prices
      added = true
    }
  }
  if (!added) return false
  if (day !== last) {
    file.days.push(day)
    if (file.days.length > MAX_DAYS) file.days.splice(0, file.days.length - MAX_DAYS)
  }
  await save(file)
  return true
}

/** Records the loaded guide's prices for tracked ids. */
export async function recordCurrentPrices(): Promise<void> {
  await loadPriceGuide()
  const date = priceGuideDate()
  if (date !== null) await recordPrices(date, guideTrend)
}

/** Replaces the tracked id set (deduplicated, capped at {@link MAX_TRACKED}) and records current prices if it changed. */
export async function trackPrices(ids: number[]): Promise<void> {
  const file = await load()
  const tracked = [...new Set(ids)].slice(0, MAX_TRACKED).sort((a, b) => a - b)
  if (tracked.join() === file.tracked.join()) return
  file.tracked = tracked
  await save(file)
  await recordCurrentPrices()
}

/**
 * Periods are measured back from the newest snapshot, not the clock, so a stale guide still
 * compares across full periods.
 * @param ids - Product ids to include.
 * @param ago - Ms before the newest snapshot.
 * @returns Newest snapshot and, per `ago`, the newest snapshot not after that moment (oldest if
 * none), filtered to `ids`; null without history.
 */
export async function pricesAt(ids: number[], ago: number[]): Promise<{ latest: PriceSnapshot; then: PriceSnapshot[] } | null> {
  const { days } = await load()
  if (days.length === 0) return null
  const pick = (day: PriceSnapshot): PriceSnapshot => {
    const prices: PriceSnapshot['prices'] = {}
    for (const id of ids) if (day.prices[id]) prices[id] = day.prices[id]
    return { date: day.date, prices }
  }
  const latest = days[days.length - 1]
  const then = ago.map((span) => pick([...days].reverse().find((day) => day.date <= latest.date - span) ?? days[0]))
  return { latest: pick(latest), then }
}

/** @returns Copy of all wishlist baselines. */
export async function getBaselines(): Promise<Record<string, PriceBaseline>> {
  return { ...(await load()).baselines }
}

/** Upserts `set` and deletes `remove` keys. */
export async function updateBaselines(set: Record<string, PriceBaseline>, remove: string[]): Promise<void> {
  const file = await load()
  Object.assign(file.baselines, set)
  for (const key of remove) delete file.baselines[key]
  await save(file)
}

/** @returns Promise settling after pending writes (tests). */
export function priceHistorySaved(): Promise<void> {
  return writing
}
