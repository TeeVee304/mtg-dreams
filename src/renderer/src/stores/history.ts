import { useSyncExternalStore } from 'react'
import type { PriceBaseline, PriceSnapshot, TrackerApi } from '@shared/api'
import { bundledBasic } from '@shared/basics'
import type { CopyPool } from '@shared/copies'
import { allocateOwned, cardLines, nameKey } from '@shared/decklist'
import { PRICE_BASES, resolveLine } from '@shared/pricing'
import type { CardLine, InventoryItem, PriceBasis } from '@shared/types'
import type { ValuedCopy } from '../lib/collection'
import { valueCollection } from '../lib/collection'
import type { CardList } from './library'
import { getPrintingsEntry } from './printings'

/**
 * Renderer side of price history: wishlist baselines and price-drop detection, tracked product ids,
 * and inventory value changes between snapshots. Snapshots are stored by the main process.
 *
 * @packageDocumentation
 */

/** Wishlist baselines by {@link lineKey}. */
let baselines: Record<string, PriceBaseline> = {}
/** Saved baselines loaded; {@link syncBaselines} is a no-op until then to avoid overwriting them. */
let baselinesLoaded = false
let baselinesVersion = 0
const listeners = new Set<() => void>()

/** Bumps the baselines version and notifies subscribers. */
function emit(): void {
  baselinesVersion += 1
  for (const listener of listeners) listener()
}

/** Loads saved baselines; on failure, baselines stay disabled. */
export async function loadBaselines(): Promise<void> {
  try {
    baselines = await window.api.getBaselines()
    baselinesLoaded = true
    emit()
  } catch {}
}

/** Hook re-rendering on baseline changes. @returns Current baselines. */
export function useBaselines(): Record<string, PriceBaseline> {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => baselinesVersion
  )
  return baselines
}

/** @returns Baseline key: `nameKey|set|collector|foil`. */
export const lineKey = (line: Pick<CardLine, 'name' | 'set' | 'collector' | 'foil'>) =>
  `${nameKey(line.name)}|${line.set ?? ''}|${line.collector ?? ''}|${line.foil}`

/**
 * Records baselines (all price bases) for loaded, not fully owned wishlist lines lacking one, and
 * removes baselines of lines no longer on any wishlist. Persists changes; save errors are ignored.
 * @param pool - Copy claims of all lists.
 */
export function syncBaselines(wishlists: CardList[], inventory: Map<string, InventoryItem>, bundleBasics: boolean, pool: CopyPool): void {
  if (!baselinesLoaded) return
  const onWishlists = new Set<string>()
  const set: Record<string, PriceBaseline> = {}
  const now = Date.now()
  for (const list of wishlists) {
    const lines = cardLines(list.lines)
    const allocations = allocateOwned(lines, inventory, (key) => pool.held(list, key))
    lines.forEach((line, index) => {
      const key = lineKey(line)
      onWishlists.add(key)
      if (key in baselines || key in set || allocations[index].owned >= line.qty) return
      if (bundledBasic(line.name, bundleBasics)) return
      const data = getPrintingsEntry(line.name)?.data
      if (!data || data.notFound) return
      const prices: PriceBaseline['prices'] = {}
      for (const { id } of PRICE_BASES) {
        const unit = resolveLine(line, data.printings, id).unitPrice
        if (unit !== null && unit > 0) prices[id] = unit
      }
      if (Object.keys(prices).length > 0) set[key] = { at: now, prices }
    })
  }
  const remove = Object.keys(baselines).filter((key) => !onWishlists.has(key))
  if (Object.keys(set).length === 0 && remove.length === 0) return
  baselines = { ...baselines, ...set }
  for (const key of remove) delete baselines[key]
  emit()
  void window.api.updateBaselines(set, remove).catch(() => undefined)
}

/** Detected price drop. */
export interface PriceDrop {
  /** Drop in percent of the baseline, rounded. */
  percent: number
  /** Baseline unit price. */
  was: number
  /** Baseline capture time (epoch ms). */
  since: number
}

/**
 * @param unit - Current unit price on `basis`.
 * @param owned - Owned copies allocated to the line.
 * @returns Drop if the line is still needed and its price fell at least `thresholdPercent`; else null.
 */
export function priceDrop(
  line: CardLine,
  unit: number | null,
  owned: number,
  basis: PriceBasis,
  thresholdPercent: number,
  known: Record<string, PriceBaseline>
): PriceDrop | null {
  if (unit === null || owned >= line.qty) return null
  const baseline = known[lineKey(line)]
  const was = baseline?.prices[basis]
  if (!baseline || !was) return null
  const percent = ((was - unit) / was) * 100
  return percent >= thresholdPercent ? { percent: Math.round(percent), was, since: baseline.at } : null
}

/** Last tracked id set sent, comma-joined; reset on failure to retry. */
let trackedKey = ''

/** Sends the inventory's valued product ids to {@link TrackerApi.trackPrices} when the set changes. */
export function syncTracked(inventory: Map<string, InventoryItem>, bundleBasics: boolean): void {
  const ids = new Set<number>()
  for (const valued of valueCollection(inventory, 'trend', bundleBasics).valued) {
    const id = valued.printing?.cardmarketId
    if (id !== null && id !== undefined) ids.add(id)
  }
  const sorted = [...ids].sort((a, b) => a - b)
  const key = sorted.join(',')
  if (key === trackedKey || sorted.length === 0) return
  trackedKey = key
  void window.api.trackPrices(sorted).catch(() => {
    trackedKey = ''
  })
}

/** Value change of one copy group. */
export interface ValueMove {
  valued: ValuedCopy
  /** EUR change of the group's total value. */
  change: number
}

/** Inventory value change between two snapshots. */
export interface ValueChange {
  /** EUR total change. */
  change: number
  /** Earlier snapshot date; may be later than requested if history is short. */
  from: number
  /** Later snapshot date. */
  to: number
  /** Per-group changes of at least €0.005. */
  moves: ValueMove[]
}

/** @returns Snapshot trend for the copy (foil column if foil or foil-only printing); null if none. */
function snapshotPrice(valued: ValuedCopy, snapshot: PriceSnapshot): number | null {
  const id = valued.printing?.cardmarketId
  const prices = id === null || id === undefined ? undefined : snapshot.prices[id]
  if (!prices) return null
  const foil = valued.copy.foil || !valued.printing?.finishes.includes('nonfoil')
  const price = prices[foil ? 1 : 0]
  return price > 0 ? price : null
}

/** @returns Change over copies priced in both snapshots; null unless `then` precedes `latest`. */
export function valueChange(valued: ValuedCopy[], then: PriceSnapshot, latest: PriceSnapshot): ValueChange | null {
  if (then.date >= latest.date) return null
  const moves: ValueMove[] = []
  let change = 0
  for (const copy of valued) {
    const before = snapshotPrice(copy, then)
    const after = snapshotPrice(copy, latest)
    if (before === null || after === null) continue
    const delta = (after - before) * copy.qty
    change += delta
    if (Math.abs(delta) >= 0.005) moves.push({ valued: copy, change: delta })
  }
  return { change, from: then.date, to: latest.date, moves }
}
