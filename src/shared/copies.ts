/**
 * How owned copies count toward lists. Built decks hold acquired cards: each copy belongs to one
 * deck, handed out by deck name. Everything else only plans and reserves nothing: an unbuilt deck
 * (see {@link isUnbuilt}) uses every owned copy, and a wishlist uses every copy the built decks do
 * not hold, without competing with other wishlists. An upgrade (see {@link upgradeTarget}) follows
 * its deck: it also uses the copies a built deck holds, or every copy for an unbuilt deck.
 *
 * With {@link PoolOptions.wishlistsReserve}, wishlists reserve copies too, after every built deck,
 * from the top of the wishlist order down; an upgrade reserves only what it needs beyond its deck.
 *
 * @packageDocumentation
 */

import { nameKey } from './decklist'
import { unionCardLines } from './listVersion'
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

/** Most Wanted weight of the top wishlist, and of every deck. */
export const TOP_WEIGHT = 2
/** Most Wanted weight of the bottom wishlist. */
export const BOTTOM_WEIGHT = 0.5

/**
 * Most Wanted weights: decks count as the top wishlist; wishlists by their place in `lists` (the
 * order you give them), spread evenly from {@link TOP_WEIGHT} to {@link BOTTOM_WEIGHT}.
 * @returns Weight by {@link listId}.
 */
export function listWeights(lists: ListKey[]): Map<string, number> {
  const wishlists = lists.filter((list) => list.kind === 'wishlist')
  const step = wishlists.length > 1 ? (TOP_WEIGHT - BOTTOM_WEIGHT) / (wishlists.length - 1) : 0
  const weights = new Map(wishlists.map((list, i) => [listId(list), TOP_WEIGHT - step * i]))
  for (const list of lists) if (list.kind === 'deck') weights.set(listId(list), TOP_WEIGHT)
  return weights
}

/** @returns Copies per card across a list's lines, by nameKey, named after the first line. */
export function cardTotals(lines: ListLine[]): Map<string, { name: string; qty: number }> {
  const totals = new Map<string, { name: string; qty: number }>()
  for (const line of unionCardLines(lines)) {
    const key = nameKey(line.name)
    const total = totals.get(key)
    if (total) total.qty += line.qty
    else totals.set(key, { name: line.name, qty: line.qty })
  }
  return totals
}

/** @returns Copy of `lists` in allocation order: decks by name, then wishlists in their order in `lists`. */
export function allocationOrder<L extends PoolList>(lists: L[]): L[] {
  const decks = lists.filter((list) => list.kind === 'deck').sort((a, b) => a.name.localeCompare(b.name))
  return [...decks, ...lists.filter((list) => list.kind === 'wishlist')]
}

/** Owned copies of a card that one list gets. */
export interface HeldCopies extends ListKey {
  qty: number
}

/** Copy claims of all lists, from {@link copyPool}. */
export interface CopyPool {
  /**
   * Copies of a card that other lists hold before `list`, of the `owned` copies, at most `owned`:
   * built decks ahead of a deck; all built decks for a wishlist; none for an unbuilt deck or its
   * upgrades. An upgrade of a built deck does not count the copies its deck holds, since it uses them
   * too. Unknown lists come last.
   */
  held(list: ListKey, key: string, owned: number): number
  /**
   * Built decks holding the copies {@link held} counts, with the copies each holds, in allocation
   * order; none for an unbuilt deck or its upgrades. An upgrade's deck is left out, as in {@link held}.
   */
  holders(list: ListKey, key: string, owned: number): HeldCopies[]
  /**
   * Lists using some of the `owned` copies of a card, with the copies each uses: built decks, in
   * allocation order; then the unbuilt decks and wishlists using the copies built decks leave.
   */
  usedBy(key: string, owned: number): HeldCopies[]
  /**
   * Copies of a card the lists keep, of the `owned` copies or not: what built decks hold, plus the
   * most any wishlist wants beyond its deck's copies; or the most an unbuilt deck or one of its
   * upgrades wants, if more. Kept copies are never offered in trades.
   */
  inUse(key: string, owned: number): number
  /** Copies of a card in built decks other than `list`; none for an unbuilt deck, which may use any. */
  inOtherDecks(list: ListKey, key: string): number
  /** Copies of a card the built decks hold together; unbuilt decks reserve none, nor do wishlists for this. */
  claimed(key: string, owned: number): number
}

/** How a {@link copyPool} hands copies out. */
export interface PoolOptions {
  /** Wishlists reserve the copies they use, after built decks, in their order (the setting). */
  wishlistsReserve?: boolean
}

/** A list's claim on a card's copies. */
interface Claim {
  /** Position in allocation order. */
  at: number
  list: ListKey
  /** {@link listId} of a deck; null for wishlists. */
  deck: string | null
  /** A built deck's, or a wishlist's when wishlists reserve: it holds its copies. Other lists use copies without reserving them. */
  reserves: boolean
  /** An unbuilt deck's or its upgrade's: it may use every owned copy. */
  unbuilt: boolean
  /** {@link listId} of the deck an upgrade shares copies with; null for other lists. */
  upgrades: string | null
  qty: number
}

/** @returns Copy claims of `lists`; recompute when lists or options change. */
export function copyPool(lists: PoolList[], { wishlistsReserve = false }: PoolOptions = {}): CopyPool {
  const order = allocationOrder(lists)
  const index = new Map(order.map((list, i) => [listId(list), i]))
  /** Deck each upgrade shares copies with, by {@link listId}. */
  const decks = new Map<string, string>()
  /** Unbuilt decks and their upgrades by {@link listId}. */
  const unbuilt = new Set<string>()
  const claims = new Map<string, Claim[]>()
  order.forEach((list, at) => {
    const target = upgradeTarget(list, lists)
    if (target) decks.set(listId(list), listId(target))
    const isDeck = list.kind === 'deck'
    // Decks come first, so a deck is known to be unbuilt before its upgrades.
    if (isDeck ? isUnbuilt(list.lines) : target !== null && unbuilt.has(listId(target))) unbuilt.add(listId(list))
    for (const [key, total] of cardTotals(list.lines)) {
      const claim = {
        at,
        list: { kind: list.kind, name: list.name },
        deck: isDeck ? listId(list) : null,
        reserves: (isDeck || (wishlistsReserve && list.kind === 'wishlist')) && !unbuilt.has(listId(list)),
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
   * Claims on a card's `owned` copies, in allocation order: built decks, then, when they reserve,
   * wishlists. An upgrade claims only the copies it wants beyond its deck's.
   * @returns The claims, and the copies each reserving list holds by {@link listId}.
   */
  const allocate = (key: string, owned: number): { claims: Claim[]; got: Map<string, number> } => {
    const entries = claims.get(key) ?? []
    const got = new Map<string, number>()
    /** Copies each reserving list wants, by {@link listId}. */
    const wanted = new Map<string, number>()
    let left = owned
    const adjusted = entries.map((claim) => {
      if (!claim.reserves) return { ...claim, qty: 0 }
      const id = listId(claim.list)
      const qty = claim.upgrades ? Math.max(0, claim.qty - (wanted.get(claim.upgrades) ?? 0)) : claim.qty
      wanted.set(id, claim.qty)
      got.set(id, Math.min(qty, Math.max(0, left)))
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
      // An upgrade of a built deck uses the copies its deck holds, then what all the built decks leave.
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
        if (!claim.reserves && left > 0) given.push({ ...claim.list, qty: Math.min(claim.qty, left) })
      }
      return given
    },
    inUse: (key, owned) => {
      const { claims: entries, got } = allocate(key, owned)
      const held = sumOf(entries, (claim) => claim.qty)
      let beyond = 0
      let peak = 0
      for (const claim of claims.get(key) ?? []) {
        if (claim.unbuilt) peak = Math.max(peak, claim.qty)
        else if (!claim.reserves) beyond = Math.max(beyond, claim.qty - (claim.upgrades ? (got.get(claim.upgrades) ?? 0) : 0))
      }
      return Math.max(held + beyond, peak)
    },
    inOtherDecks: (list, key) =>
      // Built deck claims do not depend on the copies owned.
      unbuilt.has(listId(list)) ? 0 : sum(key, 0, (claim) => claim.deck !== null && claim.deck !== listId(list)),
    claimed: (key, owned) => sum(key, owned, (claim) => claim.deck !== null)
  }
}

/**
 * Copies to add to the inventory so `cards` (e.g. a new deck) are covered by owned copies no built
 * deck holds.
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
   * where copies bought for others serve this list too: only built decks reserve what is bought for
   * them, so a copy bought for a wishlist or an unbuilt deck serves every list that could use it, and
   * an upgrade shares its deck's.
   */
  buy: number
}

/**
 * Copies each list still lacks, in allocation order, each against the copies other lists hold ({@link CopyPool.held}).
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
