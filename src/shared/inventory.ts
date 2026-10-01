import type { InventoryItem, OwnedCopy } from './types'

// The inventory records each card by name, with its copies split by version and
// finish ("any version" when no set is given). Whether a deck or wishlist line is
// owned only looks at the total; the versions decide value and which version a
// line without one shows. Every function here returns new objects: the undo
// history keeps the old ones.

/** A version and finish of a card, as recorded for owned copies. */
export type Version = Pick<OwnedCopy, 'set' | 'collector' | 'foil'>

const ANY_VERSION: Version = { foil: false }

export const sameVersion = (a: Version, b: Version) =>
  (a.set ?? '') === (b.set ?? '') && (a.collector ?? '') === (b.collector ?? '') && a.foil === b.foil

/** "Any version" copies first (non-foil, then foil), then by set and collector number. */
function compareCopies(a: OwnedCopy, b: OwnedCopy): number {
  if (!a.set !== !b.set) return a.set ? 1 : -1
  return (
    (a.set ?? '').localeCompare(b.set ?? '') ||
    (a.collector ?? '').localeCompare(b.collector ?? '', undefined, { numeric: true }) ||
    Number(a.foil) - Number(b.foil)
  )
}

/** Merges copies of the same version, drops empty ones and sorts them. */
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

/** An inventory item from its copies; null when none are left. */
export function itemFromCopies(name: string, copies: OwnedCopy[]): InventoryItem | null {
  const normalized = normalizeCopies(copies)
  const qty = normalized.reduce((sum, copy) => sum + copy.qty, 0)
  return qty > 0 ? { name, qty, copies: normalized } : null
}

/** Adds copies of a version (any version by default). */
export function addCopies(item: InventoryItem | undefined, name: string, qty: number, version: Version = ANY_VERSION) {
  return itemFromCopies(item?.name ?? name, [...(item?.copies ?? []), { qty, ...version }])
}

/**
 * Sets how many copies you own in all. New copies are of `version` (any version by
 * default); removing takes "any version" copies first, then the latest versions.
 */
export function withTotal(item: InventoryItem | undefined, name: string, qty: number, version: Version = ANY_VERSION) {
  const owned = item?.qty ?? 0
  if (qty >= owned) return addCopies(item, name, qty - owned, version)
  let toRemove = owned - qty
  // Plain copies are the first to go, then versioned ones from the end of the list.
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

/**
 * The version a line without one shows: the owned version of that finish with the
 * most copies. Null when you only own "any version" copies of it.
 */
export function ownedVersion(item: InventoryItem | undefined, foil: boolean): OwnedCopy | null {
  let best: OwnedCopy | null = null
  for (const copy of item?.copies ?? []) {
    if (copy.set && copy.foil === foil && (!best || copy.qty > best.qty)) best = copy
  }
  return best
}

/** Whether any copy of the card has a recorded version or is foil. */
export const hasVersions = (item: InventoryItem) => item.copies.some((copy) => copy.set || copy.foil)
