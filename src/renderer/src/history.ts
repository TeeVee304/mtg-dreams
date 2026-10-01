import { useSyncExternalStore } from 'react'
import type { PriceBaseline, PriceSnapshot } from '../../shared/api'
import { bundledBasic } from '../../shared/basics'
import { allocateOwned, cardLines, nameKey } from '../../shared/decklist'
import { PRICE_BASES, resolveLine } from '../../shared/pricing'
import type { CardLine, InventoryItem, PriceBasis } from '../../shared/types'
import type { ValuedCopy } from './collection'
import { valueCollection } from './collection'
import type { CardList } from './library'
import { getPrintingsEntry } from './printings'

// Price history, as the page sees it. The main process keeps the snapshots
// (priceHistory.ts); this module tells it which versions to keep, works out how the
// inventory's value changed, and flags wishlist cards that got cheaper since added.

// --- Wishlist baselines -------------------------------------------------------

let baselines: Record<string, PriceBaseline> = {}
/** Never note new baselines before the saved ones are in: they'd replace them. */
let baselinesLoaded = false
let baselinesVersion = 0
const listeners = new Set<() => void>()

function emit(): void {
  baselinesVersion += 1
  for (const listener of listeners) listener()
}

export async function loadBaselines(): Promise<void> {
  try {
    baselines = await window.api.getBaselines()
    baselinesLoaded = true
    emit()
  } catch {
    // No alerts until the next change saves new baselines.
  }
}

/** Re-renders the caller when baselines change; returns them. */
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

/** A wishlist line's baseline key: the card, the version it asks for and its finish. */
export const lineKey = (line: Pick<CardLine, 'name' | 'set' | 'collector' | 'foil'>) =>
  `${nameKey(line.name)}|${line.set ?? ''}|${line.collector ?? ''}|${line.foil}`

/**
 * Notes the price of wishlist cards seen for the first time (on every price basis),
 * and forgets cards no longer on any wishlist. Only cards still needed get one.
 */
export function syncBaselines(wishlists: CardList[], inventory: Map<string, InventoryItem>, bundleBasics: boolean): void {
  if (!baselinesLoaded) return
  const onWishlists = new Set<string>()
  const set: Record<string, PriceBaseline> = {}
  const now = Date.now()
  for (const list of wishlists) {
    const lines = cardLines(list.lines)
    const allocations = allocateOwned(lines, inventory)
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

export interface PriceDrop {
  /** How much cheaper, in percent of the baseline. */
  percent: number
  was: number
  since: number
}

/** How much cheaper a wishlist line still needed got since added, when past the alert threshold. */
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

// --- Inventory history ----------------------------------------------------------

let trackedKey = ''

/** Tells the main process which versions the inventory is valued at, so it keeps their history. */
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

export interface ValueMove {
  valued: ValuedCopy
  /** Change in the copies' total value, in EUR. */
  change: number
}

export interface ValueChange {
  /** Total change in value. */
  change: number
  /** When the earlier prices are from (later than asked for while the history is short). */
  from: number
  to: number
  moves: ValueMove[]
}

/** The price of a copy in a snapshot: foil when it's foil, or the version only exists in foil. */
function snapshotPrice(valued: ValuedCopy, snapshot: PriceSnapshot): number | null {
  const id = valued.printing?.cardmarketId
  const prices = id === null || id === undefined ? undefined : snapshot.prices[id]
  if (!prices) return null
  const foil = valued.copy.foil || !valued.printing?.finishes.includes('nonfoil')
  const price = prices[foil ? 1 : 0]
  return price > 0 ? price : null
}

/** How the value of these copies changed between two snapshots; null when they're the same day. */
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
