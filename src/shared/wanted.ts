/**
 * Most Wanted: cards lists still miss, merged across lists, with purchase metrics and a budget
 * planner. Shared copies: wishlists only; one copy counts for every list, so a card's purchase
 * quantity is the largest list shortfall. Separate copies: decks too; each list needs its own, so
 * it is the sum of the list shortfalls, filled in allocation order. Prices are passed in, keeping
 * this module pure.
 *
 * @packageDocumentation
 */

import { compareCards, isBasicLand, isCardSort } from './cards'
import { listId, listNeeds, listWeight, type CopiesMode, type CopyPool, type ListKey, type PoolList } from './copies'
import { sumOf } from './totals'
import type { CardInfo, InventoryItem } from './types'

/** A list still needing a card. */
export interface WantingList extends ListKey {
  /** {@link listId}. */
  id: string
  /** Copies of the card across the list's lines. */
  wants: number
  /** Copies of the card the list lacks. */
  missing: number
  /** Most Wanted weight: priority weight; decks as high priority. */
  weight: number
}

/** A card still missing from at least one list. */
export interface WantedCard {
  /** nameKey. */
  key: string
  name: string
  /** Basic land; listed apart from other cards. */
  basic: boolean
  owned: number
  /** Copies to buy so every list is covered: largest list shortfall (shared) or their sum (separate). */
  toBuy: number
  /** Lists still needing it, in allocation order. */
  lists: WantingList[]
  /** Sum of the lists' weights. */
  weight: number
  /** Lists it is the last missing card of (basic lands aside). */
  completes: WantingList[]
  /** Completion impact: Σ list weight ÷ cards that list still misses (basic lands aside). */
  impact: number
}

/** Most Wanted cards of all lists. */
export interface MostWanted {
  mode: CopiesMode
  /** Nonbasic cards. */
  cards: WantedCard[]
  /** Basic lands. */
  basics: WantedCard[]
  /** Missing nonbasic cards per {@link listId}. */
  missing: Record<string, number>
}

/** Unit price: number, null if unpriced, undefined while loading. */
export type UnitPrice = number | null | undefined

/**
 * Collects the cards lists still miss ({@link listNeeds}): wishlists, and with separate copies decks
 * too (allocated first, so their gaps absorb purchases before wishlists).
 * @param pool - Copy claims of `lists` in `mode`, if already built.
 */
export function mostWanted(
  lists: PoolList[],
  inventory: Map<string, InventoryItem>,
  mode: CopiesMode,
  pool?: CopyPool
): MostWanted {
  const needs = listNeeds(lists, inventory, mode, pool)
  const missing: Record<string, number> = {}
  for (const { list, needs: cards } of needs) missing[listId(list)] = cards.filter((need) => !isBasicLand(need.name)).length

  const byKey = new Map<string, WantedCard>()
  for (const { list, needs: cards } of needs) {
    const id = listId(list)
    const weight = listWeight(list)
    for (const need of cards) {
      const basic = isBasicLand(need.name)
      const card = byKey.get(need.key) ?? {
        key: need.key,
        name: need.name,
        basic,
        owned: inventory.get(need.key)?.qty ?? 0,
        toBuy: 0,
        lists: [],
        weight: 0,
        completes: [],
        impact: 0
      }
      const wanting: WantingList = { kind: list.kind, name: list.name, id, wants: need.wants, missing: need.missing, weight }
      card.lists.push(wanting)
      card.weight += weight
      card.toBuy = mode === 'shared' ? Math.max(card.toBuy, need.missing) : card.toBuy + need.missing
      if (!basic) {
        card.impact += weight / missing[id]
        if (missing[id] === 1) card.completes.push(wanting)
      }
      byKey.set(need.key, card)
    }
  }

  const all = [...byKey.values()]
  return { mode, cards: all.filter((card) => !card.basic), basics: all.filter((card) => card.basic), missing }
}

/** @returns Cost of the copies to buy; null if unpriced, undefined while loading. */
export function costOf(card: WantedCard, unit: UnitPrice): UnitPrice {
  return typeof unit === 'number' ? unit * card.toBuy : unit
}

/** @returns Best-value metric: cost per weighted list served (lower is better); null if unpriced, undefined while loading. */
export function valueOf(card: WantedCard, unit: UnitPrice): UnitPrice {
  const cost = costOf(card, unit)
  return typeof cost === 'number' ? cost / card.weight : cost
}

/** Most Wanted sort options. */
export const WANTED_SORTS = [
  {
    id: 'value',
    label: 'Best value',
    hint: 'Lowest cost per list served: decks and high-priority lists count double, low-priority lists half'
  },
  { id: 'lists', label: 'Most wanted', hint: 'Wanted by the most lists' },
  { id: 'completion', label: 'Closest to completing', hint: 'Finishes lists that are nearly done' },
  { id: 'price', label: 'Cheapest', hint: 'Lowest cost to buy' },
  { id: 'name', label: 'Name', hint: '' },
  { id: 'mana', label: 'Mana value', hint: '' },
  { id: 'color', label: 'Color', hint: '' },
  { id: 'type', label: 'Type', hint: '' },
  { id: 'rarity', label: 'Rarity', hint: '' }
] as const

/** Most Wanted sort. */
export type WantedSort = (typeof WANTED_SORTS)[number]['id']

/** Default sort. */
export const DEFAULT_WANTED_SORT: WantedSort = 'value'

/** Type guard for {@link WantedSort}. */
export function isWantedSort(value: unknown): value is WantedSort {
  return WANTED_SORTS.some((option) => option.id === value)
}

/** Ascending comparator for prices: priced first, then loading, then unpriced. */
function ascending(a: UnitPrice, b: UnitPrice): number {
  const order = (value: UnitPrice) => (typeof value === 'number' ? 0 : value === undefined ? 1 : 2)
  return order(a) - order(b) || (typeof a === 'number' && typeof b === 'number' ? a - b : 0)
}

/**
 * @param unitOf - Unit price per card.
 * @param infoOf - Card data per card, for card sorts.
 * @returns Copy of `cards` in `sort` order; ties by name.
 */
export function sortWanted(
  cards: WantedCard[],
  sort: WantedSort,
  unitOf: (card: WantedCard) => UnitPrice,
  infoOf: (card: WantedCard) => CardInfo | null | undefined
): WantedCard[] {
  const byName = (a: WantedCard, b: WantedCard) => a.name.localeCompare(b.name)
  const value = (card: WantedCard) => valueOf(card, unitOf(card))
  const compare = (a: WantedCard, b: WantedCard): number => {
    switch (sort) {
      case 'value':
        return ascending(value(a), value(b)) || b.weight - a.weight || byName(a, b)
      case 'lists':
        return b.weight - a.weight || b.lists.length - a.lists.length || ascending(value(a), value(b)) || byName(a, b)
      case 'completion':
        return b.impact - a.impact || ascending(value(a), value(b)) || byName(a, b)
      case 'price':
        return ascending(costOf(a, unitOf(a)), costOf(b, unitOf(b))) || byName(a, b)
      default:
        return isCardSort(sort) ? compareCards(sort, { name: a.name, info: infoOf(a) }, { name: b.name, info: infoOf(b) }) : byName(a, b)
    }
  }
  return [...cards].sort(compare)
}

/** A card chosen by {@link planPurchases}. */
export interface PlannedCard {
  card: WantedCard
  /** Copies to buy. */
  copies: number
  /** Lists these copies cover. */
  lists: WantingList[]
  cost: number
}

/** Budget plan. */
export interface PurchasePlan {
  /** Cards in the order first chosen. */
  items: PlannedCard[]
  total: number
  /** Lists the plan completes (basic lands aside). */
  completes: WantingList[]
  /** Cards left out for lack of a price, or still loading. */
  unpriced: number
}

/** Purchase step of one card: copies and the lists they cover. */
interface Step {
  copies: number
  lists: WantingList[]
}

/**
 * Greedy budget plan: repeatedly buys the affordable step with the most benefit per euro, where
 * benefit is Σ list weight × (1 + 1 ÷ cards that list still misses). Each purchase brings its lists
 * closer to completion, raising the benefit of their remaining cards. Shared copies: one step per
 * card, covering every list. Separate copies: one step per wanting list, taken in allocation order,
 * since bought copies go to the lists ahead first.
 * @param cards - Nonbasic Most Wanted cards.
 * @param wanted - Mode and missing cards per list ({@link MostWanted}).
 */
export function planPurchases(
  cards: WantedCard[],
  unitOf: (card: WantedCard) => UnitPrice,
  budget: number,
  { mode, missing }: Pick<MostWanted, 'mode' | 'missing'>
): PurchasePlan {
  const remaining = { ...missing }
  const queues = cards
    .map((card) => ({
      card,
      unit: unitOf(card),
      steps: (mode === 'shared'
        ? [{ copies: card.toBuy, lists: card.lists }]
        : card.lists.map((list) => ({ copies: list.missing, lists: [list] }))) as Step[]
    }))
    .filter((queue): queue is { card: WantedCard; unit: number; steps: Step[] } => typeof queue.unit === 'number')
  const items = new Map<string, PlannedCard>()
  const served = new Map<string, WantingList>()
  let total = 0
  for (;;) {
    const left = budget - total
    let best: (typeof queues)[number] | null = null
    let bestScore = -1
    for (const queue of queues) {
      const step = queue.steps[0]
      if (!step) continue
      const cost = queue.unit * step.copies
      if (cost > left + 1e-9) continue
      const benefit = sumOf(step.lists, (list) => list.weight * (1 + 1 / Math.max(1, remaining[list.id] ?? 1)))
      const score = benefit / Math.max(cost, 0.01)
      if (score > bestScore) {
        best = queue
        bestScore = score
      }
    }
    if (!best) break
    const step = best.steps.shift()!
    const cost = best.unit * step.copies
    const item = items.get(best.card.key)
    if (item) {
      item.copies += step.copies
      item.lists.push(...step.lists)
      item.cost += cost
    } else {
      items.set(best.card.key, { card: best.card, copies: step.copies, lists: [...step.lists], cost })
    }
    total += cost
    for (const list of step.lists) {
      remaining[list.id] = (remaining[list.id] ?? 1) - 1
      served.set(list.id, list)
    }
  }
  const completes = Object.keys(missing)
    .filter((id) => served.has(id) && missing[id] > 0 && remaining[id] <= 0)
    .map((id) => served.get(id)!)
  return { items: [...items.values()], total, completes, unpriced: cards.length - queues.length }
}
