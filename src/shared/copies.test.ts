import { describe, expect, it } from 'vitest'
import { allocationOrder, copiesToAdd, copyPool, listNeeds } from './copies'
import { parseInventory, parseList } from './decklist'

const lists = [
  { kind: 'wishlist' as const, name: 'Someday', lines: parseList('// Priority: Low\n2 Sol Ring') },
  { kind: 'wishlist' as const, name: 'Angels', lines: parseList('1 Sol Ring\n1 Smothering Tithe') },
  { kind: 'deck' as const, name: 'Zombies', lines: parseList('1 Sol Ring') },
  { kind: 'wishlist' as const, name: 'Goblins', lines: parseList('// Priority: High\n1 Sol Ring') },
  { kind: 'deck' as const, name: 'Burn', lines: parseList('1 Sol Ring\n1 Lightning Bolt') }
]

describe('allocationOrder', () => {
  it('puts decks first by name, then wishlists by priority and name', () => {
    expect(allocationOrder(lists).map((list) => list.name)).toEqual(['Burn', 'Zombies', 'Goblins', 'Angels', 'Someday'])
  })
})

describe('copyPool', () => {
  it('counts the copies lists ahead claim', () => {
    const pool = copyPool(lists)
    expect(['Burn', 'Zombies', 'Goblins', 'Angels', 'Someday'].map((name) => pool.held(lists.find((l) => l.name === name)!, 'sol ring', 9))).toEqual([0, 1, 2, 3, 4])
    expect(pool.held({ kind: 'deck', name: 'New' }, 'sol ring', 9)).toBe(6)
    expect(pool.held({ kind: 'deck', name: 'New' }, 'sol ring', 2)).toBe(2)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'Burn' }, 'sol ring')).toBe(1)
    expect(pool.inOtherDecks({ kind: 'wishlist', name: 'Angels' }, 'sol ring')).toBe(2)
    expect(pool.claimed('sol ring', 9)).toBe(6)
  })

  it('says which lists ahead get the owned copies', () => {
    const pool = copyPool(lists)
    const angels = { kind: 'wishlist' as const, name: 'Angels' }
    expect(pool.holders(angels, 'sol ring', 2)).toEqual([
      { kind: 'deck', name: 'Burn', qty: 1 },
      { kind: 'deck', name: 'Zombies', qty: 1 }
    ])
    expect(pool.holders(angels, 'sol ring', 9)).toHaveLength(3)
    expect(pool.holders(angels, 'sol ring', 0)).toEqual([])
  })

  it('says which lists use the owned copies, and how many the lists keep', () => {
    const pool = copyPool(lists)
    expect(pool.usedBy('sol ring', 3).map((held) => `${held.qty} ${held.name}`)).toEqual(['1 Burn', '1 Zombies', '1 Goblins'])
    expect(pool.inUse('sol ring', 3)).toBe(6)
    expect(pool.inUse('black lotus', 0)).toBe(0)
  })
})

describe('copiesToAdd', () => {
  const cards = [
    { name: 'Sol Ring', qty: 1 },
    { name: 'Lightning Bolt', qty: 2 },
    { name: 'sol ring', qty: 1 }
  ]
  const inventory = parseInventory('7 Sol Ring\n1 Lightning Bolt')

  it('adds copies beyond the owned copies no list claims', () => {
    expect(copiesToAdd(cards, inventory, copyPool(lists))).toEqual([
      { name: 'Sol Ring', qty: 1 },
      { name: 'Lightning Bolt', qty: 2 }
    ])
  })
})

describe('listNeeds', () => {
  it('hands owned copies out in allocation order', () => {
    expect(
      listNeeds(lists, parseInventory('3 Sol Ring')).map(({ list, needs: cards }) => [list.name, cards.map((c) => `${c.missing}/${c.wants} ${c.name}`)])
    ).toEqual([
      ['Burn', ['1/1 Lightning Bolt']],
      ['Zombies', []],
      ['Goblins', []],
      ['Angels', ['1/1 Sol Ring', '1/1 Smothering Tithe']],
      ['Someday', ['2/2 Sol Ring']]
    ])
  })
})

describe('upgrades', () => {
  const upgrades = [
    { kind: 'deck' as const, name: 'Elves', lines: parseList('1 Sol Ring\n1 Llanowar Elves') },
    { kind: 'wishlist' as const, name: 'Elves Big', lines: parseList('// Upgrade of: elves\n1 Sol Ring\n2 Llanowar Elves\n1 Craterhoof Behemoth') },
    { kind: 'wishlist' as const, name: 'Elves Alt', lines: parseList('// Upgrade of: Elves\n1 Sol Ring') },
    { kind: 'wishlist' as const, name: 'Orphan', lines: parseList('// Upgrade of: Gone\n1 Sol Ring') },
    { kind: 'wishlist' as const, name: 'Other', lines: parseList('1 Sol Ring') }
  ]
  const needs = (inventory: string) =>
    listNeeds(upgrades, parseInventory(inventory)).map(({ list, needs: cards }) => [
      list.name,
      cards.map((c) => `${c.missing}/${c.wants} ${c.name}`)
    ])

  it('share the copies their deck gets, each on its own, and claim only the rest', () => {
    expect(needs('2 Sol Ring\n1 Llanowar Elves')).toEqual([
      ['Elves', []],
      ['Elves Alt', []],
      ['Elves Big', ['1/2 Llanowar Elves', '1/1 Craterhoof Behemoth']],
      ['Orphan', []],
      ['Other', ['1/1 Sol Ring']]
    ])
    const pool = copyPool(upgrades)
    expect(pool.inUse('sol ring', 2)).toBe(3)
    expect(pool.holders({ kind: 'wishlist', name: 'Elves Big' }, 'sol ring', 2)).toEqual([])
    expect(pool.holders({ kind: 'wishlist', name: 'Other' }, 'sol ring', 2)).toEqual([
      { kind: 'deck', name: 'Elves', qty: 1 },
      { kind: 'wishlist', name: 'Orphan', qty: 1 }
    ])
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

  it('still use what the lists ahead leave', () => {
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
    expect(pool.claimed('sol ring', 3)).toBe(3)
  })

  it('cap only at the copies owned when adding cards, and leave other decks uncapped', () => {
    expect(pool.inOtherDecks(elves, 'sol ring')).toBe(0)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'Burn' }, 'sol ring')).toBe(0)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'New' }, 'sol ring')).toBe(2)
  })

  it('keep the copies they use out of trades, and are named after the lists that reserve', () => {
    expect(pool.inUse('sol ring', 3)).toBe(4)
    expect(copyPool(unbuilt.slice(0, 2)).inUse('sol ring', 9)).toBe(3)
    expect(pool.usedBy('sol ring', 5).map((held) => `${held.qty} ${held.name}`)).toEqual(['2 Burn', '1 Other', '2 Elves', '2 Elves Plus'])
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
