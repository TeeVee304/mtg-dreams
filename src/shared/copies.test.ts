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
  it('counts the copies lists ahead claim, with separate copies', () => {
    const pool = copyPool(lists, 'separate')
    expect(['Burn', 'Zombies', 'Goblins', 'Angels', 'Someday'].map((name) => pool.held(lists.find((l) => l.name === name)!, 'sol ring'))).toEqual([0, 1, 2, 3, 4])
    expect(pool.held({ kind: 'deck', name: 'New' }, 'sol ring')).toBe(6)
    expect(pool.inOtherDecks({ kind: 'deck', name: 'Burn' }, 'sol ring')).toBe(1)
    expect(pool.inOtherDecks({ kind: 'wishlist', name: 'Angels' }, 'sol ring')).toBe(2)
    expect(pool.claimed('sol ring')).toBe(6)
  })

  it('claims nothing with shared copies', () => {
    const pool = copyPool(lists, 'shared')
    expect(pool.held(lists[0], 'sol ring')).toBe(0)
    expect(pool.inOtherDecks(lists[2], 'sol ring')).toBe(0)
    expect(pool.claimed('sol ring')).toBe(0)
  })
})

describe('copiesToAdd', () => {
  const cards = [
    { name: 'Sol Ring', qty: 1 },
    { name: 'Lightning Bolt', qty: 2 },
    { name: 'sol ring', qty: 1 }
  ]
  const inventory = parseInventory('7 Sol Ring\n1 Lightning Bolt')

  it('adds copies beyond the owned copies no list claims, with separate copies', () => {
    expect(copiesToAdd(cards, inventory, copyPool(lists, 'separate'))).toEqual([
      { name: 'Sol Ring', qty: 1 },
      { name: 'Lightning Bolt', qty: 2 }
    ])
  })

  it('adds only copies missing from the inventory, with shared copies', () => {
    expect(copiesToAdd(cards, inventory, copyPool(lists, 'shared'))).toEqual([{ name: 'Lightning Bolt', qty: 1 }])
  })
})

describe('listNeeds', () => {
  const inventory = parseInventory('3 Sol Ring')
  const needs = (mode: 'shared' | 'separate') =>
    listNeeds(lists, inventory, mode).map(({ list, needs: cards }) => [list.name, cards.map((c) => `${c.missing}/${c.wants} ${c.name}`)])

  it('hands owned copies out in allocation order with separate copies', () => {
    expect(needs('separate')).toEqual([
      ['Burn', ['1/1 Lightning Bolt']],
      ['Zombies', []],
      ['Goblins', []],
      ['Angels', ['1/1 Sol Ring', '1/1 Smothering Tithe']],
      ['Someday', ['2/2 Sol Ring']]
    ])
  })

  it('checks each wishlist against the whole inventory with shared copies', () => {
    expect(needs('shared')).toEqual([
      ['Goblins', []],
      ['Angels', ['1/1 Smothering Tithe']],
      ['Someday', []]
    ])
  })
})
