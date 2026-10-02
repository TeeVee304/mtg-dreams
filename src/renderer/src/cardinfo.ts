import { useSyncExternalStore } from 'react'
import { bundledBasic } from '../../shared/basics'
import { nameKey } from '../../shared/decklist'
import type { CardInfo } from '../../shared/types'
import { getPrintingsEntry } from './printings'

/**
 * Card data store for cards without a printings lookup (inventory). Requests in the same tick are
 * batched into one IPC call.
 *
 * @packageDocumentation
 */

/** Card data by nameKey; null = unknown to Scryfall. */
const infos = new Map<string, CardInfo | null>()
/** nameKeys being fetched. */
const inFlight = new Set<string>()
/** Names awaiting the next flush, by nameKey. */
const queued = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0
let flushScheduled = false

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

/**
 * Looks up card data from generic basics (if `bundleBasics`), printings entries, then this store.
 * @returns Card data; undefined if not loaded; null if unknown to Scryfall.
 */
export function getCardInfo(name: string, bundleBasics = false): CardInfo | null | undefined {
  const generic = bundledBasic(name, bundleBasics)
  if (generic) return generic.info
  const fromPrintings = getPrintingsEntry(name)?.data
  if (fromPrintings?.card) return fromPrintings.card
  if (fromPrintings?.notFound) return null
  return infos.get(nameKey(name))
}

/** Queues names lacking data for a batched fetch on the next tick. */
export function requestCardInfos(names: string[], bundleBasics = false): void {
  for (const name of names) {
    const key = nameKey(name)
    if (!key || infos.has(key) || inFlight.has(key) || getPrintingsEntry(name)?.data?.card) continue
    if (bundledBasic(name, bundleBasics)) continue
    queued.set(key, name)
  }
  if (queued.size > 0 && !flushScheduled) {
    flushScheduled = true
    setTimeout(flush, 0)
  }
}

/** Fetches queued names; failures leave them unknown so later requests retry. */
async function flush(): Promise<void> {
  flushScheduled = false
  const batch = [...queued]
  queued.clear()
  for (const [key] of batch) inFlight.add(key)
  try {
    const result = await window.api.getCardInfos(batch.map(([, name]) => name))
    for (const [key, info] of Object.entries(result)) infos.set(key, info)
  } catch {
  } finally {
    for (const [key] of batch) inFlight.delete(key)
    emit()
  }
}

/** Hook re-rendering on card data changes. @returns Store version. */
export function useCardInfoVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
