import { pick } from '@shared/pricing'
import { ui } from '@shared/text'
import type { PriceBasis, Prices, PrintingsResult } from '@shared/types'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { onConnectivityChange } from './connectivity'
import { env } from './environment'
import { fetchJson, fetchLastModified } from './http'

/**
 * Cardmarket daily price guide (low/trend/avg30, non-foil and foil, for every product). Polled
 * hourly via `Last-Modified`; the ~26 MB file is downloaded only when it changes and cached
 * compactly (~5 MB) in userData. Joined to Scryfall printings by Cardmarket product id.
 *
 * @packageDocumentation
 */

/** Cache file name. */
const FILE = 'price-guide.json'
/** Cache schema version. */
const VERSION = 1
/** Timeout for the full download. */
const DOWNLOAD_TIMEOUT_MS = 180_000
/** Poll interval. */
const CHECK_EVERY_MS = 60 * 60 * 1000
/** Min download interval when the server sends no `Last-Modified`. */
const MIN_DOWNLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000

/** Column order of {@link Row} per finish. */
const BASES: PriceBasis[] = ['low', 'trend', 'avg30']
/** Product prices: {@link BASES} for non-foil, then foil; 0 = none. */
type Row = [number, number, number, number, number, number]
/** Prices per {@link Row}. */
const ROW = 6

/**
 * Prices by product id, kept compactly: about 130,000 products take some 3.6 MB as two number
 * arrays, against some 14 MB as a map of small arrays. Ids are sorted, for a binary search; prices
 * are whole cents, as Cardmarket gives them.
 */
export class PriceTable {
  private constructor(
    /** Product ids, ascending. */
    private readonly ids: Int32Array,
    /** {@link ROW} prices per id, in cents. */
    private readonly cents: Int32Array
  ) {}

  /** @returns A table of `rows`; for a repeated id, the last row counts. */
  static from(rows: Iterable<readonly [number, Row]>): PriceTable {
    const byId = new Map(rows)
    const ids = Int32Array.from([...byId.keys()].filter((id) => id > 0 && id <= 0x7fffffff)).sort()
    const cents = new Int32Array(ids.length * ROW)
    ids.forEach((id, i) => byId.get(id)!.forEach((price, j) => (cents[i * ROW + j] = Math.round(price * 100))))
    return new PriceTable(ids, cents)
  }

  /** Number of products. */
  get size(): number {
    return this.ids.length
  }

  /** @returns A product's prices; undefined if absent. */
  get(id: number): Row | undefined {
    let low = 0
    let high = this.ids.length - 1
    while (low <= high) {
      const mid = (low + high) >>> 1
      if (this.ids[mid] === id) return this.row(mid)
      if (this.ids[mid] < id) low = mid + 1
      else high = mid - 1
    }
    return undefined
  }

  /** @returns Every product's prices, by id. */
  *entries(): Generator<[number, Row]> {
    for (let i = 0; i < this.ids.length; i++) yield [this.ids[i], this.row(i)]
  }

  private row(i: number): Row {
    return Array.from(this.cents.subarray(i * ROW, i * ROW + ROW), (cents) => cents / 100) as Row
  }
}

/** In-memory guide. */
interface Guide {
  /** Epoch ms of Cardmarket publication. */
  createdAt: number
  /** Epoch ms of download. */
  fetchedAt: number
  /** `Last-Modified` of the downloaded file. */
  lastModified: string | null
  /** Prices by product id. */
  rows: PriceTable
}

/** On-disk form of {@link Guide}. */
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

/** Loads the cached guide once; concurrent and later calls share the same promise. Invalid or outdated caches are ignored. */
export function loadPriceGuide(): Promise<void> {
  loading ??= (async () => {
    const file = await readCacheFile<GuideFile>(FILE)
    if (file?.version !== VERSION || typeof file.rows !== 'object') return
    const rows = PriceTable.from(Object.entries(file.rows).map(([id, row]) => [Number(id), row] as const))
    guide = { createdAt: file.createdAt, fetchedAt: file.fetchedAt, lastModified: file.lastModified, rows }
  })()
  return loading
}

/** Reads the guide from disk again, after another thread saved a newer one. */
export function reloadPriceGuide(): Promise<void> {
  loading = null
  return loadPriceGuide()
}

/** Called after a newer guide is saved. */
const savedListeners = new Set<() => void>()

/**
 * Calls `listener` whenever a newer guide is saved, so other threads can reload it.
 * @returns Unsubscribe function.
 */
export function onPriceGuideSaved(listener: () => void): () => void {
  savedListeners.add(listener)
  return () => savedListeners.delete(listener)
}

/** Positive number, else 0. */
const positive = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0)

/** Builds a {@link Guide} from Cardmarket's JSON; falls back to now if `createdAt` is invalid. */
function toGuide(data: any, lastModified: string | null): Guide {
  const read: Array<[number, Row]> = []
  for (const p of data.priceGuides as any[]) {
    if (!Number.isSafeInteger(p?.idProduct)) continue
    read.push([p.idProduct, [
      positive(p.low), positive(p.trend), positive(p.avg30),
      positive(p['low-foil']), positive(p['trend-foil']), positive(p['avg30-foil'])
    ]])
  }
  const createdAt = Date.parse(data.createdAt)
  return { createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt, fetchedAt: Date.now(), lastModified, rows: PriceTable.from(read) }
}

/** Persists the guide to the cache file. */
function save(next: Guide): Promise<void> {
  const file: GuideFile = {
    version: VERSION,
    createdAt: next.createdAt,
    fetchedAt: next.fetchedAt,
    lastModified: next.lastModified,
    rows: Object.fromEntries(next.rows.entries())
  }
  return writeCacheFile(FILE, file)
}

/**
 * Downloads the guide if a newer one is published; concurrent calls share one refresh.
 * @returns Whether the publication date changed.
 * @throws Error on network failure or invalid response.
 */
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
        throw new Error(ui.errors.priceGuide(res.status))
      }
      const next = toGuide(res.data, res.lastModified ?? modified)
      const changed = next.createdAt !== guide?.createdAt
      guide = next
      await save(next)
      for (const listener of savedListeners) listener()
      return changed
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/**
 * Refreshes now, every {@link CHECK_EVERY_MS} and when the app comes back online; calls `onUpdate`
 * when prices change. Errors are ignored.
 */
export function startPriceGuide(onUpdate: () => void): void {
  const check = () => refreshPriceGuide().then((changed) => changed && onUpdate(), () => undefined)
  void check()
  setInterval(check, CHECK_EVERY_MS)
  onConnectivityChange((online) => online && void check())
}

/** @returns Epoch ms of the loaded guide's publication; null if none. */
export function priceGuideDate(): number | null {
  return guide?.createdAt ?? null
}

/** @returns `[nonFoil, foil]` trend prices of a product (0 = none); undefined if absent. */
export function guideTrend(cardmarketId: number): [number, number] | undefined {
  const row = guide?.rows.get(cardmarketId)
  return row && [row[1], row[4]]
}

/**
 * @param foil - Foil instead of non-foil price.
 * @returns A product's price on `basis` (falling back to trend, like {@link pick}); null if the guide has none.
 */
export function guidePrice(cardmarketId: number, foil: boolean, basis: PriceBasis): number | null {
  const row = guide?.rows.get(cardmarketId)
  return row ? pick(merge({}, row, foil ? 3 : 0), basis) : null
}

/** Overlays positive guide prices of one finish (`offset` 0 or 3) onto `fallback`. */
function merge(fallback: Prices, row: Row, offset: number): Prices {
  const prices: Prices = { ...fallback }
  BASES.forEach((basis, i) => {
    if (row[offset + i] > 0) prices[basis] = row[offset + i]
  })
  return prices
}

/**
 * @returns Copy of `result` with guide prices overlaid (Scryfall trend kept where the guide has
 * none) and `pricedAt` set; `result` itself if no printing is in the guide.
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
