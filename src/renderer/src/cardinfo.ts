import { useSyncExternalStore } from 'react'
import { bundledBasic } from '../../shared/basics'
import { nameKey } from '../../shared/decklist'
import type { CardInfo } from '../../shared/types'
import { getPrintingsEntry } from './printings'

// Card data (colors, type, legality...) for cards whose prices aren't being
// looked up, i.e. the inventory. Requests made in the same tick are batched.

const infos = new Map<string, CardInfo | null>()
const inFlight = new Set<string>()
const queued = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0
let flushScheduled = false

function emit(): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Card data if known: undefined while unknown/loading, null if Scryfall has no such card.
 * With `bundleBasics`, regular basic lands use their built-in generic data.
 */
export function getCardInfo(name: string, bundleBasics = false): CardInfo | null | undefined {
  const generic = bundledBasic(name, bundleBasics)
  if (generic) return generic.info
  const fromPrintings = getPrintingsEntry(name)?.data
  if (fromPrintings?.card) return fromPrintings.card
  if (fromPrintings?.notFound) return null
  return infos.get(nameKey(name))
}

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

async function flush(): Promise<void> {
  flushScheduled = false
  const batch = [...queued]
  queued.clear()
  for (const [key] of batch) inFlight.add(key)
  try {
    const result = await window.api.getCardInfos(batch.map(([, name]) => name))
    for (const [key, info] of Object.entries(result)) infos.set(key, info)
  } catch {
    // Offline: leave these unknown so a later request retries them.
  } finally {
    for (const [key] of batch) inFlight.delete(key)
    emit()
  }
}

export function useCardInfoVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
