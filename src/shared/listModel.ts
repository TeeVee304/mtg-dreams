import {
  compareCards,
  isCardSort,
  matchesFilters,
  TYPE_GROUPS,
  typeGroup,
  type CardFilters,
  type SortKey
} from './cards'
import type { HeldCopies } from './copies'
import { cardLines, nameKey } from './decklist'
import {
  canJoin,
  canLead,
  colorIdentityIssue,
  commanderIssue,
  copyLimit,
  legalityIssue,
  listCommanders,
  listFormat,
  type DeckFormat,
  type LegalityIssue
} from './formats'
import { ui } from './text'
import { maybeboardIds, SIDEBOARD_MAX } from './sideboard'
import { sumOf } from './totals'
import type { CardInfo, CardLine, ListKind, ListLine, Printing } from './types'

/**
 * UI-independent list page logic: legality and ownership checks, commander, filtering,
 * sorting, type sections and copy caps.
 *
 * @packageDocumentation
 */

/** List row input: one line, or one bundled basic land. */
export interface ModelRow {
  line: CardLine
  /** Card data; undefined while loading, null if unknown. */
  info?: CardInfo | null
  /** Printings lookup state; `data` is set once loaded. */
  entry?: { data?: { printings: Printing[]; notFound?: boolean } }
  /** Total copies of the card in the inventory. */
  inventoryQty: number
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card claimed ahead of this line: by lists ahead, then earlier lines. */
  before: number
  /** Copies of the same card claimed by lists ahead of this one. */
  held: number
  /** Lists ahead that get the owned copies, with how many each gets (`CopyPool.holders`); set by list pages. */
  holders?: HeldCopies[]
  /** Unit price in EUR; null if unknown. */
  unit: number | null
  /** Rarity of the resolved printing. */
  rarity?: string
  /** Printed name of the resolved printing, if different from the oracle name. */
  flavorName?: string
  /** Merged line ids; set only on bundled basic lands. */
  bundledIds?: string[]
  /** Line is in the sideboard. */
  side?: boolean
  /** Line is on the maybeboard: considered, counting toward nothing. */
  maybe?: boolean
}

/** Derived list state from {@link analyzeList}. */
export interface ListAnalysis<R extends ModelRow> {
  format: DeckFormat | null
  /** Total copies of a card across all lines, the maybeboard aside. */
  copiesOf(name: string): number
  /** Commander nameKeys: two for partners; none outside commander formats or if unset. */
  commanderKeys: string[]
  /** Row is a commander (never a bundled basic). */
  isCommander(row: R): boolean
  /** Row's card is eligible as commander in this format, on its own. */
  canBeCommander(row: R): boolean
  /** Row's card can join the list's only commander as its partner. */
  canJoin(row: R): boolean
  /** Some row is a commander. */
  hasCommander: boolean
  /** Format issue; null if none, no format, or no card data. Only ever a warning on the maybeboard. */
  issueOf(row: R): LegalityIssue | null
  /** Decks: list copies exceeding the inventory copies left by lists ahead. Wishlists and the maybeboard: 0. */
  shortfallOf(row: R): number
  /** Rows with an error-severity issue. */
  legalityErrors: number
  /** Rows with a nonzero shortfall. */
  ownershipErrors: number
  /** Row has an error-severity issue or a shortfall. */
  hasProblem(row: R): boolean
  /** Sideboard copies. */
  sideboardCards: number
  /** Sideboard size violation of a constructed format; null if none. */
  sideboardIssue: string | null
}

/**
 * Computes format, commander, legality and ownership state for a list. Maybeboard rows (`maybe`) are
 * checked as if added to the list, with warnings only, and never lead it or fall short.
 */
export function analyzeList<R extends ModelRow>(kind: ListKind, lines: ListLine[], rows: R[]): ListAnalysis<R> {
  const format = listFormat(lines)
  const copies = new Map<string, number>()
  const maybe = maybeboardIds(lines)
  for (const line of cardLines(lines)) {
    if (!maybe.has(line.id)) copies.set(nameKey(line.name), (copies.get(nameKey(line.name)) ?? 0) + line.qty)
  }
  const copiesOf = (name: string) => copies.get(nameKey(name)) ?? 0

  const commanderKeys = format?.commander ? listCommanders(lines).map(nameKey) : []
  const isCommander = (row: R) => !row.bundledIds && !row.maybe && commanderKeys.includes(nameKey(row.line.name))
  const canBeCommander = (row: R) =>
    !!format?.commander && !row.bundledIds && !row.maybe && !!row.info && canLead(format, row.info, row.entry?.data?.printings)

  const leaders = rows.filter(isCommander)
  const leader = leaders.length === 1 ? leaders[0].info : null
  const joins = (row: R) =>
    !!format && !!leader && !row.bundledIds && !row.maybe && !!row.info && !isCommander(row) && canJoin(format, leader, row.info, row.entry?.data?.printings)
  // The commanders' colors together, once all have loaded.
  const identity = leaders.length > 0 && leaders.every((row) => row.info)
    ? [...new Set(leaders.flatMap((row) => row.info!.colorIdentity))]
    : null
  const issues = new Map<R, LegalityIssue | null>()
  if (format) {
    for (const row of rows) {
      if (!row.info) continue
      // A maybeboard Card is checked as if added: the list's copies and its own.
      const count = copiesOf(row.line.name) + (row.maybe ? row.line.qty : 0)
      const partner = leaders.find((other) => other !== row)?.info ?? null
      // A pair is checked once both commanders have loaded.
      if (isCommander(row) && leaders.length > 1 && !partner) continue
      issues.set(
        row,
        isCommander(row)
          ? commanderIssue(format, row.info, row.entry?.data?.printings ?? [], count, leaders.length > 1 ? partner : null)
          : legalityIssue(format, row.info, count) ?? (identity ? colorIdentityIssue(row.info, identity, leaders.length > 1) : null)
      )
    }
  }
  const issueOf = (row: R): LegalityIssue | null => {
    const issue = issues.get(row) ?? null
    return issue && row.maybe ? { ...issue, severity: 'warning' } : issue
  }
  const sideboardCards = sumOf(rows, (row) => (row.side ? row.line.qty : 0))
  const shortfallOf = (row: R) => (kind === 'deck' && !row.maybe ? Math.max(0, copiesOf(row.line.name) - freeCopies(row)) : 0)

  return {
    format,
    copiesOf,
    commanderKeys,
    isCommander,
    canBeCommander,
    canJoin: joins,
    hasCommander: leaders.length > 0,
    issueOf,
    shortfallOf,
    legalityErrors: rows.filter((row) => issueOf(row)?.severity === 'error').length,
    ownershipErrors: rows.filter((row) => shortfallOf(row) > 0).length,
    hasProblem: (row) => issueOf(row)?.severity === 'error' || shortfallOf(row) > 0,
    sideboardCards,
    sideboardIssue:
      format && !format.commander && sideboardCards > SIDEBOARD_MAX ? ui.rules.maxSideboard(SIDEBOARD_MAX, format.label) : null
  }
}

/** Row filter options. */
export interface RowFilters {
  filters: CardFilters
  /** Wishlists only: hide fully owned lines. */
  hideOwned: boolean
  /** Show only rows where {@link ListAnalysis.hasProblem} holds. */
  onlyProblems: boolean
}

/** @returns Rows passing card filters (name matched against oracle and flavor name) and row options. */
export function filterRows<R extends ModelRow>(
  rows: R[],
  kind: ListKind,
  analysis: ListAnalysis<R>,
  { filters, hideOwned, onlyProblems }: RowFilters
): R[] {
  return rows.filter(
    (row) =>
      matchesFilters(`${row.line.name} ${row.flavorName ?? ''}`, row.info, row.rarity, filters) &&
      !(hideOwned && kind !== 'deck' && row.owned >= row.line.qty) &&
      !(onlyProblems && !analysis.hasProblem(row))
  )
}

/**
 * @param reverse - The reverse of the usual direction ({@link sortRows}); unpriced rows stay last.
 * @returns Rows in `sort` order.
 */
export function sortRows<R extends ModelRow>(rows: R[], sort: SortKey, reverse = false): R[] {
  const sorted = sortRowsUsual(rows, sort)
  if (!reverse) return sorted
  if (sort !== 'unit' && sort !== 'needed') return [...sorted].reverse()
  return [...sorted.filter((row) => row.unit !== null).reverse(), ...sorted.filter((row) => row.unit === null)]
}

/**
 * @returns Rows in `sort` order, in its usual direction; `file` returns the input as is. Price,
 * quantity and owned sorts are descending, with unpriced rows last.
 */
function sortRowsUsual<R extends ModelRow>(rows: R[], sort: SortKey): R[] {
  const byName = (a: R, b: R) => a.line.name.localeCompare(b.line.name)
  const neededValue = (row: R) => (row.unit ?? -1) * (row.line.qty - row.owned)
  const sortable = (row: R) => ({ name: row.line.name, info: row.info, rarity: row.rarity })
  switch (sort) {
    case 'file':
      return rows
    case 'recent':
      return [...rows].reverse()
    case 'unit':
      return [...rows].sort((a, b) => (b.unit ?? -1) - (a.unit ?? -1))
    case 'needed':
      return [...rows].sort((a, b) => neededValue(b) - neededValue(a))
    case 'qty':
      return [...rows].sort((a, b) => b.line.qty - a.line.qty || byName(a, b))
    case 'owned':
      return [...rows].sort((a, b) => b.owned - a.owned || byName(a, b))
    default:
      return isCardSort(sort) ? [...rows].sort((a, b) => compareCards(sort, sortable(a), sortable(b))) : rows
  }
}

/** @returns Inventory copies of the row's card left for its list by the lists ahead. */
export function freeCopies(row: ModelRow): number {
  return Math.max(0, row.inventoryQty - row.held)
}

/**
 * @param holders - Lists getting some of the `owned` copies ({@link HeldCopies}), in allocation order.
 * @returns Where those copies are, e.g. `all in Burn`, `in Burn` for a single copy, or `2 in Burn, 1 in
 * Zombies and 1 more list`; at most two lists are named.
 */
export function heldWhere(holders: HeldCopies[], owned: number): string {
  if (holders.length === 1 && holders[0].qty >= owned) return ui.ownership.heldAll(owned, holders[0].name)
  const named = holders.slice(0, 2).map((held) => ui.ownership.heldIn(held.qty, held.name)).join(', ')
  const more = holders.length - 2
  return more > 0 ? ui.ownership.heldMore(named, more) : named
}

/** @returns Short label and explanation of a deck row's shortfall, naming the decks ahead when `row.holders` is set. */
export function shortfallNote(row: ModelRow): { label: string; title: string } {
  const { ownership } = ui
  if (row.inventoryQty === 0) return { label: ownership.notInInventory, title: ownership.onlyFromInventory }
  if (row.held === 0) return { label: ownership.onlyOwned(row.inventoryQty), title: ownership.onlyFromInventory }
  const free = freeCopies(row)
  const holders = row.holders ?? []
  const used = free > 0 ? ownership.onlyFree(free) : holders.length === 1 ? ownership.usedBy(holders[0].name) : ownership.usedByOthers
  const where = holders.length > 0 ? heldWhere(holders, row.inventoryQty) : ownership.decksAhead(Math.min(row.held, row.inventoryQty))
  return { label: used, title: ownership.ownedWhere(row.inventoryQty, where) }
}

/** Id of the maybeboard's section ({@link sectionRows}). */
export const MAYBEBOARD_SECTION = 'Maybeboard'

/** Rendered list section. */
export interface Section<R> {
  id: string
  label: string
  rows: R[]
  /** Section-level rule violation, shown beside the label. */
  warning?: string | null
}

/**
 * @returns Commander section, one per {@link TYPE_GROUPS} entry for the main deck, then the sideboard
 * and the maybeboard (neither split by type); empty sections omitted.
 */
export function sectionRows<R extends ModelRow>(rows: R[], analysis: ListAnalysis<R>): Section<R>[] {
  const { isCommander } = analysis
  const sections: Section<R>[] = [
    { id: 'Commander', label: ui.sections.commander(analysis.commanderKeys.length), rows: rows.filter(isCommander) },
    ...TYPE_GROUPS.map((group) => ({
      id: group.id as string,
      label: group.label as string,
      rows: rows.filter((row) => !row.side && !row.maybe && !isCommander(row) && typeGroup(row.info) === group.id)
    })),
    { id: 'Sideboard', label: ui.sections.sideboard, rows: rows.filter((row) => row.side), warning: analysis.sideboardIssue },
    { id: MAYBEBOARD_SECTION, label: ui.sections.maybeboard, rows: rows.filter((row) => row.maybe) }
  ]
  return sections.filter((section) => section.rows.length > 0)
}

/** @returns Total land copies. */
export function landCount(rows: ModelRow[]): number {
  return sumOf(rows, (row) => (typeGroup(row.info) === 'Land' ? row.line.qty : 0))
}

/** Copy limits of a card in a list. */
export interface CopyCaps {
  /** Format limit; Infinity without a format or for unlimited cards. */
  formatCap: number
  /** Decks: owned copies not in other decks. Wishlists: Infinity. */
  ownedCap: number
  /** Effective limit: min of both. */
  cap: number
  /** Inventory copies. */
  ownedQty: number
  /** Copies in other built decks. */
  inOtherDecks: number
}

/**
 * @param ownedQty - Inventory copies of the card.
 * @param inOtherDecks - Copies in other decks (`CopyPool.inOtherDecks`).
 * @returns Format, ownership and effective copy limits.
 */
export function copyCaps(
  kind: ListKind,
  format: DeckFormat | null,
  name: string,
  info: CardInfo | null | undefined,
  ownedQty: number,
  inOtherDecks = 0
): CopyCaps {
  const formatCap = format ? copyLimit(format, info, name) : Infinity
  const ownedCap = kind === 'deck' ? Math.max(0, ownedQty - inOtherDecks) : Infinity
  return { formatCap, ownedCap, cap: Math.min(formatCap, ownedCap), ownedQty, inOtherDecks }
}


/** @returns User-facing reason for the binding cap (format if it is the lower one, else ownership). */
export function limitReason(format: DeckFormat | null, name: string, caps: CopyCaps): string {
  if (format && caps.formatCap <= caps.ownedCap) return ui.ownership.formatAllows(format.label, caps.formatCap, name)
  return caps.inOtherDecks > 0
    ? ui.ownership.ownedElsewhere(caps.ownedQty, name, Math.min(caps.inOtherDecks, caps.ownedQty))
    : ui.ownership.owned(caps.ownedQty, name)
}

/**
 * @param copiesInList - Total copies of the card across the list, including this line.
 * @returns Max quantity for this line, never below its current qty; undefined if unlimited.
 */
export function lineMax(line: CardLine, caps: Pick<CopyCaps, 'cap'>, copiesInList: number): number | undefined {
  const room = caps.cap - (copiesInList - line.qty)
  return Number.isFinite(room) ? Math.max(line.qty, room) : undefined
}

/** Result of {@link ownedToggle}: set inventory total, or confirm before reducing it to `target`. */
export type OwnedChange = { kind: 'set'; qty: number } | { kind: 'confirm'; target: number }

/**
 * Toggles a wishlist line's owned state. Owning sets the inventory total to cover the claims ahead
 * (lists ahead, earlier lines) plus this line. Unowning reduces it to `before`, requiring
 * confirmation if the inventory holds copies beyond this line (possibly used by other lists).
 */
export function ownedToggle(row: ModelRow): OwnedChange {
  const covered = row.before + row.line.qty
  if (row.owned < row.line.qty) return { kind: 'set', qty: Math.max(row.inventoryQty, covered) }
  if (row.inventoryQty > covered) return { kind: 'confirm', target: row.before }
  return { kind: 'set', qty: row.before }
}
