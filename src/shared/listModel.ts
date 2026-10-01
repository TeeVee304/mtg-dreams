import {
  compareCards,
  isCardSort,
  matchesFilters,
  TYPE_GROUPS,
  typeGroup,
  type CardFilters,
  type SortKey
} from './cards'
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
import type { CardInfo, CardLine, ListKind, ListLine, Printing } from './types'

// The rules behind a deck or wishlist page, kept apart from the page itself so
// they can be tested: legality and ownership problems, the commander, which rows
// show and in what order, the type sections, and how many copies a card may have.

/** What the rules need to know about one row of a list (one line, or one bundled basic land). */
export interface ModelRow {
  line: CardLine
  /** Card data; undefined while it loads. */
  info?: CardInfo | null
  /** Scryfall's answer for the card, once it has one. */
  entry?: { data?: { printings: Printing[]; notFound?: boolean } }
  /** Copies of the card in the inventory. */
  inventoryQty: number
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card wanted by earlier lines of the list. */
  before: number
  unit: number | null
  rarity?: string
  /** Name printed on the pinned version, when it isn't the official one. */
  flavorName?: string
  /** Set on a bundled basic land. */
  bundledIds?: string[]
}

export interface ListAnalysis<R extends ModelRow> {
  format: DeckFormat | null
  /** Copies of a card across every line of the list. */
  copiesOf(name: string): number
  /** The commander's name key, in a commander format that has one set. */
  commanderKey: string | null
  isCommander(row: R): boolean
  /** Whether the card could be chosen as commander in this format. */
  canBeCommander(row: R): boolean
  hasCommander: boolean
  /** Why the card breaks the format, or null (also null without a format or card data). */
  issueOf(row: R): LegalityIssue | null
  /** Decks only use cards you own: copies missing from the inventory. Always 0 for wishlists. */
  shortfallOf(row: R): number
  /** Rows breaking the format's rules. */
  legalityErrors: number
  /** Rows of a deck with cards you don't own. */
  ownershipErrors: number
  hasProblem(row: R): boolean
}

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
  const shortfallOf = (row: R) => (kind === 'deck' ? Math.max(0, copiesOf(row.line.name) - row.inventoryQty) : 0)

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
    hasProblem: (row) => issueOf(row)?.severity === 'error' || shortfallOf(row) > 0
  }
}

export interface RowFilters {
  filters: CardFilters
  /** Wishlists: hide lines you already own. */
  hideOwned: boolean
  /** Only rows with a red tag (rules or ownership). */
  onlyProblems: boolean
}

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

/** Rows in the chosen order; "List order" keeps the file's. Unpriced cards sort after priced ones. */
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

export interface Section<R> {
  id: string
  label: string
  rows: R[]
}

/** The commander on top, then one section per card type; empty sections are left out. */
export function sectionRows<R extends ModelRow>(rows: R[], analysis: ListAnalysis<R>): Section<R>[] {
  const { isCommander } = analysis
  return [
    { id: 'Commander', label: 'Commander', rows: rows.filter(isCommander) },
    ...TYPE_GROUPS.map((group) => ({
      id: group.id as string,
      label: group.label as string,
      rows: rows.filter((row) => !isCommander(row) && typeGroup(row.info) === group.id)
    }))
  ].filter((section) => section.rows.length > 0)
}

export function landCount(rows: ModelRow[]): number {
  return rows.filter((row) => typeGroup(row.info) === 'Land').reduce((sum, row) => sum + row.line.qty, 0)
}

export interface CopyCaps {
  /** The format's limit (Infinity without a format, and for basic lands or "any number" cards). */
  formatCap: number
  /** Decks: the copies you own. Infinity for wishlists. */
  ownedCap: number
  cap: number
}

/** Copies of a card a list may hold. */
export function copyCaps(
  kind: ListKind,
  format: DeckFormat | null,
  name: string,
  info: CardInfo | null | undefined,
  ownedQty: number
): CopyCaps {
  const formatCap = format ? copyLimit(format, info, name) : Infinity
  const ownedCap = kind === 'deck' ? ownedQty : Infinity
  return { formatCap, ownedCap, cap: Math.min(formatCap, ownedCap) }
}

const copyWord = (n: number) => (n === 1 ? 'copy' : 'copies')

/** Why a card can't get more copies, for tooltips and messages. */
export function limitReason(format: DeckFormat | null, name: string, { formatCap, ownedCap }: CopyCaps): string {
  return format && formatCap <= ownedCap
    ? `${format.label} allows ${formatCap} ${copyWord(formatCap)} of ${name}`
    : `You own ${ownedCap}× ${name}`
}

/**
 * The most a line's quantity may reach, given the other lines of the same card.
 * A line already over the limit keeps its copies but can't grow. Undefined: no limit.
 */
export function lineMax(line: CardLine, caps: CopyCaps, copiesInList: number): number | undefined {
  const room = caps.cap - (copiesInList - line.qty)
  return Number.isFinite(room) ? Math.max(line.qty, room) : undefined
}

export type OwnedChange = { kind: 'set'; qty: number } | { kind: 'confirm'; target: number }

/**
 * Ticking a wishlist line's "owned" box. Earlier lines of the same card get the
 * inventory first, so owning this line means covering them plus it. Unticking
 * asks first when it would remove copies that other lists may count on.
 */
export function ownedToggle(row: ModelRow): OwnedChange {
  const covered = row.before + row.line.qty
  if (row.owned < row.line.qty) return { kind: 'set', qty: Math.max(row.inventoryQty, covered) }
  if (row.inventoryQty > covered) return { kind: 'confirm', target: row.before }
  return { kind: 'set', qty: row.before }
}
