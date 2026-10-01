import { describe, expect, it } from 'vitest'
import { parseInventory, parseList } from './decklist'
import {
  buildSnapshot,
  computeWants,
  matchTrades,
  parseTradeText,
  serializeSnapshot,
  snapshotToText
} from './trade'

const now = new Date('2026-09-30T10:00:00Z')
const inventory = parseInventory('3 Sol Ring\n1 Thoughtseize\n12 Island\n2 Counterspell')
const wishlists = [
  { name: 'Doom', lines: parseList('1 Sol Ring\n2 Demonic Tutor\n1 Reanimate\n20 Swamp\n1 Counterspell') },
  { name: 'Burn', lines: parseList('4 Lightning Bolt\n1 Demonic Tutor\n1 Reanimate <3> [TMP]\n1 Reanimate') }
]

describe('computeWants', () => {
  it('lists what each wishlist is missing, taking the largest shortfall and skipping basics', () => {
    expect(computeWants(wishlists, inventory)).toEqual([
      { name: 'Demonic Tutor', qty: 2, lists: ['Doom', 'Burn'] },
      { name: 'Lightning Bolt', qty: 4, lists: ['Burn'] },
      { name: 'Reanimate', qty: 2, lists: ['Doom', 'Burn'] }
    ])
  })
})

describe('buildSnapshot', () => {
  it('shares everything owned except basic lands', () => {
    const snapshot = buildSnapshot(' Bruno ', inventory, wishlists, now)
    expect(snapshot.name).toBe('Bruno')
    expect(snapshot.haves).toEqual([
      { name: 'Counterspell', qty: 2 },
      { name: 'Sol Ring', qty: 3 },
      { name: 'Thoughtseize', qty: 1 }
    ])
    expect(snapshot.wants.map((w) => w.name)).toEqual(['Demonic Tutor', 'Lightning Bolt', 'Reanimate'])
  })
})

describe('parseTradeText', () => {
  const snapshot = buildSnapshot('Ana', inventory, wishlists, now)

  it('round-trips the trade file and its text version', () => {
    expect(parseTradeText(serializeSnapshot(snapshot), 'file')).toEqual(snapshot)
    const fromText = parseTradeText(snapshotToText(snapshot), 'pasted')
    expect(fromText).toMatchObject({ name: 'Ana', source: 'app', haves: snapshot.haves, wants: snapshot.wants })
  })

  it('reads plain lists and Arena/Moxfield lines as cards they have', () => {
    const list = parseTradeText('4 Lightning Bolt (2XM) 141\n1 Sol Ring *F*\nnot a card', 'moxfield export', now)
    expect(list).toMatchObject({ name: 'moxfield export', source: 'list', wants: [] })
    expect(list.haves).toEqual([
      { name: 'Lightning Bolt', qty: 4 },
      { name: 'Sol Ring', qty: 1 }
    ])
  })

  it('reads collection CSVs with Count and Name columns', () => {
    const csv = '"Count","Tradelist Count","Name","Edition"\n"2","0","Sol Ring","cmm"\n"1","1","Fire // Ice","mh2"\n"1","0","Sol Ring","c21"'
    expect(parseTradeText(csv, 'deckbox').haves).toEqual([
      { name: 'Fire // Ice', qty: 1 },
      { name: 'Sol Ring', qty: 3 }
    ])
  })

  it('remembers that a saved list came from plain card lists', () => {
    const plain = parseTradeText('2 Sol Ring', 'Carl', now)
    expect(parseTradeText(serializeSnapshot(plain), 'Carl').source).toBe('list')
  })

  it('still reads trade lists made before the app was renamed', () => {
    const old = { ...snapshot, format: 'mtg-dream-trade' }
    expect(parseTradeText(JSON.stringify(old), 'x')).toEqual(snapshot)
    const oldText = snapshotToText(snapshot).replace('MTG Dreams trade list', 'MTG Dream trade list')
    expect(parseTradeText(oldText, 'pasted')).toMatchObject({ name: 'Ana', source: 'app' })
  })

  it('rejects files that are not trade lists', () => {
    expect(() => parseTradeText('{"hello": 1}', 'x')).toThrow('not an MTG Dreams trade list')
    expect(() => parseTradeText('just some words', 'x')).toThrow('No cards found')
  })

  it('keeps friend names safe to use as file names', () => {
    const file = serializeSnapshot({ ...snapshot, name: 'Ana: the "Great"' })
    expect(parseTradeText(file, 'x').name).toBe('Ana - the Great')
  })
})

describe('matchTrades', () => {
  it('finds cards the friend has that you want, and the reverse', () => {
    const mine = buildSnapshot('Me', inventory, wishlists, now)
    const myWants = computeWants(wishlists, inventory)
    const friend = parseTradeText('// Have\n1 Demonic Tutor\n9 Lightning Bolt\n5 Island\n// Want\n2 Sol Ring\n1 Thoughtseize\n3 Island', 'Ana')
    const { forMe, forThem } = matchTrades(mine.haves, myWants, friend)
    expect(forMe).toEqual([
      { name: 'Demonic Tutor', qty: 1, available: 1, needed: 2, lists: ['Doom', 'Burn'] },
      { name: 'Lightning Bolt', qty: 4, available: 9, needed: 4, lists: ['Burn'] }
    ])
    expect(forThem).toEqual([
      { name: 'Sol Ring', qty: 2, available: 3, needed: 2, lists: [] },
      { name: 'Thoughtseize', qty: 1, available: 1, needed: 1, lists: [] }
    ])
  })
})
