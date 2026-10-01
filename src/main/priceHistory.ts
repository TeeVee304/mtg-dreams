import type { PriceBaseline, PriceSnapshot } from '../shared/api'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { guideTrend, loadPriceGuide, priceGuideDate } from './priceGuide'

// Cardmarket's price guide only ever holds today's prices, so the app keeps its own
// history (userData/price-history.json): each day's typical price (the trend) for the
// versions your inventory is valued at, which the app tells it about ("tracked").
// Snapshots build up from the first day a version is tracked.
//
// The file also keeps each wishlist card's price when it first appeared on a
// wishlist (its baseline), for price-drop alerts.

const FILE = 'price-history.json'
const VERSION = 1
/** Days of snapshots kept: a little over a year. */
const MAX_DAYS = 400
/** Versions tracked at most (a very large collection). */
const MAX_TRACKED = 50_000

interface HistoryFile {
  version: number
  tracked: number[]
  /** Oldest first, one per guide (Cardmarket publishes daily). */
  days: PriceSnapshot[]
  baselines: Record<string, PriceBaseline>
}

let history: HistoryFile | null = null
let loading: Promise<HistoryFile> | null = null
let writing: Promise<void> = Promise.resolve()

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

function save(file: HistoryFile): Promise<void> {
  writing = writing.then(() => writeCacheFile(FILE, file))
  return writing
}

/**
 * Records the prices published on `date` for every tracked version still missing
 * from that day. `lookup` gives a version's [non-foil, foil] trend (0 = none).
 * Resolves to whether anything was added.
 */
export async function recordPrices(date: number, lookup: (id: number) => [number, number] | undefined): Promise<boolean> {
  const file = await load()
  const last = file.days.at(-1)
  if (last && last.date > date) return false // an older guide than the newest day recorded
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

/** Records today's guide prices for the tracked versions (when a new guide arrives, and on tracking). */
export async function recordCurrentPrices(): Promise<void> {
  await loadPriceGuide()
  const date = priceGuideDate()
  if (date !== null) await recordPrices(date, guideTrend)
}

/** Sets which versions (Cardmarket product numbers) to keep a history of, and records today's prices for them. */
export async function trackPrices(ids: number[]): Promise<void> {
  const file = await load()
  const tracked = [...new Set(ids)].slice(0, MAX_TRACKED).sort((a, b) => a - b)
  if (tracked.join() === file.tracked.join()) return
  file.tracked = tracked
  await save(file)
  await recordCurrentPrices()
}

/**
 * The newest snapshot, and for each moment in `at` the snapshot in force then: the
 * newest one not after it, or the oldest one when the history doesn't go back that
 * far. Only the prices of `ids` are returned. Null without any history.
 */
export async function pricesAt(ids: number[], at: number[]): Promise<{ latest: PriceSnapshot; then: PriceSnapshot[] } | null> {
  const { days } = await load()
  if (days.length === 0) return null
  const pick = (day: PriceSnapshot): PriceSnapshot => {
    const prices: PriceSnapshot['prices'] = {}
    for (const id of ids) if (day.prices[id]) prices[id] = day.prices[id]
    return { date: day.date, prices }
  }
  const then = at.map((moment) => pick([...days].reverse().find((day) => day.date <= moment) ?? days[0]))
  return { latest: pick(days[days.length - 1]), then }
}

export async function getBaselines(): Promise<Record<string, PriceBaseline>> {
  return { ...(await load()).baselines }
}

/** Adds or replaces wishlist baselines, and forgets those of cards no longer on any wishlist. */
export async function updateBaselines(set: Record<string, PriceBaseline>, remove: string[]): Promise<void> {
  const file = await load()
  Object.assign(file.baselines, set)
  for (const key of remove) delete file.baselines[key]
  await save(file)
}

/** Waits for saves in progress (for tests). */
export function priceHistorySaved(): Promise<void> {
  return writing
}
