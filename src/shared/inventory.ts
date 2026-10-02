import type { InventoryItem, OwnedCopy } from './types'

/**
 * Inventory item operations. Ownership checks use totals; copy versions drive valuation and
 * display. All functions are non-mutating (undo history retains prior objects).
 *
 * @packageDocumentation
 */

/** Printing and finish of owned copies; no `set` means unspecified. */
export type Version = Pick<OwnedCopy, 'set' | 'collector' | 'foil'>

/** Unversioned, non-foil. */
const ANY_VERSION: Version = { foil: false }

/** Version equality; missing fields compare as empty. */
export const sameVersion = (a: Version, b: Version) =>
  (a.set ?? '') === (b.set ?? '') && (a.collector ?? '') === (b.collector ?? '') && a.foil === b.foil

/** Copy order: unversioned first, then by set, collector number (numeric), non-foil before foil. */
function compareCopies(a: OwnedCopy, b: OwnedCopy): number {
  if (!a.set !== !b.set) return a.set ? 1 : -1
  return (
    (a.set ?? '').localeCompare(b.set ?? '') ||
    (a.collector ?? '').localeCompare(b.collector ?? '', undefined, { numeric: true }) ||
    Number(a.foil) - Number(b.foil)
  )
}

/** @returns Copies merged by version, non-positive quantities dropped, sorted; `collector` cleared without `set`. */
export function normalizeCopies(copies: OwnedCopy[]): OwnedCopy[] {
  const merged: OwnedCopy[] = []
  for (const copy of copies) {
    if (!(copy.qty > 0)) continue
    const version: Version = { set: copy.set || undefined, collector: copy.set ? copy.collector || undefined : undefined, foil: copy.foil }
    const same = merged.find((other) => sameVersion(other, version))
    if (same) same.qty += copy.qty
    else merged.push({ qty: copy.qty, ...version })
  }
  return merged.sort(compareCopies)
}

/** @returns Item from normalized copies; null if total is 0. */
export function itemFromCopies(name: string, copies: OwnedCopy[]): InventoryItem | null {
  const normalized = normalizeCopies(copies)
  const qty = normalized.reduce((sum, copy) => sum + copy.qty, 0)
  return qty > 0 ? { name, qty, copies: normalized } : null
}

/** @returns Item with `qty` copies of `version` added. */
export function addCopies(item: InventoryItem | undefined, name: string, qty: number, version: Version = ANY_VERSION) {
  return itemFromCopies(item?.name ?? name, [...(item?.copies ?? []), { qty, ...version }])
}

/**
 * Sets the total owned. Increases add copies of `version`; decreases remove unversioned copies
 * first, then versioned copies from the end of the sorted list.
 * @returns Updated item; null if total becomes 0.
 */
export function withTotal(item: InventoryItem | undefined, name: string, qty: number, version: Version = ANY_VERSION) {
  const owned = item?.qty ?? 0
  if (qty >= owned) return addCopies(item, name, qty - owned, version)
  let toRemove = owned - qty
  const copies = item?.copies ?? []
  const plain = copies.filter((copy) => !copy.set)
  const versioned = copies.filter((copy) => copy.set).reverse()
  const kept = new Map<OwnedCopy, number>()
  for (const copy of [...plain, ...versioned]) {
    const taken = Math.min(copy.qty, toRemove)
    toRemove -= taken
    kept.set(copy, copy.qty - taken)
  }
  return itemFromCopies(item?.name ?? name, (item?.copies ?? []).map((copy) => ({ ...copy, qty: kept.get(copy) ?? copy.qty })))
}

/** @returns Versioned copy of the given finish with the most copies (used for unpinned lines); null if none. */
export function ownedVersion(item: InventoryItem | undefined, foil: boolean): OwnedCopy | null {
  let best: OwnedCopy | null = null
  for (const copy of item?.copies ?? []) {
    if (copy.set && copy.foil === foil && (!best || copy.qty > best.qty)) best = copy
  }
  return best
}

/** @returns Whether any copy has a set or is foil. */
export const hasVersions = (item: InventoryItem) => item.copies.some((copy) => copy.set || copy.foil)
