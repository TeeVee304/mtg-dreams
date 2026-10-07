import { bundleBasicLines, genericBasic } from '@shared/basics'
import { allocateOwned, cardLines, nameKey } from '@shared/decklist'
import { listFormat } from '@shared/formats'
import { ownedVersion } from '@shared/inventory'
import { resolveLine, type Resolution } from '@shared/pricing'
import { sideboardIds } from '@shared/sideboard'
import type { AppSettings } from '@shared/api'
import type { CopyPool, HeldCopies } from '@shared/copies'
import type { CardInfo, CardLine, InventoryItem, PriceBasis } from '@shared/types'
import type { CardList } from '../stores/library'
import { getPrintingsEntry, getPrintingsVersion, type PrintingsEntry } from '../stores/printings'
import { memoLast } from './memo'

/** Priced list row. */
export interface Row {
  line: CardLine
  /** Printings store entry; undefined for bundled basics or before requesting. */
  entry: PrintingsEntry | undefined
  /** Resolved printing and price; null until printings load. */
  resolution: Resolution | null
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card claimed ahead of this line: by lists ahead, then earlier lines. */
  before: number
  /** Copies of the same card claimed by lists ahead of this one (separate copies). */
  held: number
  /** Lists ahead that get the owned copies, with how many each gets; set by list pages. */
  holders?: HeldCopies[]
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
  /** Line is in the sideboard. */
  side: boolean
  /** Printed name of a pinned printing, if different from the oracle name. */
  flavorName?: string
}

/** Settings affecting list pricing. */
export type PricingSettings = Pick<AppSettings, 'bundleBasics' | 'priceBasis'>

/** Empty id set. */
const NO_IDS: ReadonlySet<string> = new Set()

/**
 * Builds priced rows, main deck first, then sideboard. With `bundleBasics`, regular basics merge into
 * one free row per board. Unpinned lines with owned copies resolve to the owned printing
 * ({@link ownedVersion}).
 * @param sideIds - Ids of sideboard lines ({@link sideboardIds}).
 * @param held - Copies of a card (by nameKey) that lists ahead take first (`CopyPool.held`); none by default.
 */
export function buildRows(
  lines: CardLine[],
  inventory: Map<string, InventoryItem>,
  { bundleBasics, priceBasis }: PricingSettings,
  sideIds: ReadonlySet<string> = NO_IDS,
  held?: (key: string) => number
): Row[] {
  const board = (side: boolean) => {
    const own = lines.filter((line) => sideIds.has(line.id) === side)
    const bundled = bundleBasics
      ? bundleBasicLines(own, side ? 'basic:side:' : 'basic:')
      : own.map((line) => ({ line, bundledIds: undefined }))
    return bundled.map((item) => ({ ...item, side }))
  }
  const items = [...board(false), ...board(true)]
  const allocations = allocateOwned(
    items.map((item) => item.line),
    inventory,
    held
  )
  return items.map(({ line, bundledIds, side }, index) => {
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
        bundledIds,
        side
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
      flavorName: resolution?.pinned ? resolution.printing?.flavorName : undefined,
      side
    }
  })
}

/** Per list: its rows, kept until the inventory, settings, copy claims or prices change. */
const listRowsCache = new WeakMap<CardList, (...args: [Map<string, InventoryItem>, boolean, PriceBasis, CopyPool, number]) => Row[]>()

/**
 * {@link buildRows} of a whole list, with its sideboard (none in commander formats) and the copies the
 * lists ahead hold. Shared by every caller, so the sidebar and the open page compute it once.
 */
export function listRows(list: CardList, inventory: Map<string, InventoryItem>, settings: PricingSettings, pool: CopyPool): Row[] {
  let rows = listRowsCache.get(list)
  if (!rows) {
    rows = memoLast((items, bundleBasics, priceBasis, claims, _version) =>
      buildRows(
        cardLines(list.lines),
        items,
        { bundleBasics, priceBasis },
        sideboardIds(list.lines, !listFormat(list.lines)?.commander),
        (key) => claims.held(list, key)
      )
    )
    listRowsCache.set(list, rows)
  }
  return rows(inventory, settings.bundleBasics, settings.priceBasis, pool, getPrintingsVersion())
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
