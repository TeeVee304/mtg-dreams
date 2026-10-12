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

describe('mostWanted', () => {
  it('counts only lists that still need a card, weighted by priority', () => {
    const { cards } = mostWanted(lists, parseInventory('1 Sol Ring\n'))
    const tithe = find(cards, 'Smothering Tithe')
    expect(tithe.lists.map((l) => [l.name, l.weight])).toEqual([['Angels', 2], ['Someday', 0.5]])
    expect(tithe.weight).toBe(2.5)
  })

  it('lists basic lands apart and leaves them out of completion', () => {
    const result = mostWanted(lists, parseInventory('1 Sol Ring\n'))
    expect(result.basics.map((c) => [c.name, c.toBuy])).toEqual([['Mountain', 10]])
    expect(result.missing).toEqual({ 'wishlist/Angels': 1, 'wishlist/Goblins': 2, 'wishlist/Someday': 2 })
    expect(names(find(result.cards, 'Smothering Tithe').completes)).toEqual(['Angels'])
    expect(find(result.cards, 'Smothering Tithe').impact).toBe(2 / 1 + 0.5 / 2)
  })

  it('buys the most any wishlist lacks, since wishlists share owned and bought copies', () => {
    const sol = find(mostWanted(lists, parseInventory('1 Sol Ring\n')).cards, 'Sol Ring')
    expect(sol.toBuy).toBe(1)
    expect(sol.lists.map((l) => [l.name, l.wants, l.missing])).toEqual([['Goblins', 2, 1]])
    const tithe = find(mostWanted(lists, new Map()).cards, 'Smothering Tithe')
    expect(tithe.lists.map((l) => [l.name, l.missing, l.buy])).toEqual([['Angels', 1, 1], ['Someday', 1, 0]])
  })

  it('lets decks hold owned copies, and counts their gaps apart from the wishlists', () => {
    const result = mostWanted([...lists, deck('Burn', '1 Sol Ring\n1 Mana Crypt')], parseInventory('1 Sol Ring\n'))
    const sol = find(result.cards, 'Sol Ring')
    expect(sol.toBuy).toBe(2)
    expect(names(sol.lists)).toEqual(['Angels', 'Goblins', 'Someday'])
    const crypt = find(result.cards, 'Mana Crypt')
    expect(crypt.lists.map((l) => [l.kind, l.name, l.weight])).toEqual([['deck', 'Burn', 2], ['wishlist', 'Someday', 0.5]])
    expect(crypt.toBuy).toBe(2)
    expect(result.missing['deck/Burn']).toBe(1)
  })
})

describe('ranking and planning', () => {
  const abc = [
    list('A', '1 Cheap Staple\n1 Pricey Bomb\n1 Last Piece'),
    list('B', '1 Cheap Staple\n1 Pricey Bomb'),
    list('C', '1 Cheap Staple\n1 Lonely Card\n1 Other Card')
  ]
  const wanted = mostWanted(abc, new Map())
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
    expect(plan.items.map((item) => [item.card.name, item.copies, names(item.lists)])).toEqual([
      ['Cheap Staple', 1, ['A', 'B', 'C']],
      ['Lonely Card', 1, ['C']],
      ['Last Piece', 1, ['A']]
    ])
    expect(plan.total).toBe(6)
    expect(plan.unpriced).toBe(1)
    expect(plan.completes).toEqual([])
    expect(names(planPurchases(cards, unitOf, 100, wanted).completes)).toEqual(['A', 'B'])
  })

  it('buys copies deck by deck, and once for all wishlists', () => {
    const xy = [list('X', '1 Bolt', 'High'), list('Y', '1 Bolt\n1 Opt')]
    const wishlists = mostWanted(xy, new Map())
    const one = planPurchases(wishlists.cards, unitOf, 1, wishlists)
    expect(one.items.map((item) => [item.card.name, item.copies, names(item.lists), item.cost])).toEqual([['Bolt', 1, ['X', 'Y'], 1]])
    expect(names(one.completes)).toEqual(['X'])
    const decks = mostWanted([deck('X', '1 Bolt'), deck('Y', '1 Bolt')], new Map())
    expect(planPurchases(decks.cards, unitOf, 1, decks).items.map((item) => [item.copies, names(item.lists)])).toEqual([[1, ['X']]])
  })
})

describe('mostWanted with upgrades', () => {
  const upgradeLists = [
    deck('Elves', '1 Sol Ring\n1 Llanowar Elves'),
    list('Elves Big', '// Upgrade of: Elves\n1 Sol Ring\n2 Llanowar Elves'),
    list('Elves Alt', '// Upgrade of: Elves\n1 Sol Ring'),
    list('Other', '1 Sol Ring')
  ]

  it('counts a card missing from a deck and its upgrades once', () => {
    const { cards } = mostWanted(upgradeLists, new Map())
    const sol = find(cards, 'Sol Ring')
    expect(sol.toBuy).toBe(2)
    expect(sol.lists.map((l) => [l.name, l.missing, l.buy])).toEqual([
      ['Elves', 1, 1],
      ['Elves Alt', 1, 0],
      ['Elves Big', 1, 0],
      ['Other', 1, 1]
    ])
    expect(find(cards, 'Llanowar Elves').toBuy).toBe(2)
  })

  it('plans the deck copies for its upgrades too', () => {
    const { cards, ...wanted } = mostWanted(upgradeLists, new Map())
    const sol = find(cards, 'Sol Ring')
    const plan = planPurchases([sol], () => 1, 1, wanted)
    expect(plan.items.map((item) => [item.copies, names(item.lists)])).toEqual([[1, ['Elves', 'Elves Alt', 'Elves Big']]])
    expect(names(plan.completes)).toEqual(['Elves Alt'])
  })
})

describe('mostWanted with unbuilt decks', () => {
  it('lets every list use the copies bought for an unbuilt deck', () => {
    const wanted = mostWanted([deck('Elves', '// Unbuilt: Yes\n1 Sol Ring'), list('Other', '1 Sol Ring')], new Map())
    const sol = find(wanted.cards, 'Sol Ring')
    expect(sol.toBuy).toBe(1)
    const plan = planPurchases(wanted.cards, () => 1, 1, wanted)
    expect(plan.items.map((item) => [item.copies, names(item.lists)])).toEqual([[1, ['Elves', 'Other']]])
    expect(names(plan.completes)).toEqual(['Elves', 'Other'])
  })
})
