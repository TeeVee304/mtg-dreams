import { describe, expect, it } from 'vitest'
import { allocationOrder, copiesToAdd, copyPool, listNeeds, listWeights, unownedCards } from './copies'
import { parseInventory, parseList } from './decklist'

// Wishlists in your order: Goblins, Angels, Someday.
const lists = [
  { kind: 'wishlist' as const, name: 'Goblins', lines: parseList('1 Sol Ring') },
  { kind: 'deck' as const, name: 'Zombies', lines: parseList('1 Sol Ring') },
  { kind: 'wishlist' as const, name: 'Angels', lines: parseList('1 Sol Ring\n1 Smothering Tithe') },
  { kind: 'deck' as const, name: 'Burn', lines: parseList('1 Sol Ring\n1 Lightning Bolt') },
  { kind: 'wishlist' as const, name: 'Someday', lines: parseList('2 Sol Ring') }
]

describe('allocationOrder', () => {
  it('puts decks first by name, then wishlists in your order', () => {
    expect(allocationOrder(lists).map((list) => list.name)).toEqual(['Burn', 'Zombies', 'Goblins', 'Angels', 'Someday'])
  })
})

describe('copyPool', () => {
  it('counts the copies built decks hold, which wishlists do not compete for', () => {
    const pool = copyPool(lists)
    expect(['Burn', 'Zombies', 'Goblins', 'Angels', 'Someday'].map((name) => pool.held(lists.find((l) => l.name === name)!, 'sol ring', 9))).toEqual([0, 1, 2, 2, 2])
    expect(pool.held({ kind: 'deck', name: 'New' }, 'sol ring', 9)).toBe(2)
    expect(pool.held({ kind: 'deck', name: 'New' }, 'sol ring', 2)).toBe(2)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'Burn' }, 'sol ring')).toBe(1)
    expect(pool.inOtherDecks({ kind: 'wishlist', name: 'Angels' }, 'sol ring')).toBe(2)
    expect(pool.claimed('sol ring', 9)).toBe(2)
  })

  it('says which decks hold the owned copies', () => {
    const pool = copyPool(lists)
    const angels = { kind: 'wishlist' as const, name: 'Angels' }
    expect(pool.holders(angels, 'sol ring', 2)).toEqual([
      { kind: 'deck', name: 'Burn', qty: 1 },
      { kind: 'deck', name: 'Zombies', qty: 1 }
    ])
    expect(pool.holders(angels, 'sol ring', 9)).toHaveLength(2)
    expect(pool.holders(angels, 'sol ring', 0)).toEqual([])
  })

  it('says which lists use the owned copies, and how many the lists keep', () => {
    const pool = copyPool(lists)
    expect(pool.usedBy('sol ring', 3).map((held) => `${held.qty} ${held.name}`)).toEqual(['1 Burn', '1 Zombies', '1 Goblins', '1 Angels', '1 Someday'])
    // The decks' two, plus the most any wishlist wants.
    expect(pool.inUse('sol ring', 3)).toBe(4)
    expect(pool.inUse('black lotus', 0)).toBe(0)
  })
})

describe('listWeights', () => {
  it('weighs wishlists by their place in your order, decks as the top one', () => {
    expect(Object.fromEntries(listWeights(lists))).toEqual({
      'wishlist/Goblins': 2,
      'wishlist/Angels': 1.25,
      'wishlist/Someday': 0.5,
      'deck/Zombies': 2,
      'deck/Burn': 2
    })
    expect(listWeights([{ kind: 'wishlist', name: 'Only' }]).get('wishlist/Only')).toBe(2)
  })
})

describe('copiesToAdd', () => {
  const cards = [
    { name: 'Sol Ring', qty: 1 },
    { name: 'Lightning Bolt', qty: 2 },
    { name: 'sol ring', qty: 1 }
  ]
  const inventory = parseInventory('7 Sol Ring\n1 Lightning Bolt')

  it('adds copies beyond the owned copies no built deck holds', () => {
    expect(copiesToAdd(cards, inventory, copyPool(lists))).toEqual([{ name: 'Lightning Bolt', qty: 2 }])
  })

  it('adds the copies with the printing, finish and language their lines name, in line order', () => {
    const lines = [
      { name: 'Counterspell', qty: 2, lang: 'es' as const, foil: false },
      { name: 'Counterspell', qty: 1, set: 'mh2', collector: '267', foil: true },
      { name: 'counterspell', qty: 1, lang: 'es' as const, foil: false }
    ]
    expect(copiesToAdd(lines, new Map(), copyPool([]))).toEqual([
      { name: 'Counterspell', qty: 3, lang: 'es' },
      { name: 'Counterspell', qty: 1, set: 'mh2', collector: '267', foil: true }
    ])
    // One owned copy no deck holds: three are missing, taken from the lines in order.
    const owned = parseInventory('1 Counterspell')
    expect(copiesToAdd(lines, owned, copyPool([]))).toEqual([
      { name: 'Counterspell', qty: 2, lang: 'es' },
      { name: 'Counterspell', qty: 1, set: 'mh2', collector: '267', foil: true }
    ])
  })
})

describe('unownedCards', () => {
  it('lists the copies missing beyond the free ones, in list order, the maybeboard aside', () => {
    const lines = parseList('2 Lightning Bolt\n1 Sol Ring\n1 Lightning Bolt\n3 Island\n\nMaybeboard\n1 Mana Crypt')
    const free: Record<string, number> = { 'lightning bolt': 1, 'sol ring': 1 }
    expect(unownedCards(lines, (key) => free[key] ?? 0)).toEqual([
      { name: 'Lightning Bolt', qty: 2 },
      { name: 'Island', qty: 3 }
    ])
  })
})

describe('listNeeds', () => {
  it('leaves maybeboard Cards out: they are only considered', () => {
    const wishlist = { kind: 'wishlist' as const, name: 'Elves', lines: parseList('1 Llanowar Elves\n\nMaybeboard\n1 Mana Crypt') }
    expect(listNeeds([wishlist], parseInventory('')).flatMap(({ needs }) => needs.map((need) => need.name))).toEqual(['Llanowar Elves'])
  })

  it('hands owned copies out to decks, and lets each wishlist use what they leave', () => {
    expect(
      listNeeds(lists, parseInventory('3 Sol Ring')).map(({ list, needs: cards }) => [list.name, cards.map((c) => `${c.missing}/${c.wants} ${c.name}`)])
    ).toEqual([
      ['Burn', ['1/1 Lightning Bolt']],
      ['Zombies', []],
      ['Goblins', []],
      ['Angels', ['1/1 Smothering Tithe']],
      ['Someday', ['1/2 Sol Ring']]
    ])
  })
})

describe('wishlists reserving copies (the setting)', () => {
  const reserving = { wishlistsReserve: true }
  const name = (list: { name: string }) => list.name
  const needs = (inventory: string) =>
    listNeeds(lists, parseInventory(inventory), copyPool(lists, reserving)).map(({ list, needs: cards }) => [
      list.name,
      cards.map((c) => `${c.missing}/${c.wants} ${c.name} (buy ${c.buy})`)
    ])

  it('hand copies to built decks, then to wishlists from the top of the order down', () => {
    const pool = copyPool(lists, reserving)
    const order = allocationOrder(lists)
    expect(order.map((list) => [name(list), pool.held(list, 'sol ring', 3)])).toEqual([
      ['Burn', 0],
      ['Zombies', 1],
      ['Goblins', 2],
      ['Angels', 3],
      ['Someday', 3]
    ])
    expect(pool.usedBy('sol ring', 3)).toEqual([
      { kind: 'deck', name: 'Burn', qty: 1 },
      { kind: 'deck', name: 'Zombies', qty: 1 },
      { kind: 'wishlist', name: 'Goblins', qty: 1 }
    ])
    // New decks still count only what built decks hold.
    expect(pool.claimed('sol ring', 3)).toBe(2)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'Burn' }, 'sol ring')).toBe(1)
  })

  it('keep what every wishlist wants out of trades', () => {
    expect(copyPool(lists).inUse('sol ring', 9)).toBe(4)
    expect(copyPool(lists, reserving).inUse('sol ring', 9)).toBe(6)
  })

  it('make each wishlist buy its own copies', () => {
    expect(needs('3 Sol Ring')).toEqual([
      ['Burn', ['1/1 Lightning Bolt (buy 1)']],
      ['Zombies', []],
      ['Goblins', []],
      ['Angels', ['1/1 Sol Ring (buy 1)', '1/1 Smothering Tithe (buy 1)']],
      ['Someday', ['2/2 Sol Ring (buy 2)']]
    ])
  })

  it('let an upgrade use its deck\'s copies and reserve only what it needs beyond them', () => {
    const upgraded = [
      { kind: 'deck' as const, name: 'Burn', lines: parseList('1 Sol Ring\n1 Lightning Bolt') },
      { kind: 'wishlist' as const, name: 'Burn Plus', lines: parseList('// Upgrade of: Burn\n2 Sol Ring\n1 Lightning Bolt') },
      { kind: 'wishlist' as const, name: 'Goblins', lines: parseList('1 Sol Ring\n1 Lightning Bolt') }
    ]
    const pool = copyPool(upgraded, reserving)
    expect(pool.held(upgraded[1], 'sol ring', 2)).toBe(0)
    expect(pool.held(upgraded[2], 'sol ring', 2)).toBe(2)
    // The upgrade wants no Lightning Bolt beyond its deck's, so Goblins gets the second one.
    expect(pool.held(upgraded[2], 'lightning bolt', 2)).toBe(1)
  })
})

describe('upgrades', () => {
  const upgrades = [
    { kind: 'deck' as const, name: 'Elves', lines: parseList('1 Sol Ring\n1 Llanowar Elves') },
    { kind: 'wishlist' as const, name: 'Elves Alt', lines: parseList('// Upgrade of: Elves\n1 Sol Ring') },
    { kind: 'wishlist' as const, name: 'Elves Big', lines: parseList('// Upgrade of: elves\n1 Sol Ring\n2 Llanowar Elves\n1 Craterhoof Behemoth') },
    { kind: 'wishlist' as const, name: 'Orphan', lines: parseList('// Upgrade of: Gone\n1 Sol Ring') },
    { kind: 'wishlist' as const, name: 'Other', lines: parseList('1 Sol Ring') }
  ]
  const needs = (inventory: string) =>
    listNeeds(upgrades, parseInventory(inventory)).map(({ list, needs: cards }) => [
      list.name,
      cards.map((c) => `${c.missing}/${c.wants} ${c.name}`)
    ])

  it('share the copies their deck holds, each on its own', () => {
    expect(needs('2 Sol Ring\n1 Llanowar Elves')).toEqual([
      ['Elves', []],
      ['Elves Alt', []],
      ['Elves Big', ['1/2 Llanowar Elves', '1/1 Craterhoof Behemoth']],
      ['Orphan', []],
      ['Other', []]
    ])
    const pool = copyPool(upgrades)
    expect(pool.inUse('sol ring', 2)).toBe(2)
    expect(pool.holders({ kind: 'wishlist', name: 'Elves Big' }, 'sol ring', 2)).toEqual([])
    expect(pool.holders({ kind: 'wishlist', name: 'Other' }, 'sol ring', 2)).toEqual([{ kind: 'deck', name: 'Elves', qty: 1 }])
  })

  it('need their own copies of cards their deck lacks too', () => {
    expect(needs('1 Craterhoof Behemoth')).toEqual([
      ['Elves', ['1/1 Sol Ring', '1/1 Llanowar Elves']],
      ['Elves Alt', ['1/1 Sol Ring']],
      ['Elves Big', ['1/1 Sol Ring', '2/2 Llanowar Elves']],
      ['Orphan', ['1/1 Sol Ring']],
      ['Other', ['1/1 Sol Ring']]
    ])
  })

  it('still use what the built decks leave', () => {
    expect(copyPool(upgrades).held({ kind: 'wishlist', name: 'Elves Big' }, 'llanowar elves', 3)).toBe(0)
    expect(needs('3 Llanowar Elves')[2]).toEqual(['Elves Big', ['1/1 Sol Ring', '1/1 Craterhoof Behemoth']])
  })
})

describe('unbuilt decks', () => {
  const unbuilt = [
    { kind: 'deck' as const, name: 'Burn', lines: parseList('2 Sol Ring') },
    { kind: 'deck' as const, name: 'Elves', lines: parseList('// Unbuilt: Yes\n3 Sol Ring\n1 Llanowar Elves') },
    { kind: 'wishlist' as const, name: 'Elves Plus', lines: parseList('// Upgrade of: Elves\n4 Sol Ring') },
    { kind: 'wishlist' as const, name: 'Other', lines: parseList('1 Sol Ring') }
  ]
  const pool = copyPool(unbuilt)
  const elves = { kind: 'deck' as const, name: 'Elves' }
  const needs = (inventory: string) =>
    listNeeds(unbuilt, parseInventory(inventory)).map(({ list, needs: cards }) => [
      list.name,
      cards.map((c) => `${c.missing}/${c.wants} ${c.name}, buy ${c.buy}`)
    ])

  it('use every owned copy and reserve none, and so do their upgrades', () => {
    expect(needs('3 Sol Ring')).toEqual([
      ['Burn', []],
      ['Elves', ['1/1 Llanowar Elves, buy 1']],
      ['Elves Plus', ['1/4 Sol Ring, buy 1']],
      ['Other', []]
    ])
    const plus = { kind: 'wishlist' as const, name: 'Elves Plus' }
    expect(pool.held(elves, 'sol ring', 3)).toBe(0)
    expect(pool.held(plus, 'sol ring', 3)).toBe(0)
    expect(pool.holders(plus, 'sol ring', 3)).toEqual([])
    expect(pool.claimed('sol ring', 3)).toBe(2)
  })

  it('cap only at the copies owned when adding cards, and leave other decks uncapped', () => {
    expect(pool.inOtherDecks(elves, 'sol ring')).toBe(0)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'Burn' }, 'sol ring')).toBe(0)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'New' }, 'sol ring')).toBe(2)
  })

  it('keep the copies they use out of trades, and are named after the decks that hold copies', () => {
    expect(pool.inUse('sol ring', 3)).toBe(4)
    expect(copyPool(unbuilt.slice(0, 2)).inUse('sol ring', 9)).toBe(3)
    expect(pool.usedBy('sol ring', 5).map((held) => `${held.qty} ${held.name}`)).toEqual(['2 Burn', '3 Elves', '3 Elves Plus', '1 Other'])
  })

  it('buy only the copies no purchase ahead covers', () => {
    expect(needs('')).toEqual([
      ['Burn', ['2/2 Sol Ring, buy 2']],
      ['Elves', ['3/3 Sol Ring, buy 1', '1/1 Llanowar Elves, buy 1']],
      ['Elves Plus', ['4/4 Sol Ring, buy 1']],
      ['Other', ['1/1 Sol Ring, buy 0']]
    ])
  })
})

describe('substitutes', () => {
  it('leave a wishlist line wanting a Version still wanted, unless it stands in', () => {
    const inventory = parseInventory('1 Sol Ring <1> [C21]\n')
    const wanted = (text: string) =>
      listNeeds([{ kind: 'wishlist', name: 'Shiny', lines: parseList(text) }], inventory).flatMap(({ needs }) => needs.map((need) => need.missing))
    expect(wanted('1 Sol Ring <284> [LTC]')).toEqual([1])
    expect(wanted('1 Sol Ring <284> [LTC] {Stand-in}')).toEqual([])
    expect(wanted('1 Sol Ring')).toEqual([])
    expect(listNeeds([{ kind: 'deck', name: 'Rocks', lines: parseList('1 Sol Ring <284> [LTC]') }], inventory)[0].needs).toEqual([])
  })
})
