import { useSyncExternalStore } from 'react'
import type { PrintingsOptions } from '../../shared/api'
import { nameKey } from '../../shared/decklist'
import { PRINTINGS_MAX_AGE_MS, resolveLine } from '../../shared/pricing'
import type { PriceBasis, Printing, PrintingsResult } from '../../shared/types'
import { cleanError } from './format'

// Session-wide store of each card's printings, with their Cardmarket prices. The
// main process owns rate limiting, the caches and the price guide. Cached data is
// shown right away, however old; printings older than a week are refreshed in the
// background, and prices are reloaded whenever the main process has new ones.

export interface PrintingsEntry {
  /** The name as requested, used for refreshes (it may be a typo Scryfall fuzzy-matched). */
  name: string
  /** No data yet: fetching. */
  loading: boolean
  /** Showing cached data while fresh printings are fetched in the background. */
  refreshing?: boolean
  /** The request in flight asked for every printing (so a promotion must ask the same). */
  pendingFull?: boolean
  data?: PrintingsResult
  error?: string
  /** Last network attempt, so an offline app doesn't retry every render. */
  triedAt?: number
}

const RETRY_AFTER_MS = 10 * 60 * 1000

const entries = new Map<string, PrintingsEntry>()
const listeners = new Set<() => void>()
let version = 0

function emit(): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setEntry(key: string, entry: PrintingsEntry): void {
  entries.set(key, entry)
  emit()
}

const isStale = (data: PrintingsResult) => Date.now() - data.fetchedAt > PRINTINGS_MAX_AGE_MS
const triedRecently = (entry: PrintingsEntry) => !!entry.triedAt && Date.now() - entry.triedAt < RETRY_AFTER_MS

export function getPrintingsEntry(name: string): PrintingsEntry | undefined {
  return entries.get(nameKey(name))
}

/**
 * A card at its cheapest (non-foil) version, as the inventory, trades and previews
 * value cards they don't know the version of. Undefined until its printings load;
 * `unit` is null when there's no price (or no such card).
 */
export function cheapestVersion(
  name: string,
  basis: PriceBasis
): { unit: number | null; printing: Printing | null } | undefined {
  const data = getPrintingsEntry(name)?.data
  if (!data) return undefined
  if (data.notFound) return { unit: null, printing: null }
  const { unitPrice, printing } = resolveLine({ foil: false }, data.printings, basis)
  return { unit: unitPrice, printing }
}

// Progress of the current batch of background refreshes, for the progress bar.
let refreshTotal = 0
let refreshDone = 0

export function getRefreshProgress(): { done: number; total: number } | null {
  return refreshTotal > 0 ? { done: refreshDone, total: refreshTotal } : null
}

/** Fetches fresh printings while the cached ones stay on screen. */
function refresh(key: string, priority: 'high' | 'low', full: boolean): void {
  const current = entries.get(key)
  if (!current?.data) return
  refreshTotal += 1
  setEntry(key, { ...current, refreshing: true, pendingFull: full, triedAt: Date.now() })
  const finish = (entry: PrintingsEntry) => {
    refreshDone += 1
    if (refreshDone >= refreshTotal) refreshTotal = refreshDone = 0
    setEntry(key, entry)
  }
  window.api.getPrintings(current.name, { force: true, priority, full }).then(
    // A failed refresh resolves with the cached data plus `staleError`.
    (data) => finish({ name: current.name, loading: false, data, triedAt: Date.now() }),
    (error) => finish({ ...current, refreshing: false, pendingFull: false, error: cleanError(error), triedAt: Date.now() })
  )
}

/**
 * Makes sure prices for a card are loaded. Returns immediately; subscribers
 * re-render when data arrives. `force` refreshes even recent prices.
 */
export function requestPrintings(name: string, options: PrintingsOptions = {}): void {
  const key = nameKey(name)
  if (!key) return
  const priority = options.priority ?? 'low'
  const current = entries.get(key)

  if (current?.loading || current?.refreshing) {
    // Already on its way; an interactive request moves it to the front of the queue.
    // (A `full` request is retried by its caller once this one finishes.)
    if (priority === 'high' && !options.full) {
      window.api.getPrintings(current.name, { force: true, priority, full: current.pendingFull }).catch(() => undefined)
    }
    return
  }

  if (current?.data) {
    const wantsAll = options.full === true && current.data.partial === true
    if (options.force || wantsAll || (isStale(current.data) && !triedRecently(current))) {
      refresh(key, priority, options.full === true)
    }
    return
  }

  if (current?.error && !options.force && triedRecently(current)) return

  // First load: the main process answers from its cache when it can, even with old prices.
  setEntry(key, { name, loading: true, pendingFull: options.full, triedAt: Date.now() })
  window.api.getPrintings(name, options).then(
    (data) => {
      setEntry(key, { name, loading: false, data, triedAt: Date.now() })
      if (isStale(data)) refresh(key, 'low', false)
    },
    (error) => setEntry(key, { name, loading: false, error: cleanError(error), triedAt: Date.now() })
  )
}

/** Refreshes every loaded card whose printings are older than a week. Called hourly. */
export function refreshStalePrintings(): void {
  for (const [key, entry] of entries) {
    if (entry.data && !entry.loading && !entry.refreshing && isStale(entry.data) && !triedRecently(entry)) {
      refresh(key, 'low', false)
    }
  }
}

/**
 * Reloads every loaded card with the main process's new prices. The printings come
 * from its cache, so this costs no Scryfall lookups. Applied in one update.
 */
export async function reloadPrices(): Promise<void> {
  const loaded = [...entries].filter(([, entry]) => entry.data && !entry.loading)
  const results = await Promise.allSettled(loaded.map(([, entry]) => window.api.getPrintings(entry.name)))
  results.forEach((result, i) => {
    const key = loaded[i][0]
    const latest = entries.get(key)
    if (result.status === 'fulfilled' && latest?.data) entries.set(key, { ...latest, data: result.value })
  })
  emit()
}

/** Re-renders the calling component whenever any printings result changes. */
export function usePrintingsVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
