import { bundledBasic } from '../../shared/basics'
import { resolveLine } from '../../shared/pricing'
import type { InventoryItem, OwnedCopy, PriceBasis, Printing } from '../../shared/types'
import { getPrintingsEntry } from './printings'

// What the inventory is worth: each copy at the version it was recorded with, and
// "any version" copies at the card's cheapest version (in their finish).

/** What a collection is worth is a selling question: always Cardmarket's typical price. */
export const VALUATION_BASIS: PriceBasis = 'trend'

/** Copies of one card in one version, with their price. */
export interface ValuedCopy {
  name: string
  copy: OwnedCopy
  qty: number
  unit: number
  /** The printing it's priced at: the recorded version, or the cheapest one. */
  printing: Printing | null
}

/** One card's worth, all its copies together. */
export interface ItemValue {
  /** 'free': a bundled basic land. 'unpriced': no price for some or all of its copies. */
  status: 'priced' | 'loading' | 'unpriced' | 'free'
  total: number
  /** The price of one copy, when every copy costs the same. */
  unit: number | null
  valued: ValuedCopy[]
  /** Versions (or the whole card) without a price, left out of the total. */
  unpriced: number
  /** The printing to picture it by: a recorded version first, else the cheapest. */
  printing: Printing | null
}

export function valueItem(item: InventoryItem, basis: PriceBasis, bundleBasics: boolean): ItemValue {
  const value: ItemValue = { status: 'priced', total: 0, unit: null, valued: [], unpriced: 0, printing: null }
  const generic = bundledBasic(item.name, bundleBasics)
  if (generic) return { ...value, status: 'free', unit: 0, printing: generic.printing }
  const entry = getPrintingsEntry(item.name)
  const data = entry?.data
  if (!data) return { ...value, status: entry?.error ? 'unpriced' : 'loading', unpriced: entry?.error ? 1 : 0 }
  if (data.notFound) return { ...value, status: 'unpriced', unpriced: 1 }
  for (const copy of item.copies) {
    const { unitPrice, printing } = resolveLine(copy.set ? copy : { foil: copy.foil }, data.printings, basis)
    if (unitPrice === null) {
      value.unpriced += 1
      continue
    }
    value.total += unitPrice * copy.qty
    value.valued.push({ name: item.name, copy, qty: copy.qty, unit: unitPrice, printing })
  }
  const units = new Set(value.valued.map((v) => v.unit))
  value.unit = units.size === 1 && value.unpriced === 0 ? value.valued[0].unit : null
  value.printing = value.valued.find((v) => v.copy.set)?.printing ?? value.valued[0]?.printing ?? data.printings[0] ?? null
  if (value.valued.length === 0) value.status = 'unpriced'
  return value
}

export interface CollectionValuation {
  total: number
  /** Copies owned, bundled basic lands included. */
  copies: number
  /** Cards whose prices are still loading. */
  pending: number
  /** Cards (or versions of them) without a price, left out of the total. */
  unpriced: number
  valued: ValuedCopy[]
}

export function valueCollection(
  inventory: Map<string, InventoryItem>,
  basis: PriceBasis,
  bundleBasics: boolean
): CollectionValuation {
  const result: CollectionValuation = { total: 0, copies: 0, pending: 0, unpriced: 0, valued: [] }
  for (const item of inventory.values()) {
    result.copies += item.qty
    const value = valueItem(item, basis, bundleBasics)
    if (value.status === 'loading') result.pending += 1
    result.unpriced += value.unpriced
    result.total += value.total
    result.valued.push(...value.valued)
  }
  return result
}
