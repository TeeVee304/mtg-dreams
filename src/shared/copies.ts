/**
 * How owned copies count toward lists. Shared: every list counts every owned copy, as if cards move
 * between decks. Separate: each copy belongs to one list, handed out in allocation order (decks by
 * name, then wishlists by priority, then name); a list owns what the lists ahead of it leave.
 *
 * @packageDocumentation
 */

import { cardLines, nameKey } from './decklist'
import { listPriority, priorityWeight } from './listPriority'
import type { InventoryItem, ListKind, ListLine } from './types'

/** Owned copies mode. */
export type CopiesMode = 'separate' | 'shared'

/** Copies mode options with UI label and hint. */
export const COPIES_MODES: Array<{ id: CopiesMode; label: string; hint: string }> = [
  {
    id: 'separate',
    label: 'Separate per list',
    hint: 'Each deck and wishlist needs its own copies, as when decks stay built. Decks get your copies first, then wishlists by priority.'
  },
  {
    id: 'shared',
    label: 'Shared between lists',
    hint: 'One copy counts for every list, as when you move cards between decks.'
  }
]

/** Default mode. */
export const DEFAULT_COPIES: CopiesMode = 'separate'

/** Type guard for {@link CopiesMode}. */
export function isCopiesMode(value: unknown): value is CopiesMode {
  return value === 'separate' || value === 'shared'
}

/** List identity; names are unique per kind only. */
export interface ListKey {
  kind: ListKind
  name: string
}

/** @returns Unique string id of a list. */
export const listId = (list: ListKey) => `${list.kind}/${list.name}`

/** List as seen by allocation. */
export interface PoolList extends ListKey {
  lines: ListLine[]
}

/** Most Wanted weight of a deck: as a high-priority wishlist, since decks get copies first. */
export const DECK_WEIGHT = priorityWeight('high')

/** @returns Most Wanted weight of a list. */
export function listWeight(list: PoolList): number {
  return list.kind === 'deck' ? DECK_WEIGHT : priorityWeight(listPriority(list.lines))
}

/** @returns Copies per card across a list's lines, by nameKey, named after the first line. */
export function cardTotals(lines: ListLine[]): Map<string, { name: string; qty: number }> {
  const totals = new Map<string, { name: string; qty: number }>()
  for (const line of cardLines(lines)) {
    const key = nameKey(line.name)
    const total = totals.get(key)
    if (total) total.qty += line.qty
    else totals.set(key, { name: line.name, qty: line.qty })
  }
  return totals
}

/** @returns Copy of `lists` in allocation order: decks by name, then wishlists by priority (high first), then name. */
export function allocationOrder<L extends PoolList>(lists: L[]): L[] {
  const rank = (list: L) => (list.kind === 'deck' ? Infinity : priorityWeight(listPriority(list.lines)))
  return [...lists].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))
}

/** Owned copies of a card that one list gets. */
export interface HeldCopies extends ListKey {
  qty: number
}

/** Copy claims of all lists, from {@link copyPool}. */
export interface CopyPool {
  mode: CopiesMode
  /** Copies of a card that lists ahead of `list` take first; 0 with shared copies. Unknown lists come last. */
  held(list: ListKey, key: string): number
  /**
   * Lists ahead of `list` that get some of the `owned` copies of a card, with the copies each gets,
   * in allocation order; none with shared copies.
   */
  holders(list: ListKey, key: string, owned: number): HeldCopies[]
  /**
   * Lists that get some of the `owned` copies of a card, with the copies each gets: handed out in
   * allocation order with separate copies; with shared copies, every list using it, each with all it uses.
   */
  usedBy(key: string, owned: number): HeldCopies[]
  /** Copies of a card the lists keep, owned or not: all their claims with separate copies, the largest one with shared copies. */
  inUse(key: string): number
  /** Copies of a card in decks other than `list`; 0 with shared copies. */
  inOtherDecks(list: ListKey, key: string): number
  /** Copies of a card claimed by all lists together; 0 with shared copies, where lists claim none. */
  claimed(key: string): number
}

/** A list's claim on a card's copies. */
interface Claim {
  /** Position in allocation order. */
  at: number
  list: ListKey
  /** {@link listId} of a deck; null for wishlists. */
  deck: string | null
  qty: number
}

/** @returns Copy claims of `lists` in `mode`; recompute when lists change. */
export function copyPool(lists: PoolList[], mode: CopiesMode): CopyPool {
  const order = allocationOrder(lists)
  const index = new Map(order.map((list, i) => [listId(list), i]))
  const claims = new Map<string, Claim[]>()
  order.forEach((list, at) => {
    for (const [key, total] of cardTotals(list.lines)) {
      const claim = { at, list: { kind: list.kind, name: list.name }, deck: list.kind === 'deck' ? listId(list) : null, qty: total.qty }
      const entries = claims.get(key)
      if (entries) entries.push(claim)
      else claims.set(key, [claim])
    }
  })
  const sum = (key: string, keep: (claim: Claim) => boolean) =>
    mode === 'shared' ? 0 : (claims.get(key) ?? []).reduce((total, claim) => (keep(claim) ? total + claim.qty : total), 0)
  /** Hands `owned` copies out to the claims before position `before`, in allocation order. */
  const handOut = (key: string, owned: number, before: number): HeldCopies[] => {
    const given: HeldCopies[] = []
    let left = owned
    for (const claim of claims.get(key) ?? []) {
      if (claim.at >= before || left <= 0) break
      const qty = Math.min(claim.qty, left)
      given.push({ ...claim.list, qty })
      left -= qty
    }
    return given
  }
  return {
    mode,
    held: (list, key) => {
      const at = index.get(listId(list)) ?? Infinity
      return sum(key, (claim) => claim.at < at)
    },
    holders: (list, key, owned) => (mode === 'shared' ? [] : handOut(key, owned, index.get(listId(list)) ?? Infinity)),
    usedBy: (key, owned) =>
      mode === 'separate'
        ? handOut(key, owned, Infinity)
        : owned > 0
          ? (claims.get(key) ?? []).map((claim) => ({ ...claim.list, qty: Math.min(claim.qty, owned) }))
          : [],
    inUse: (key) =>
      mode === 'shared' ? Math.max(0, ...(claims.get(key) ?? []).map((claim) => claim.qty)) : sum(key, () => true),
    inOtherDecks: (list, key) => sum(key, (claim) => claim.deck !== null && claim.deck !== listId(list)),
    claimed: (key) => sum(key, () => true)
  }
}

/**
 * Copies to add to the inventory so `cards` (e.g. a new deck) are covered by owned copies no list
 * claims; with shared copies, by any owned copies.
 * @returns Cards merged by nameKey with the copies to add; covered cards omitted.
 */
export function copiesToAdd(
  cards: Array<{ name: string; qty: number }>,
  inventory: Map<string, InventoryItem>,
  pool: CopyPool
): Array<{ name: string; qty: number }> {
  const merged = new Map<string, { name: string; qty: number }>()
  for (const card of cards) {
    const key = nameKey(card.name)
    const total = merged.get(key)
    if (total) total.qty += card.qty
    else merged.set(key, { name: card.name, qty: card.qty })
  }
  return [...merged]
    .map(([key, card]) => ({ name: card.name, qty: card.qty - Math.max(0, (inventory.get(key)?.qty ?? 0) - pool.claimed(key)) }))
    .filter((card) => card.qty > 0)
}

/** Copies of a card a list still lacks. */
export interface CardNeed {
  /** nameKey. */
  key: string
  name: string
  /** Copies across the list's lines. */
  wants: number
  /** Copies not covered by owned copies; at least 1. */
  missing: number
}

/**
 * Copies each list still lacks, in allocation order. Shared: wishlists only, each against the whole
 * inventory. Separate: decks and wishlists, each against the copies the lists ahead leave.
 * @param inventory - Items by nameKey.
 * @param pool - Copy claims of `lists` in `mode`, if already built.
 * @returns Every considered list with its needs (possibly none).
 */
export function listNeeds<L extends PoolList>(
  lists: L[],
  inventory: Map<string, InventoryItem>,
  mode: CopiesMode,
  pool: CopyPool = copyPool(lists, mode)
): Array<{ list: L; needs: CardNeed[] }> {
  const considered = mode === 'shared' ? lists.filter((list) => list.kind === 'wishlist') : lists
  return allocationOrder(considered).map((list) => {
    const needs: CardNeed[] = []
    for (const [key, total] of cardTotals(list.lines)) {
      const free = Math.max(0, (inventory.get(key)?.qty ?? 0) - pool.held(list, key))
      if (total.qty > free) needs.push({ key, name: total.name, wants: total.qty, missing: total.qty - free })
    }
    return { list, needs }
  })
}
