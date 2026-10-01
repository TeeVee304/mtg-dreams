import { bundledBasic } from '../../shared/basics'
import { resolveLine } from '../../shared/pricing'
import type { InventoryItem, OwnedCopy, PriceBasis, Printing } from '../../shared/types'
import { getPrintingsEntry } from './printings'

// What the inventory is worth: each copy at the version it was recorded with, and
// "any version" copies at the card's cheapest version (in their finish).

/** Copies of one card in one version, with their price. */
export interface ValuedCopy {
  name: string
  copy: OwnedCopy
  qty: number
  unit: number
  /** The printing it's priced at: the recorded version, or the cheapest one. */
  printing: Printing | null
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
    if (bundledBasic(item.name, bundleBasics)) continue
    const entry = getPrintingsEntry(item.name)
    const data = entry?.data
    if (!data) {
      if (entry?.error) result.unpriced += 1
      else result.pending += 1
      continue
    }
    if (data.notFound) {
      result.unpriced += 1
      continue
    }
    for (const copy of item.copies) {
      const { unitPrice, printing } = resolveLine(copy.set ? copy : { foil: copy.foil }, data.printings, basis)
      if (unitPrice === null) {
        result.unpriced += 1
        continue
      }
      result.total += unitPrice * copy.qty
      result.valued.push({ name: item.name, copy, qty: copy.qty, unit: unitPrice, printing })
    }
  }
  return result
}
