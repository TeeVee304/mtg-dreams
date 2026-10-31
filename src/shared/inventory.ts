import { sumOf, totalCopies } from './totals'
import type { CardLine, InventoryItem, OwnedCopy } from './types'

/**
 * Inventory item operations. Ownership checks use totals; copy versions drive valuation and
 * display. All functions are non-mutating (undo history retains prior objects).
 *
 * @packageDocumentation
 */

/** Printing, finish and language of owned copies, and whether they count in the value; no `set` means unspecified. */
export type Version = Pick<OwnedCopy, 'set' | 'collector' | 'foil' | 'lang' | 'worthless'>

/** Unversioned, non-foil. */
const ANY_VERSION: Version = { foil: false }

/**
 * Owned-copy version equality (printing, finish, language, valued); missing fields compare as empty.
 * Not to be confused with `sameVersion` in `listVersion`, which compares a list's versions (Duel, Counters).
 */
const sameCopyVersion = (a: Version, b: Version) =>
  (a.set ?? '') === (b.set ?? '') &&
  (a.collector ?? '') === (b.collector ?? '') &&
  a.foil === b.foil &&
  (a.lang ?? '') === (b.lang ?? '') &&
  !a.worthless === !b.worthless

/** Copy order: unversioned first, then by set, collector number (numeric), non-foil before foil, English first, valued first. */
function compareCopies(a: OwnedCopy, b: OwnedCopy): number {
  if (!a.set !== !b.set) return a.set ? 1 : -1
  return (
    (a.set ?? '').localeCompare(b.set ?? '') ||
    (a.collector ?? '').localeCompare(b.collector ?? '', undefined, { numeric: true }) ||
    Number(a.foil) - Number(b.foil) ||
    (a.lang ?? '').localeCompare(b.lang ?? '') ||
    Number(!!a.worthless) - Number(!!b.worthless)
  )
}

/** @returns Copies merged by version, non-positive quantities dropped, sorted; `collector` cleared without `set`. */
export function normalizeCopies(copies: OwnedCopy[]): OwnedCopy[] {
  const merged: OwnedCopy[] = []
  for (const copy of copies) {
    if (!(copy.qty > 0)) continue
    const version: Version = {
      set: copy.set || undefined,
      collector: copy.set ? copy.collector || undefined : undefined,
      foil: copy.foil,
      ...(copy.lang && { lang: copy.lang }),
      ...(copy.worthless && { worthless: true as const })
    }
    const same = merged.find((other) => sameCopyVersion(other, version))
    if (same) same.qty += copy.qty
    else merged.push({ qty: copy.qty, ...version })
  }
  return merged.sort(compareCopies)
}

/** @returns Item from normalized copies; null if total is 0. */
export function itemFromCopies(name: string, copies: OwnedCopy[]): InventoryItem | null {
  const normalized = normalizeCopies(copies)
  const qty = totalCopies(normalized)
  return qty > 0 ? { name, qty, copies: normalized } : null
}

/** @returns Item with `qty` copies of `version` added. */
export function addCopies(item: InventoryItem | undefined, name: string, qty: number, version: Version = ANY_VERSION) {
  return itemFromCopies(item?.name ?? name, [...(item?.copies ?? []), { qty, ...version }])
}

/**
 * @returns Whether a copy is of the printing and finish `version` names; a version without a
 * collector number takes any in its set.
 */
export const isVersionOf = (copy: OwnedCopy, version: Version) =>
  copy.set === version.set && (!version.collector || copy.collector === version.collector) && copy.foil === version.foil

/**
 * @returns An item's copies when each records a printing and none is the one a line names, in
 * either finish ("you own another version"). Empty when the line names no printing, that printing
 * is owned, or a copy records no printing: it may well be that one.
 */
export function otherVersions(item: InventoryItem | undefined, version: Version | undefined): OwnedCopy[] {
  if (!item || !version?.set) return []
  const owns = item.copies.some((copy) => !copy.set || isVersionOf(copy, { ...version, foil: copy.foil }))
  return owns ? [] : item.copies
}

/**
 * Sets the total owned. Increases add copies of `version`; decreases remove copies of `version`
 * first, then unversioned copies, then versioned copies from the end of the sorted list.
 * @returns Updated item; null if total becomes 0.
 */
export function withTotal(item: InventoryItem | undefined, name: string, qty: number, version: Version = ANY_VERSION) {
  const owned = item?.qty ?? 0
  if (qty >= owned) return addCopies(item, name, qty - owned, version)
  let toRemove = owned - qty
  const copies = item?.copies ?? []
  // Copies of the version asked for go first, so lowering undoes what raising with it added.
  const asked = version.set ? copies.filter((copy) => isVersionOf(copy, version)) : []
  const rest = copies.filter((copy) => !asked.includes(copy))
  const plain = rest.filter((copy) => !copy.set)
  const versioned = rest.filter((copy) => copy.set).reverse()
  const kept = new Map<OwnedCopy, number>()
  for (const copy of [...asked, ...plain, ...versioned]) {
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

/** @returns Whether any copy has a set, is foil, is in another language or is worthless. */
export const hasVersions = (item: InventoryItem) => item.copies.some((copy) => copy.set || copy.foil || copy.lang || copy.worthless)

/** @returns Copies of an item left out of its value. */
export const worthlessCopies = (item: InventoryItem | undefined) =>
  (item?.copies ?? []).reduce((sum, copy) => sum + (copy.worthless ? copy.qty : 0), 0)

/** What a list line asks of the copies that serve it. */
type WantedVersion = Pick<CardLine, 'qty' | 'set' | 'collector' | 'foil' | 'standIn'>

/** @returns Whether a line wants a Version (a printing, or the foil finish) its copies must match; a `{Stand-in}` line takes any copy. */
export const wantsVersion = (line: WantedVersion) => !line.standIn && (!!line.set || line.foil)

/**
 * @returns Whether a copy serves a line that wants a Version: same finish, and the printing it names,
 * or no recorded printing (it may well be that one). The language never matters.
 */
export function servesVersion(copy: OwnedCopy, line: WantedVersion): boolean {
  if (copy.foil !== line.foil) return false
  return !line.set || !copy.set || (copy.set === line.set && (!line.collector || copy.collector === line.collector))
}

/** Owned copies a line gets from {@link coverLines}. */
export interface LineCover {
  /** Copies that serve the line. */
  owned: number
  /** Copies of other Versions it could take instead: substitutes, which count toward nothing. */
  substitutes: number
}

/**
 * Hands a card's free copies out to its lines: first to lines wanting a Version, only copies that
 * serve them ({@link servesVersion}); then any copy to the other lines; what is left goes to the
 * Version lines' shortfalls as substitutes.
 * @param copies - The card's owned copies.
 * @param available - Copies the list may use (those lists ahead leave), at most the copies owned.
 * @returns A cover per line, in order.
 */
export function coverLines(lines: WantedVersion[], copies: OwnedCopy[], available: number): LineCover[] {
  const left = copies.map((copy) => copy.qty)
  let free = Math.min(available, sumOf(left, (qty) => qty))
  const covers = lines.map(() => ({ owned: 0, substitutes: 0 }))
  const take = (index: number, from: (copy: OwnedCopy) => boolean) => {
    copies.forEach((copy, i) => {
      if (!from(copy)) return
      const qty = Math.min(lines[index].qty - covers[index].owned, left[i], free)
      covers[index].owned += qty
      left[i] -= qty
      free -= qty
    })
  }
  lines.forEach((line, i) => wantsVersion(line) && take(i, (copy) => servesVersion(copy, line)))
  lines.forEach((line, i) => !wantsVersion(line) && take(i, () => true))
  lines.forEach((line, i) => {
    if (!wantsVersion(line)) return
    covers[i].substitutes = Math.min(line.qty - covers[i].owned, free)
    free -= covers[i].substitutes
  })
  return covers
}
