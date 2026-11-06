/**
 * Ordered stamps: Most Wanted cards marked as ordered, paid for but not here yet. A stamp counts as
 * covered in Most Wanted's totals and the budget planner, but the copies stay unowned until Bought.
 * A stamp covers at most the copies still to buy ({@link orderedCopies}), so copies that arrive
 * through the Inventory leave the rest of the stamp in place. Stamps are kept in `lists.json`.
 *
 * @packageDocumentation
 */

import type { MostWanted, WantedCard, WantingList } from './wanted'

/** One card's stamp. */
export interface OrderStamp {
  /** Copies ordered. */
  qty: number
  /** Local day it was stamped, `YYYY-MM-DD`. */
  date: string
}

/** Stamps by card nameKey. */
export type OrderStamps = Record<string, OrderStamp>

/** No stamps. */
export const NO_STAMPS: OrderStamps = Object.freeze({}) as OrderStamps

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** @returns The stamps in `raw` (e.g. parsed JSON); anything malformed is dropped. */
export function validStamps(raw: unknown): OrderStamps {
  const stamps: OrderStamps = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return stamps
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !value || typeof value !== 'object') continue
    const { qty, date } = value as { qty?: unknown; date?: unknown }
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) continue
    if (typeof date !== 'string' || !DAY.test(date)) continue
    stamps[key] = { qty, date }
  }
  return stamps
}

/** @returns `date`'s local day, `YYYY-MM-DD`. */
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** @returns Whole days from `day` to `today` (both `YYYY-MM-DD`); 0 if `day` is today or later. */
export function daysSince(day: string, today: string): number {
  const at = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
  return Math.max(0, Math.round((at(today) - at(day)) / 86_400_000))
}

/** @returns Copies of `card` its stamp covers: at most those still to buy. */
export function orderedCopies(card: Pick<WantedCard, 'key' | 'toBuy'>, stamps: OrderStamps): number {
  return Math.min(stamps[card.key]?.qty ?? 0, card.toBuy)
}

/** @returns Whether every copy of `card` still to buy is ordered. */
export function fullyOrdered(card: Pick<WantedCard, 'key' | 'toBuy'>, stamps: OrderStamps): boolean {
  return card.toBuy > 0 && orderedCopies(card, stamps) >= card.toBuy
}

/** @returns `stamps` with `card` stamped for `qty` copies on `day`; `qty` 0 or less removes its stamp. */
export function withStamp(stamps: OrderStamps, key: string, qty: number, day: string): OrderStamps {
  const { [key]: _, ...rest } = stamps
  return qty > 0 ? { ...rest, [key]: { qty, date: day } } : rest
}

/** @returns `stamps` without those of cards not in `wanted` (bought, or no list wants them any more). */
export function prunedStamps(stamps: OrderStamps, wanted: Iterable<string>): OrderStamps {
  const keep = new Set(wanted)
  return Object.fromEntries(Object.entries(stamps).filter(([key]) => keep.has(key)))
}

/**
 * The card as if its ordered copies were bought: fewer to buy, taken from the lists in allocation
 * order. Lists whose copies are all ordered leave, with the lists that only rode along with them
 * ({@link WantingList.buy} 0) before the first list still buying. Null if every copy is ordered.
 */
function unorderedCard(card: WantedCard, ordered: number): WantedCard | null {
  if (ordered <= 0) return card
  if (ordered >= card.toBuy) return null
  let left = ordered
  const lists: WantingList[] = []
  for (const list of card.lists) {
    const covered = Math.min(left, list.buy)
    left -= covered
    if (list.buy > 0 && covered === list.buy) continue
    if (list.buy === 0 && !lists.some((kept) => kept.buy > 0)) continue
    lists.push(covered > 0 ? { ...list, buy: list.buy - covered } : list)
  }
  return { ...card, toBuy: card.toBuy - ordered, lists }
}

/**
 * Most Wanted cards as if every ordered copy were bought, for totals and the budget planner. A list
 * stops missing a card once all of that card's copies are ordered.
 */
export function withoutOrdered<T extends Pick<MostWanted, 'cards' | 'missing'>>(wanted: T, stamps: OrderStamps): T {
  if (Object.keys(stamps).length === 0) return wanted
  const missing = { ...wanted.missing }
  const cards: WantedCard[] = []
  for (const card of wanted.cards) {
    const left = unorderedCard(card, orderedCopies(card, stamps))
    if (left) cards.push(left)
    else for (const list of card.lists) if (list.id in missing) missing[list.id] = Math.max(0, missing[list.id] - 1)
  }
  return { ...wanted, cards, missing }
}
