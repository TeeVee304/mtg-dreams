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
  canLead,
  commanderIssue,
  copyLimit,
  legalityIssue,
  listCommander,
  listFormat,
  type DeckFormat,
  type LegalityIssue
} from './formats'
import { SIDEBOARD_MAX } from './sideboard'
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
  /** Copies of the same card claimed by lists ahead of this one (separate copies). */
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
}

/** Derived list state from {@link analyzeList}. */
export interface ListAnalysis<R extends ModelRow> {
  format: DeckFormat | null
  /** Total copies of a card across all lines. */
  copiesOf(name: string): number
  /** Commander nameKey; null outside commander formats or if unset. */
  commanderKey: string | null
  /** Row is the commander (never a bundled basic). */
  isCommander(row: R): boolean
  /** Row's card is eligible as commander in this format. */
  canBeCommander(row: R): boolean
  /** Some row is the commander. */
  hasCommander: boolean
  /** Format issue; null if none, no format, or no card data. */
  issueOf(row: R): LegalityIssue | null
  /** Decks: list copies exceeding the inventory copies left by lists ahead. Wishlists: 0. */
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

/** Computes format, commander, legality and ownership state for a list. */
export function analyzeList<R extends ModelRow>(kind: ListKind, lines: ListLine[], rows: R[]): ListAnalysis<R> {
  const format = listFormat(lines)
  const copies = new Map<string, number>()
  for (const line of cardLines(lines)) copies.set(nameKey(line.name), (copies.get(nameKey(line.name)) ?? 0) + line.qty)
  const copiesOf = (name: string) => copies.get(nameKey(name)) ?? 0

  const commanderName = format?.commander ? listCommander(lines) : null
  const commanderKey = commanderName ? nameKey(commanderName) : null
  const isCommander = (row: R) => !row.bundledIds && commanderKey !== null && nameKey(row.line.name) === commanderKey
  const canBeCommander = (row: R) =>
    !!format?.commander && !row.bundledIds && !!row.info && canLead(format, row.info, row.entry?.data?.printings)

  const issues = new Map<R, LegalityIssue | null>()
  if (format) {
    for (const row of rows) {
      if (!row.info) continue
      const count = copiesOf(row.line.name)
      issues.set(
        row,
        isCommander(row)
          ? commanderIssue(format, row.info, row.entry?.data?.printings ?? [], count)
          : legalityIssue(format, row.info, count)
      )
    }
  }
  const issueOf = (row: R) => issues.get(row) ?? null
  const sideboardCards = rows.filter((row) => row.side).reduce((sum, row) => sum + row.line.qty, 0)
  const shortfallOf = (row: R) => (kind === 'deck' ? Math.max(0, copiesOf(row.line.name) - freeCopies(row)) : 0)

  return {
    format,
    copiesOf,
    commanderKey,
    isCommander,
    canBeCommander,
    hasCommander: rows.some(isCommander),
    issueOf,
    shortfallOf,
    legalityErrors: rows.filter((row) => issueOf(row)?.severity === 'error').length,
    ownershipErrors: rows.filter((row) => shortfallOf(row) > 0).length,
    hasProblem: (row) => issueOf(row)?.severity === 'error' || shortfallOf(row) > 0,
    sideboardCards,
    sideboardIssue:
      format && !format.commander && sideboardCards > SIDEBOARD_MAX ? `Max ${SIDEBOARD_MAX} in ${format.label}` : null
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
      !(hideOwned && kind === 'wishlist' && row.owned >= row.line.qty) &&
      !(onlyProblems && !analysis.hasProblem(row))
  )
}

/**
 * @returns Rows in `sort` order; `file` returns the input as is. Price sorts are descending
 * with unpriced rows last.
 */
export function sortRows<R extends ModelRow>(rows: R[], sort: SortKey): R[] {
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
  if (holders.length === 1 && holders[0].qty >= owned) return `${owned === 1 ? 'in' : 'all in'} ${holders[0].name}`
  const named = holders.slice(0, 2).map((held) => `${held.qty} in ${held.name}`).join(', ')
  const more = holders.length - 2
  return more > 0 ? `${named} and ${more} more ${more === 1 ? 'list' : 'lists'}` : named
}

/** @returns Short label and explanation of a deck row's shortfall, naming the decks ahead when `row.holders` is set. */
export function shortfallNote(row: ModelRow): { label: string; title: string } {
  if (row.inventoryQty === 0) return { label: 'Not in inventory', title: 'Decks can only use cards from your inventory' }
  if (row.held === 0) return { label: `Only ${row.inventoryQty} owned`, title: 'Decks can only use cards from your inventory' }
  const free = freeCopies(row)
  const holders = row.holders ?? []
  const used = free > 0 ? `Only ${free} free` : holders.length === 1 ? `Used by ${holders[0].name}` : 'Used by other decks'
  const where = holders.length > 0 ? heldWhere(holders, row.inventoryQty) : `decks ahead of this one use ${Math.min(row.held, row.inventoryQty)}`
  return { label: used, title: `You own ${row.inventoryQty} (${where}). Each copy belongs to one deck.` }
}

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
 * (not split by type); empty sections omitted.
 */
export function sectionRows<R extends ModelRow>(rows: R[], analysis: ListAnalysis<R>): Section<R>[] {
  const { isCommander } = analysis
  const sections: Section<R>[] = [
    { id: 'Commander', label: 'Commander', rows: rows.filter(isCommander) },
    ...TYPE_GROUPS.map((group) => ({
      id: group.id as string,
      label: group.label as string,
      rows: rows.filter((row) => !row.side && !isCommander(row) && typeGroup(row.info) === group.id)
    })),
    { id: 'Sideboard', label: 'Sideboard', rows: rows.filter((row) => row.side), warning: analysis.sideboardIssue }
  ]
  return sections.filter((section) => section.rows.length > 0)
}

/** @returns Total land copies. */
export function landCount(rows: ModelRow[]): number {
  return rows.filter((row) => typeGroup(row.info) === 'Land').reduce((sum, row) => sum + row.line.qty, 0)
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
  /** Copies in other decks (separate copies). */
  inOtherDecks: number
}

/**
 * @param ownedQty - Inventory copies of the card.
 * @param inOtherDecks - Copies in other decks (`CopyPool.inOtherDecks`); 0 with shared copies.
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

const copyWord = (n: number) => (n === 1 ? 'copy' : 'copies')

/** @returns User-facing reason for the binding cap (format if it is the lower one, else ownership). */
export function limitReason(format: DeckFormat | null, name: string, caps: CopyCaps): string {
  if (format && caps.formatCap <= caps.ownedCap) return `${format.label} allows ${caps.formatCap} ${copyWord(caps.formatCap)} of ${name}`
  return caps.inOtherDecks > 0
    ? `You own ${caps.ownedQty}× ${name}, ${Math.min(caps.inOtherDecks, caps.ownedQty)} in other decks`
    : `You own ${caps.ownedQty}× ${name}`
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
