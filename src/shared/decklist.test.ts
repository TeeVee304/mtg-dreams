import { describe, expect, it } from 'vitest'
import {
  allocateOwned,
  cardLines,
  nameKey,
  parseCardLine,
  parseInventory,
  parseList,
  serializeInventory,
  serializeList,
  unrecognizedLines
} from './decklist'

describe('parseCardLine', () => {
  it('parses plain Goldfish lines', () => {
    expect(parseCardLine('4 Lightning Bolt')).toEqual({
      qty: 4, name: 'Lightning Bolt', set: undefined, collector: undefined, foil: false
    })
  })

  it('parses Goldfish version tags in any order', () => {
    expect(parseCardLine('1 Island <254> [DMU]')).toMatchObject({ name: 'Island', set: 'dmu', collector: '254' })
    expect(parseCardLine('1 Island [DMU] <254> (F)')).toMatchObject({ set: 'dmu', collector: '254', foil: true })
  })

  it('parses Arena / Moxfield exports', () => {
    expect(parseCardLine('4 Lightning Bolt (2XM) 141')).toMatchObject({ name: 'Lightning Bolt', set: '2xm', collector: '141' })
    expect(parseCardLine('1 Sol Ring (CMM) 464 *F*')).toMatchObject({ set: 'cmm', collector: '464', foil: true })
    expect(parseCardLine('2x Counterspell')).toMatchObject({ qty: 2, name: 'Counterspell' })
  })

  it('keeps parenthesised words that are part of the card name', () => {
    expect(parseCardLine('1 B.F.M. (Big Furry Monster)')).toMatchObject({ name: 'B.F.M. (Big Furry Monster)', set: undefined })
  })

  it('keeps split and double-faced names intact', () => {
    expect(parseCardLine('1 Fire // Ice')).toMatchObject({ name: 'Fire // Ice' })
  })

  it('rejects lines without a quantity', () => {
    expect(parseCardLine('Sideboard')).toBeNull()
    expect(parseCardLine('// comment')).toBeNull()
    expect(parseCardLine('0 Lightning Bolt')).toBeNull()
  })
})

describe('parseList / serializeList', () => {
  it('round-trips files, keeping comments and blank lines in place', () => {
    const text = '// Burn\n4 Lightning Bolt\n\n1 Sol Ring <464> [CMM] (F)\nSideboard\n2 Counterspell\n'
    expect(serializeList(parseList(text))).toBe(text)
  })

  it('normalises CRLF, BOM and trailing blank lines', () => {
    expect(serializeList(parseList('﻿4 Lightning Bolt\r\n2 Opt\r\n\r\n'))).toBe('4 Lightning Bolt\n2 Opt\n')
  })

  it('writes set codes upper-case', () => {
    expect(serializeList(parseList('1 Opt [eld]'))).toBe('1 Opt [ELD]\n')
  })

  it('flags unrecognised lines but not comments or headers', () => {
    const lines = parseList('Deck\n4 Lightning Bolt\n// note\nLightnin Bolt\n\nSideboard:')
    expect(unrecognizedLines(lines)).toEqual(['Lightnin Bolt'])
  })
})

describe('allocateOwned', () => {
  it('counts each owned copy once across lines of the same card', () => {
    const lines = cardLines(parseList('4 Lightning Bolt\n1 Opt\n1 Lightning Bolt [M11]\n2 lightning bolt (F)'))
    const inventory = parseInventory('5 Lightning Bolt\n3 Opt')
    expect(allocateOwned(lines, inventory)).toEqual([
      { owned: 4, before: 0 },
      { owned: 1, before: 0 },
      { owned: 1, before: 4 },
      { owned: 0, before: 5 }
    ])
  })
})

describe('inventory', () => {
  it('merges versions and faces by name', () => {
    const inventory = parseInventory(
      '2 Lightning Bolt [M11]\n1 lightning bolt (F)\n1 Delver of Secrets // Insectile Aberration\n1 Delver of Secrets'
    )
    expect(inventory.get('lightning bolt')?.qty).toBe(3)
    expect(inventory.get(nameKey('Delver of Secrets'))?.qty).toBe(2)
    expect(serializeInventory(inventory)).toBe('2 Delver of Secrets // Insectile Aberration\n3 Lightning Bolt\n')
  })
})
