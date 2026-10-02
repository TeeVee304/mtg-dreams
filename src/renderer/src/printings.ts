import { useSyncExternalStore } from 'react'
import type { PrintingsOptions } from '../../shared/api'
import { nameKey } from '../../shared/decklist'
import { PRINTINGS_MAX_AGE_MS, resolveLine } from '../../shared/pricing'
import type { PriceBasis, Printing, PrintingsResult } from '../../shared/types'
import { cleanError } from './format'

/**
 * Session store of printings by nameKey. Rate limiting, caching and prices live in the main process.
 * Cached data shows immediately; printings older than {@link PRINTINGS_MAX_AGE_MS} refresh in the
 * background; prices reload on `prices:updated`.
 *
 * @packageDocumentation
 */

/** Store entry for one card. */
export interface PrintingsEntry {
  /** Requested name (possibly fuzzy-matched), reused for refreshes. */
  name: string
  /** Initial fetch in progress. */
  loading: boolean
  /** Background refresh in progress; `data` is shown meanwhile. */
  refreshing?: boolean
  /** In-flight request is `full`; promotions must match. */
  pendingFull?: boolean
  data?: PrintingsResult
  /** Last fetch error. */
  error?: string
  /** Epoch ms of the last attempt; throttles retries ({@link RETRY_AFTER_MS}). */
  triedAt?: number
}

/** Min interval between retries of a failed or stale card. */
const RETRY_AFTER_MS = 10 * 60 * 1000

/** Entries by nameKey. */
const entries = new Map<string, PrintingsEntry>()
const listeners = new Set<() => void>()
let version = 0

/** Bumps the version and notifies subscribers. */
function emit(): void {
  version += 1
  for (const listener of listeners) listener()
}

/** `useSyncExternalStore` subscribe. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Replaces an entry and emits. */
function setEntry(key: string, entry: PrintingsEntry): void {
  entries.set(key, entry)
  emit()
}

/** Printings older than {@link PRINTINGS_MAX_AGE_MS}. */
const isStale = (data: PrintingsResult) => Date.now() - data.fetchedAt > PRINTINGS_MAX_AGE_MS
/** Attempted within {@link RETRY_AFTER_MS}. */
const triedRecently = (entry: PrintingsEntry) => !!entry.triedAt && Date.now() - entry.triedAt < RETRY_AFTER_MS

/** @returns Entry for the card; undefined if never requested. */
export function getPrintingsEntry(name: string): PrintingsEntry | undefined {
  return entries.get(nameKey(name))
}

/**
 * Cheapest non-foil printing, for valuing cards without a known printing.
 * @returns Unit price (null if unpriced or unknown card) and printing; undefined until loaded.
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

/** Background refresh batch counters; reset when the batch completes. */
let refreshTotal = 0
let refreshDone = 0

/** @returns Current refresh batch progress; null if idle. */
export function getRefreshProgress(): { done: number; total: number } | null {
  return refreshTotal > 0 ? { done: refreshDone, total: refreshTotal } : null
}

/** Force-fetches printings in the background, keeping cached data visible; failures keep data and set `error`. */
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
    (data) => finish({ name: current.name, loading: false, data, triedAt: Date.now() }),
    (error) => finish({ ...current, refreshing: false, pendingFull: false, error: cleanError(error), triedAt: Date.now() })
  )
}

/**
 * Ensures a card's printings are loaded or refreshing; non-blocking. In-flight high-priority
 * requests are promoted (except `full`, which callers retry after completion). Loaded data refreshes
 * if `force`, `full` on a partial result, or stale. Failed loads retry after {@link RETRY_AFTER_MS}.
 */
export function requestPrintings(name: string, options: PrintingsOptions = {}): void {
  const key = nameKey(name)
  if (!key) return
  const priority = options.priority ?? 'low'
  const current = entries.get(key)

  if (current?.loading || current?.refreshing) {
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

  setEntry(key, { name, loading: true, pendingFull: options.full, triedAt: Date.now() })
  window.api.getPrintings(name, options).then(
    (data) => {
      setEntry(key, { name, loading: false, data, triedAt: Date.now() })
      if (isStale(data)) refresh(key, 'low', false)
    },
    (error) => setEntry(key, { name, loading: false, error: cleanError(error), triedAt: Date.now() })
  )
}

/** Refreshes all stale, idle entries not tried recently. */
export function refreshStalePrintings(): void {
  for (const [key, entry] of entries) {
    if (entry.data && !entry.loading && !entry.refreshing && isStale(entry.data) && !triedRecently(entry)) {
      refresh(key, 'low', false)
    }
  }
}

/** Re-fetches all loaded entries from the main-process cache (no Scryfall calls) and emits once. */
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

/** Hook re-rendering on any entry change. @returns Store version. */
export function usePrintingsVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
