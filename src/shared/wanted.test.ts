import { describe, expect, it } from 'vitest'
import { parseInventory, parseList } from './decklist'
import { costOf, mostWanted, planPurchases, sortWanted, valueOf, type WantedCard } from './wanted'

const list = (name: string, text: string, priority?: 'High' | 'Low') => ({
  kind: 'wishlist' as const,
  name,
  lines: parseList(`${priority ? `// Priority: ${priority}\n` : ''}${text}`)
})
const deck = (name: string, text: string) => ({ kind: 'deck' as const, name, lines: parseList(text) })
const find = (cards: WantedCard[], name: string) => cards.find((card) => card.name === name)!
const names = (lists: Array<{ name: string }>) => lists.map((l) => l.name)

const lists = [
  list('Goblins', '2 Sol Ring\n1 Goblin Bombardment\n10 Mountain'),
  list('Angels', '1 Sol Ring\n1 Smothering Tithe', 'High'),
  list('Someday', '1 Sol Ring\n1 Smothering Tithe\n1 Mana Crypt', 'Low')
]

describe('mostWanted with shared copies', () => {
  it('buys the largest missing quantity once, counting only lists that still need the card', () => {
    const { cards } = mostWanted(lists, parseInventory('1 Sol Ring\n'), 'shared')
    const sol = find(cards, 'Sol Ring')
    expect(sol).toMatchObject({ owned: 1, toBuy: 1, weight: 1 })
    expect(names(sol.lists)).toEqual(['Goblins'])
    const tithe = find(cards, 'Smothering Tithe')
    expect(tithe.lists.map((l) => [l.name, l.weight])).toEqual([['Angels', 2], ['Someday', 0.5]])
    expect(tithe.weight).toBe(2.5)
  })

  it('lists basic lands apart and leaves them out of completion', () => {
    const result = mostWanted(lists, parseInventory('1 Sol Ring\n'), 'shared')
    expect(result.basics.map((c) => [c.name, c.toBuy])).toEqual([['Mountain', 10]])
    expect(result.missing).toEqual({ 'wishlist/Goblins': 2, 'wishlist/Angels': 1, 'wishlist/Someday': 2 })
    expect(names(find(result.cards, 'Smothering Tithe').completes)).toEqual(['Angels'])
    expect(find(result.cards, 'Smothering Tithe').impact).toBe(2 / 1 + 0.5 / 2)
  })

  it('ignores decks', () => {
    const { cards } = mostWanted([...lists, deck('Burn', '1 Lightning Bolt')], new Map(), 'shared')
    expect(cards.some((card) => card.name === 'Lightning Bolt')).toBe(false)
  })
})

describe('mostWanted with separate copies', () => {
  it('buys a copy for every list, handing owned copies out by priority', () => {
    const sol = find(mostWanted(lists, parseInventory('1 Sol Ring\n'), 'separate').cards, 'Sol Ring')
    expect(sol.toBuy).toBe(3)
    expect(sol.lists.map((l) => [l.name, l.wants, l.missing])).toEqual([['Goblins', 2, 2], ['Someday', 1, 1]])
  })

  it('lets decks take owned copies first, and counts their gaps', () => {
    const result = mostWanted([...lists, deck('Burn', '1 Sol Ring\n1 Mana Crypt')], parseInventory('1 Sol Ring\n'), 'separate')
    const sol = find(result.cards, 'Sol Ring')
    expect(sol.toBuy).toBe(4)
    expect(names(sol.lists)).toEqual(['Angels', 'Goblins', 'Someday'])
    const crypt = find(result.cards, 'Mana Crypt')
    expect(crypt.lists.map((l) => [l.kind, l.name, l.weight])).toEqual([['deck', 'Burn', 2], ['wishlist', 'Someday', 0.5]])
    expect(result.missing['deck/Burn']).toBe(1)
  })
})

describe('ranking and planning', () => {
  const abc = [
    list('A', '1 Cheap Staple\n1 Pricey Bomb\n1 Last Piece'),
    list('B', '1 Cheap Staple\n1 Pricey Bomb'),
    list('C', '1 Cheap Staple\n1 Lonely Card\n1 Other Card')
  ]
  const wanted = mostWanted(abc, new Map(), 'shared')
  const { cards } = wanted
  const prices: Record<string, number | null | undefined> = {
    'Cheap Staple': 1,
    'Pricey Bomb': 40,
    'Last Piece': 3,
    'Lonely Card': 2,
    'Other Card': null,
    Bolt: 1,
    Opt: 5
  }
  const unitOf = (card: WantedCard) => prices[card.name]

  it('measures value as cost per weighted list', () => {
    expect(costOf(find(cards, 'Pricey Bomb'), 40)).toBe(40)
    expect(valueOf(find(cards, 'Pricey Bomb'), 40)).toBe(20)
    expect(valueOf(find(cards, 'Other Card'), null)).toBeNull()
  })

  it('sorts by best value, most wanted and completion, unpriced last', () => {
    const order = (sort: Parameters<typeof sortWanted>[1]) => sortWanted(cards, sort, unitOf, () => null).map((c) => c.name)
    expect(order('value')).toEqual(['Cheap Staple', 'Lonely Card', 'Last Piece', 'Pricey Bomb', 'Other Card'])
    expect(order('lists')[0]).toBe('Cheap Staple')
    expect(order('completion').slice(0, 2)).toEqual(['Cheap Staple', 'Pricey Bomb'])
  })

  it('plans the best purchases within a budget and reports completed lists', () => {
    const plan = planPurchases(cards, unitOf, 10, wanted)
    expect(plan.items.map((item) => item.card.name)).toEqual(['Cheap Staple', 'Lonely Card', 'Last Piece'])
    expect(plan.total).toBe(6)
    expect(plan.unpriced).toBe(1)
    expect(plan.completes).toEqual([])
    expect(names(planPurchases(cards, unitOf, 100, wanted).completes)).toEqual(['A', 'B'])
  })

  it('buys copies list by list with separate copies, in allocation order', () => {
    const xy = [list('X', '1 Bolt', 'High'), list('Y', '1 Bolt\n1 Opt')]
    const separate = mostWanted(xy, new Map(), 'separate')
    const two = planPurchases(separate.cards, unitOf, 2, separate)
    expect(two.items.map((item) => [item.card.name, item.copies, names(item.lists), item.cost])).toEqual([['Bolt', 2, ['X', 'Y'], 2]])
    expect(names(two.completes)).toEqual(['X'])
    const one = planPurchases(separate.cards, unitOf, 1, separate)
    expect(one.items.map((item) => [item.card.name, item.copies, names(item.lists)])).toEqual([['Bolt', 1, ['X']]])

    const shared = mostWanted(xy, new Map(), 'shared')
    expect(planPurchases(shared.cards, unitOf, 1, shared).items.map((item) => [item.copies, names(item.lists)])).toEqual([[1, ['X', 'Y']]])
  })
})
