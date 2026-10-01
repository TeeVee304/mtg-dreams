import type { PriceBasis, Prices, PrintingsResult } from '../shared/types'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { env } from './environment'
import { fetchJson, fetchLastModified } from './http'

// Cardmarket's price guide: one file, published daily, with the prices of every Magic
// product (trend, lowest listing and 30-day average, for non-foil and foil). It is
// checked hourly by its date alone, and downloaded (about 26 MB) only when Cardmarket
// has published a new one. A compact copy (about 5 MB) is kept in userData.
//
// Printings come from Scryfall; their Cardmarket product number links the two.

const FILE = 'price-guide.json'
const VERSION = 1
const DOWNLOAD_TIMEOUT_MS = 180_000
const CHECK_EVERY_MS = 60 * 60 * 1000
// Without a date to compare (a server that doesn't send one), download at most this often.
const MIN_DOWNLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000

const BASES: PriceBasis[] = ['low', 'trend', 'avg30']
/** One product's prices, in BASES order for non-foil then foil; 0 = no price. */
type Row = [number, number, number, number, number, number]

interface Guide {
  /** When Cardmarket published these prices. */
  createdAt: number
  /** When they were downloaded. */
  fetchedAt: number
  lastModified: string | null
  rows: Map<number, Row>
}

interface GuideFile {
  version: number
  createdAt: number
  fetchedAt: number
  lastModified: string | null
  rows: Record<string, Row>
}

let guide: Guide | null = null
let loading: Promise<void> | null = null
let refreshing: Promise<boolean> | null = null

/** Reads the saved guide from disk (once; later calls share the same read). */
export function loadPriceGuide(): Promise<void> {
  loading ??= (async () => {
    const file = await readCacheFile<GuideFile>(FILE)
    // None yet, unreadable or outdated: downloaded again.
    if (file?.version !== VERSION || typeof file.rows !== 'object') return
    const rows = new Map(Object.entries(file.rows).map(([id, row]) => [Number(id), row] as const))
    guide = { createdAt: file.createdAt, fetchedAt: file.fetchedAt, lastModified: file.lastModified, rows }
  })()
  return loading
}

const positive = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0)

function toGuide(data: any, lastModified: string | null): Guide {
  const rows = new Map<number, Row>()
  for (const p of data.priceGuides as any[]) {
    if (!Number.isSafeInteger(p?.idProduct)) continue
    rows.set(p.idProduct, [
      positive(p.low), positive(p.trend), positive(p.avg30),
      positive(p['low-foil']), positive(p['trend-foil']), positive(p['avg30-foil'])
    ])
  }
  const createdAt = Date.parse(data.createdAt)
  return { createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt, fetchedAt: Date.now(), lastModified, rows }
}

function save(next: Guide): Promise<void> {
  const file: GuideFile = {
    version: VERSION,
    createdAt: next.createdAt,
    fetchedAt: next.fetchedAt,
    lastModified: next.lastModified,
    rows: Object.fromEntries(next.rows)
  }
  return writeCacheFile(FILE, file)
}

/** Downloads the guide if Cardmarket has published a new one. Resolves to whether prices changed. */
export function refreshPriceGuide(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      await loadPriceGuide()
      const url = env().priceGuideUrl
      const modified = await fetchLastModified(url, 'Cardmarket')
      if (guide && (modified ? modified === guide.lastModified : Date.now() - guide.fetchedAt < MIN_DOWNLOAD_INTERVAL_MS)) {
        return false
      }
      const res = await fetchJson(url, 'Cardmarket', undefined, DOWNLOAD_TIMEOUT_MS)
      if (res.status >= 400 || !Array.isArray(res.data?.priceGuides)) {
        throw new Error(`Cardmarket's price guide is unavailable (HTTP ${res.status}).`)
      }
      const next = toGuide(res.data, res.lastModified ?? modified)
      const changed = next.createdAt !== guide?.createdAt
      guide = next
      await save(next)
      return changed
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Keeps the guide current: now, then hourly. `onUpdate` runs whenever prices change. */
export function startPriceGuide(onUpdate: () => void): void {
  const check = () => refreshPriceGuide().then((changed) => changed && onUpdate(), () => undefined)
  void check()
  setInterval(check, CHECK_EVERY_MS)
}

/** When the current prices were published, or null without a guide. */
export function priceGuideDate(): number | null {
  return guide?.createdAt ?? null
}

/** A product's typical prices (the trend) in the current guide, non-foil and foil; 0 = no price. */
export function guideTrend(cardmarketId: number): [number, number] | undefined {
  const row = guide?.rows.get(cardmarketId)
  return row && [row[1], row[4]]
}

function merge(fallback: Prices, row: Row, offset: number): Prices {
  const prices: Prices = { ...fallback }
  BASES.forEach((basis, i) => {
    if (row[offset + i] > 0) prices[basis] = row[offset + i]
  })
  return prices
}

/**
 * The printings with Cardmarket's guide prices. Where the guide has no price,
 * Scryfall's trend stays. Returns a new result: cached data is never changed.
 */
export async function withMarketPrices(result: PrintingsResult): Promise<PrintingsResult> {
  await loadPriceGuide()
  if (!guide) return result
  const { rows, createdAt } = guide
  let priced = false
  const printings = result.printings.map((printing) => {
    const row = printing.cardmarketId === null ? undefined : rows.get(printing.cardmarketId)
    if (!row) return printing
    priced = true
    return { ...printing, price: merge(printing.price, row, 0), priceFoil: merge(printing.priceFoil, row, 3) }
  })
  return priced ? { ...result, printings, pricedAt: createdAt } : result
}
