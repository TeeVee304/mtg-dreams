import { bundledBasic } from '../../shared/basics'
import { resolveLine } from '../../shared/pricing'
import type { InventoryItem, OwnedCopy, PriceBasis, Printing } from '../../shared/types'
import { getPrintingsEntry } from './printings'

/**
 * Inventory valuation: versioned copies at their printing's price, unversioned copies at the
 * cheapest printing of their finish.
 *
 * @packageDocumentation
 */

/** Fixed valuation basis (sale value): Cardmarket trend. */
export const VALUATION_BASIS: PriceBasis = 'trend'

/** Priced copy group of one card. */
export interface ValuedCopy {
  name: string
  copy: OwnedCopy
  qty: number
  /** EUR unit price. */
  unit: number
  /** Pricing printing: the recorded one, or the cheapest. */
  printing: Printing | null
}

/** Valuation of one inventory item. */
export interface ItemValue {
  /** `free`: bundled basic. `unpriced`: no copy priced. `loading`: printings pending. */
  status: 'priced' | 'loading' | 'unpriced' | 'free'
  /** EUR total of priced copies. */
  total: number
  /** Shared unit price if all copies are priced equally; else null. */
  unit: number | null
  valued: ValuedCopy[]
  /** Unpriced copy groups (or 1 for the whole card), excluded from `total`. */
  unpriced: number
  /** Display printing: first versioned copy's, else the cheapest. */
  printing: Printing | null
}

/** Values one item from loaded printings. */
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

/** Aggregate inventory valuation. */
export interface CollectionValuation {
  /** EUR total. */
  total: number
  /** Copies owned, including bundled basics. */
  copies: number
  /** Items with printings still loading. */
  pending: number
  /** Unpriced copy groups, excluded from `total`. */
  unpriced: number
  valued: ValuedCopy[]
}

/** Values the whole inventory. */
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
