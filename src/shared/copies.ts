/**
 * How owned copies count toward lists. Each copy belongs to one list, handed out in allocation order
 * (decks by name, then wishlists by priority, then name); a list owns what the lists ahead of it
 * leave. Two kinds of list share instead: an unbuilt deck (see {@link isUnbuilt}) uses every owned
 * copy and reserves none, and an upgrade of a deck (see {@link upgradeTarget}) also uses the copies
 * that deck gets, claiming only the rest.
 *
 * @packageDocumentation
 */

import { cardLines, nameKey } from './decklist'
import { listPriority, priorityWeight } from './listPriority'
import { isUnbuilt } from './listUnbuilt'
import { upgradeTarget } from './listUpgrade'
import { sumOf } from './totals'
import type { InventoryItem, ListKind, ListLine } from './types'

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
  /**
   * Copies of a card that lists ahead of `list` take first, of the `owned` copies, at most `owned`:
   * none for an unbuilt deck. An upgrade does not count the copies its deck gets, since it uses them
   * too. Unknown lists come last.
   */
  held(list: ListKey, key: string, owned: number): number
  /**
   * Lists ahead of `list` that get some of the `owned` copies of a card, with the copies each gets,
   * in allocation order; none for an unbuilt deck. An upgrade's deck is left out, as in {@link held}.
   */
  holders(list: ListKey, key: string, owned: number): HeldCopies[]
  /**
   * Lists that get some of the `owned` copies of a card, with the copies each gets, in allocation
   * order; then the unbuilt decks using the copies the others leave.
   */
  usedBy(key: string, owned: number): HeldCopies[]
  /**
   * Copies of a card the lists keep, of the `owned` copies or not: all their claims, or the most an
   * unbuilt deck or one of its upgrades uses, if more. Kept copies are never offered in trades.
   */
  inUse(key: string, owned: number): number
  /** Copies of a card in built decks other than `list`; none for an unbuilt deck, which may use any. */
  inOtherDecks(list: ListKey, key: string): number
  /** Copies of a card claimed by all lists together, given `owned` copies; unbuilt decks claim none. */
  claimed(key: string, owned: number): number
}

/** A list's claim on a card's copies. */
interface Claim {
  /** Position in allocation order. */
  at: number
  list: ListKey
  /** {@link listId} of a deck; null for wishlists. */
  deck: string | null
  /** An unbuilt deck's: it uses copies without reserving them. */
  unbuilt: boolean
  /** {@link listId} of the deck an upgrade shares copies with; null for other lists. */
  upgrades: string | null
  qty: number
}

/** @returns Copy claims of `lists`; recompute when lists change. */
export function copyPool(lists: PoolList[]): CopyPool {
  const order = allocationOrder(lists)
  const index = new Map(order.map((list, i) => [listId(list), i]))
  /** Deck each upgrade shares copies with, by {@link listId}. */
  const decks = new Map<string, string>()
  /** Unbuilt decks by {@link listId}. */
  const unbuilt = new Set<string>()
  const claims = new Map<string, Claim[]>()
  order.forEach((list, at) => {
    const target = upgradeTarget(list, lists)
    if (target) decks.set(listId(list), listId(target))
    const isDeck = list.kind === 'deck'
    if (isDeck && isUnbuilt(list.lines)) unbuilt.add(listId(list))
    for (const [key, total] of cardTotals(list.lines)) {
      const claim = {
        at,
        list: { kind: list.kind, name: list.name },
        deck: isDeck ? listId(list) : null,
        unbuilt: unbuilt.has(listId(list)),
        upgrades: target ? listId(target) : null,
        qty: total.qty
      }
      const entries = claims.get(key)
      if (entries) entries.push(claim)
      else claims.set(key, [claim])
    }
  })
  /**
   * Claims on a card's `owned` copies, in allocation order: unbuilt decks claim none. Decks come
   * first, so the copies each deck gets are known before its upgrades, which claim only what they
   * want beyond those.
   * @returns The claims, and the copies each deck gets by {@link listId}.
   */
  const allocate = (key: string, owned: number): { claims: Claim[]; got: Map<string, number> } => {
    const entries = claims.get(key) ?? []
    const got = new Map<string, number>()
    let left = owned
    const adjusted = entries.map((claim) => {
      if (claim.unbuilt) {
        got.set(claim.deck!, Math.min(claim.qty, owned))
        return { ...claim, qty: 0 }
      }
      const qty = claim.upgrades ? Math.max(0, claim.qty - (got.get(claim.upgrades) ?? 0)) : claim.qty
      if (claim.deck) got.set(claim.deck, Math.min(qty, Math.max(0, left)))
      left -= qty
      return qty === claim.qty ? claim : { ...claim, qty }
    })
    return { claims: adjusted, got }
  }
  const sum = (key: string, owned: number, keep: (claim: Claim) => boolean) =>
    sumOf(allocate(key, owned).claims, (claim) => (keep(claim) ? claim.qty : 0))
  /** Hands `owned` copies out to the claims before position `before`, in allocation order. */
  const handOut = (key: string, owned: number, before: number): HeldCopies[] => {
    const given: HeldCopies[] = []
    let left = owned
    for (const claim of allocate(key, owned).claims) {
      if (claim.at >= before || left <= 0) break
      const qty = Math.min(claim.qty, left)
      if (qty > 0) given.push({ ...claim.list, qty })
      left -= qty
    }
    return given
  }
  return {
    held: (list, key, owned) => {
      const id = listId(list)
      if (unbuilt.has(id)) return 0
      const at = index.get(id) ?? Infinity
      const { claims: entries, got } = allocate(key, owned)
      const held = sumOf(entries, (claim) => (claim.at < at ? claim.qty : 0))
      // An upgrade uses the copies its deck gets, then what all the lists ahead leave.
      const deck = decks.get(id)
      return Math.max(0, Math.min(owned, held) - (deck ? (got.get(deck) ?? 0) : 0))
    },
    holders: (list, key, owned) => {
      const id = listId(list)
      if (unbuilt.has(id)) return []
      const deck = decks.get(id)
      const given = handOut(key, owned, index.get(id) ?? Infinity)
      return deck ? given.filter((held) => listId(held) !== deck) : given
    },
    usedBy: (key, owned) => {
      const given = handOut(key, owned, Infinity)
      const left = owned - sumOf(given, (held) => held.qty)
      for (const claim of claims.get(key) ?? []) {
        if (claim.unbuilt && left > 0) given.push({ ...claim.list, qty: Math.min(claim.qty, left) })
      }
      return given
    },
    inUse: (key, owned) => {
      const sharing = (claim: Claim) => claim.unbuilt || (claim.upgrades !== null && unbuilt.has(claim.upgrades))
      const peak = Math.max(0, ...(claims.get(key) ?? []).filter(sharing).map((claim) => claim.qty))
      return Math.max(sum(key, owned, () => true), peak)
    },
    inOtherDecks: (list, key) =>
      // Built deck claims do not depend on the copies owned.
      unbuilt.has(listId(list)) ? 0 : sum(key, 0, (claim) => claim.deck !== null && claim.deck !== listId(list)),
    claimed: (key, owned) => sum(key, owned, () => true)
  }
}

/**
 * Copies to add to the inventory so `cards` (e.g. a new deck) are covered by owned copies no list
 * claims.
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
    .map(([key, card]) => {
      const owned = inventory.get(key)?.qty ?? 0
      return { name: card.name, qty: card.qty - Math.max(0, owned - pool.claimed(key, owned)) }
    })
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
  /**
   * Copies to buy for this list once the lists ahead have theirs; possibly 0. Fewer than `missing`
   * where copies bought for others serve this list too: an upgrade shares its deck's, an unbuilt deck
   * uses any, and every list may use an unbuilt deck's, which it does not reserve.
   */
  buy: number
}

/**
 * Copies each list still lacks, in allocation order, each against the copies the lists ahead leave.
 * @param inventory - Items by nameKey.
 * @param pool - Copy claims of `lists`, if already built.
 * @returns Every list with its needs (possibly none), and the {@link listId} of the deck it
 * upgrades, if any.
 */
export function listNeeds<L extends PoolList>(
  lists: L[],
  inventory: Map<string, InventoryItem>,
  pool: CopyPool = copyPool(lists)
): Array<{ list: L; upgrades: string | null; needs: CardNeed[] }> {
  /** Copies bought so far by nameKey, for the lists ahead. */
  const bought = new Map<string, number>()
  const freeFor = (list: L, key: string, owned: number) => Math.max(0, owned - pool.held(list, key, owned))
  return allocationOrder(lists).map((list) => {
    const needs: CardNeed[] = []
    for (const [key, total] of cardTotals(list.lines)) {
      const owned = inventory.get(key)?.qty ?? 0
      const free = freeFor(list, key, owned)
      if (total.qty <= free) continue
      const missing = total.qty - free
      const extra = bought.get(key) ?? 0
      const buy = extra > 0 ? Math.max(0, total.qty - freeFor(list, key, owned + extra)) : missing
      bought.set(key, extra + buy)
      needs.push({ key, name: total.name, wants: total.qty, missing, buy })
    }
    const target = upgradeTarget(list, lists)
    return { list, upgrades: target ? listId(target) : null, needs }
  })
}
