import { bundleBasicLines, genericBasic } from '@shared/basics'
import { allocateOwned, nameKey } from '@shared/decklist'
import { ownedVersion } from '@shared/inventory'
import { resolveLine, type Resolution } from '@shared/pricing'
import type { AppSettings } from '@shared/api'
import type { CardInfo, CardLine, InventoryItem } from '@shared/types'
import { getPrintingsEntry, type PrintingsEntry } from '../stores/printings'

/** Priced list row. */
export interface Row {
  line: CardLine
  /** Printings store entry; undefined for bundled basics or before requesting. */
  entry: PrintingsEntry | undefined
  /** Resolved printing and price; null until printings load. */
  resolution: Resolution | null
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card claimed by earlier lines. */
  before: number
  /** Total copies in the inventory. */
  inventoryQty: number
  /** EUR unit price; null if unknown. */
  unit: number | null
  /** Card data; undefined until printings load. */
  info: CardInfo | undefined
  /** Rarity of the resolved printing. */
  rarity: string | undefined
  /** Bundled basics only: merged line ids. */
  bundledIds?: string[]
  /** Printed name of a pinned printing, if different from the oracle name. */
  flavorName?: string
}

/** Settings affecting list pricing. */
export type PricingSettings = Pick<AppSettings, 'bundleBasics' | 'priceBasis'>

/**
 * Builds priced rows. With `bundleBasics`, regular basics merge into one free row each. Unpinned
 * lines with owned copies resolve to the owned printing ({@link ownedVersion}).
 */
export function buildRows(
  lines: CardLine[],
  inventory: Map<string, InventoryItem>,
  { bundleBasics, priceBasis }: PricingSettings
): Row[] {
  const items = bundleBasics ? bundleBasicLines(lines) : lines.map((line) => ({ line, bundledIds: undefined }))
  const allocations = allocateOwned(
    items.map((item) => item.line),
    inventory
  )
  return items.map(({ line, bundledIds }, index) => {
    const inventoryQty = inventory.get(nameKey(line.name))?.qty ?? 0
    const generic = bundledIds && genericBasic(line.name)
    if (generic) {
      return {
        line,
        entry: undefined,
        resolution: { printing: generic.printing, unitPrice: 0, pinned: false, pinMissing: false, collectorMissing: false },
        ...allocations[index],
        inventoryQty,
        unit: 0,
        info: generic.info,
        rarity: 'common',
        bundledIds
      }
    }
    const entry = getPrintingsEntry(line.name)
    const data = entry?.data
    let resolution = data && !data.notFound ? resolveLine(line, data.printings, priceBasis) : null
    const yours = !line.set && allocations[index].owned > 0 ? ownedVersion(inventory.get(nameKey(line.name)), line.foil) : null
    if (yours && data && !data.notFound) {
      const owned = resolveLine(yours, data.printings, priceBasis)
      if (owned.printing && !owned.pinMissing) resolution = { ...owned, pinned: false, collectorMissing: false, fromInventory: true }
    }
    return {
      line,
      entry,
      resolution,
      ...allocations[index],
      inventoryQty,
      unit: resolution?.unitPrice ?? null,
      info: data?.card,
      rarity: resolution?.printing?.rarity ?? data?.card?.rarity,
      flavorName: resolution?.pinned ? resolution.printing?.flavorName : undefined
    }
  })
}

/** List totals. Values are EUR over priced rows. */
export interface Summary {
  /** Total copies. */
  cards: number
  /** Owned copies. */
  ownedCards: number
  total: number
  ownedValue: number
  /** Value of copies not owned. */
  neededValue: number
  /** Loaded rows without a price. */
  unpriced: number
  /** Rows awaiting printings. */
  loading: number
  /** Oldest price publication time (epoch ms) among rows. */
  pricedAt: number | null
}

/** Aggregates rows; bundled basics count as copies only. */
export function summarize(rows: Row[]): Summary {
  const summary: Summary = {
    cards: 0, ownedCards: 0, total: 0, ownedValue: 0, neededValue: 0, unpriced: 0, loading: 0, pricedAt: null
  }
  for (const row of rows) {
    summary.cards += row.line.qty
    summary.ownedCards += row.owned
    if (row.bundledIds) continue
    if (!row.entry || (row.entry.loading && !row.entry.data)) {
      summary.loading += 1
      continue
    }
    const data = row.entry.data
    const pricedAt = data && (data.pricedAt ?? data.fetchedAt)
    if (pricedAt && (summary.pricedAt === null || pricedAt < summary.pricedAt)) summary.pricedAt = pricedAt
    if (row.unit === null) {
      summary.unpriced += 1
      continue
    }
    summary.total += row.unit * row.line.qty
    summary.ownedValue += row.unit * row.owned
    summary.neededValue += row.unit * (row.line.qty - row.owned)
  }
  return summary
}
