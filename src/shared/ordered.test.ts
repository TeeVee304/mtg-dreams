import { describe, expect, it } from 'vitest'
import { parseList } from './decklist'
import {
  daysSince,
  dayOf,
  fullyOrdered,
  orderedCopies,
  prunedStamps,
  validStamps,
  withoutOrdered,
  withStamp,
  type OrderStamps
} from './ordered'
import { mostWanted, planPurchases, type WantedCard } from './wanted'

const list = (name: string, text: string) => ({ kind: 'wishlist' as const, name, lines: parseList(text) })
const deck = (name: string, text: string) => ({ kind: 'deck' as const, name, lines: parseList(text) })
const find = (cards: WantedCard[], name: string) => cards.find((card) => card.name === name)

const wanted = mostWanted(
  [
    deck('Burn', '2 Sol Ring\n1 Lightning Bolt'),
    list('Angels', '1 Sol Ring\n1 Smothering Tithe'),
    list('Someday', '1 Smothering Tithe\n1 Mana Crypt')
  ],
  new Map()
)

describe('validStamps', () => {
  it('keeps whole positive quantities with a day, and drops the rest', () => {
    const raw = {
      'sol ring': { qty: 2, date: '2026-11-06' },
      zero: { qty: 0, date: '2026-11-06' },
      half: { qty: 1.5, date: '2026-11-06' },
      noDate: { qty: 1 },
      badDate: { qty: 1, date: '6 Nov' },
      text: 'nope'
    }
    expect(validStamps(raw)).toEqual({ 'sol ring': { qty: 2, date: '2026-11-06' } })
    expect(validStamps(null)).toEqual({})
    expect(validStamps([1, 2])).toEqual({})
  })
})

describe('days', () => {
  it('writes a local day and counts whole days since', () => {
    expect(dayOf(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06')
    expect(daysSince('2026-10-28', '2026-11-06')).toBe(9)
    expect(daysSince('2026-11-06', '2026-11-06')).toBe(0)
    expect(daysSince('2026-11-07', '2026-11-06')).toBe(0)
  })
})

describe('stamps', () => {
  it('cover at most the copies still to buy', () => {
    const sol = find(wanted.cards, 'Sol Ring')!
    expect(sol.toBuy).toBe(3)
    expect(orderedCopies(sol, { [sol.key]: { qty: 2, date: '2026-11-06' } })).toBe(2)
    expect(orderedCopies(sol, { [sol.key]: { qty: 5, date: '2026-11-06' } })).toBe(3)
    expect(fullyOrdered(sol, { [sol.key]: { qty: 2, date: '2026-11-06' } })).toBe(false)
    expect(fullyOrdered(sol, { [sol.key]: { qty: 3, date: '2026-11-06' } })).toBe(true)
  })

  it('are set, replaced and removed', () => {
    let stamps: OrderStamps = withStamp({}, 'sol ring', 2, '2026-11-01')
    stamps = withStamp(stamps, 'sol ring', 3, '2026-11-06')
    expect(stamps).toEqual({ 'sol ring': { qty: 3, date: '2026-11-06' } })
    expect(withStamp(stamps, 'sol ring', 0, '2026-11-06')).toEqual({})
  })

  it('of cards no longer wanted are pruned', () => {
    const stamps = { a: { qty: 1, date: '2026-11-01' }, b: { qty: 1, date: '2026-11-01' } }
    expect(prunedStamps(stamps, ['b', 'c'])).toEqual({ b: { qty: 1, date: '2026-11-01' } })
  })
})

describe('withoutOrdered', () => {
  it('changes nothing without stamps', () => {
    expect(withoutOrdered(wanted, {})).toBe(wanted)
  })

  it('drops fully ordered cards, and lists stop missing them', () => {
    const tithe = find(wanted.cards, 'Smothering Tithe')!
    const left = withoutOrdered(wanted, { [tithe.key]: { qty: 1, date: '2026-11-06' } })
    expect(find(left.cards, 'Smothering Tithe')).toBeUndefined()
    expect(left.missing['wishlist/Angels']).toBe(wanted.missing['wishlist/Angels'] - 1)
    expect(left.missing['wishlist/Someday']).toBe(wanted.missing['wishlist/Someday'] - 1)
  })

  it('takes partly ordered copies from the lists in allocation order', () => {
    const sol = find(wanted.cards, 'Sol Ring')!
    expect(sol.lists.map((l) => [l.name, l.buy])).toEqual([['Burn', 2], ['Angels', 1]])
    const left = find(withoutOrdered(wanted, { [sol.key]: { qty: 2, date: '2026-11-06' } }).cards, 'Sol Ring')!
    expect(left.toBuy).toBe(1)
    expect(left.lists.map((l) => [l.name, l.buy])).toEqual([['Angels', 1]])
    expect(left.lists[0].name).toBe('Angels')
  })

  it('keeps the budget planner from buying ordered copies', () => {
    const sol = find(wanted.cards, 'Sol Ring')!
    const left = withoutOrdered(wanted, { [sol.key]: { qty: 2, date: '2026-11-06' } })
    const plan = planPurchases(left.cards, () => 1, 100, left)
    expect(plan.items.find((item) => item.card.name === 'Sol Ring')?.copies).toBe(1)
  })
})
