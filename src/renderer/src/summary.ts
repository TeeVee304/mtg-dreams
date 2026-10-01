import { bundleBasicLines, genericBasic } from '../../shared/basics'
import { allocateOwned, nameKey } from '../../shared/decklist'
import { resolveLine, type Resolution } from '../../shared/pricing'
import type { AppSettings } from '../../shared/api'
import type { CardInfo, CardLine, InventoryItem } from '../../shared/types'
import { getPrintingsEntry, type PrintingsEntry } from './printings'

export interface Row {
  line: CardLine
  entry: PrintingsEntry | undefined
  resolution: Resolution | null
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card wanted by earlier lines in this list. */
  before: number
  inventoryQty: number
  unit: number | null
  /** Card data (colors, type, legality); undefined until prices have loaded. */
  info: CardInfo | undefined
  /** Rarity of the printing this line is priced with. */
  rarity: string | undefined
  /** Set on a bundled basic land: the ids of the file lines it stands for. */
  bundledIds?: string[]
  /** Name printed on the pinned version when it differs from the card's official name. */
  flavorName?: string
}

/** The settings that decide how a list is priced. */
export type PricingSettings = Pick<AppSettings, 'bundleBasics' | 'priceBasis'>

/**
 * One row per line, priced on the chosen basis. With `bundleBasics`, one generic, free
 * row per regular basic land instead.
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
    const resolution = data && !data.notFound ? resolveLine(line, data.printings, priceBasis) : null
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

export interface Summary {
  cards: number
  ownedCards: number
  total: number
  ownedValue: number
  neededValue: number
  /** Lines whose price is known to be unavailable. */
  unpriced: number
  loading: number
  /** When the oldest prices in the list were published. */
  pricedAt: number | null
}

export function summarize(rows: Row[]): Summary {
  const summary: Summary = {
    cards: 0, ownedCards: 0, total: 0, ownedValue: 0, neededValue: 0, unpriced: 0, loading: 0, pricedAt: null
  }
  for (const row of rows) {
    summary.cards += row.line.qty
    summary.ownedCards += row.owned
    // Bundled basic lands are free: nothing to load or add up.
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
