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

  it('parses Archidekt exports, dropping categories and labels', () => {
    expect(parseCardLine('1x Wandering Archaic // Explore the Vastlands (stx) 6 [Maybeboard{noDeck}{noPrice}]')).toMatchObject({
      qty: 1, name: 'Wandering Archaic // Explore the Vastlands', set: 'stx', collector: '6', foil: false
    })
    expect(parseCardLine('1x Sol Ring (cmm) 410 *F* [Ramp]')).toMatchObject({ name: 'Sol Ring', set: 'cmm', collector: '410', foil: true })
    expect(parseCardLine('1x Sol Ring (cmm) 410 [Ramp,Artifact] ^Have,#37d67a^')).toMatchObject({ name: 'Sol Ring', set: 'cmm', collector: '410' })
    expect(parseCardLine('1x Atraxa, Grand Unifier [Commander{top}]')).toMatchObject({ name: 'Atraxa, Grand Unifier', set: undefined })
    // A bare one-word tag without an Arena set is still a Goldfish set.
    expect(parseCardLine('1 Island [DMU]')).toMatchObject({ name: 'Island', set: 'dmu' })
  })

  it("moves Archidekt's {noDeck} Cards to a Sideboard or Maybeboard section", () => {
    const text = [
      '1x Sol Ring (cmm) 410 [Ramp]',
      '1x Wandering Archaic // Explore the Vastlands (stx) 6 [Maybeboard{noDeck}{noPrice}]',
      '1x Pyroblast (ice) 213 [Sideboard{noDeck}]',
      '1x Fireblast (all) 100 [Removal{noDeck}]'
    ].join('\n')
    expect(serializeList(parseList(text))).toBe(
      '1 Sol Ring <410> [CMM]\n\nSideboard\n1 Pyroblast <213> [ICE]\n\nMaybeboard\n' +
        '1 Wandering Archaic // Explore the Vastlands <6> [STX]\n1 Fireblast <100> [ALL]\n'
    )
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
      { owned: 4, before: 0, held: 0 },
      { owned: 1, before: 0, held: 0 },
      { owned: 1, before: 4, held: 0 },
      { owned: 0, before: 5, held: 0 }
    ])
  })

  it('starts after the copies lists ahead hold', () => {
    const lines = cardLines(parseList('2 Lightning Bolt\n1 Opt\n1 Lightning Bolt'))
    const inventory = parseInventory('4 Lightning Bolt\n1 Opt')
    const held = (key: string) => (key === 'lightning bolt' ? 1 : 0)
    expect(allocateOwned(lines, inventory, held)).toEqual([
      { owned: 2, before: 1, held: 1 },
      { owned: 1, before: 0, held: 0 },
      { owned: 1, before: 3, held: 1 }
    ])
  })
})

describe('inventory', () => {
  it('counts each card once across versions and faces, keeping its versions', () => {
    const inventory = parseInventory(
      '2 Lightning Bolt [M11]\n1 lightning bolt (F)\n1 Delver of Secrets // Insectile Aberration\n1 Delver of Secrets'
    )
    expect(inventory.get('lightning bolt')?.qty).toBe(3)
    expect(inventory.get(nameKey('Delver of Secrets'))?.qty).toBe(2)
    expect(serializeInventory(inventory)).toBe(
      '2 Delver of Secrets // Insectile Aberration\n1 Lightning Bolt (F)\n2 Lightning Bolt [M11]\n'
    )
  })

  it('reads and writes languages and worthless marks, and leaves them out on request', () => {
    expect(parseCardLine('1 Sol Ring <472> [CMR] (F) {DE} {Worthless}')).toEqual({
      qty: 1, name: 'Sol Ring', set: 'cmr', collector: '472', foil: true, lang: 'de', worthless: true
    })
    expect(parseCardLine('1 Opt {EN}')).toEqual({ qty: 1, name: 'Opt', set: undefined, collector: undefined, foil: false })
    expect(parseCardLine('1 Opt {XX}')?.name).toBe('Opt {XX}')
    // Its first name still reads.
    expect(parseCardLine('1 Opt {No value}')).toMatchObject({ name: 'Opt', worthless: true })
    const inventory = parseInventory(['2 Sol Ring [CMR]', '1 Sol Ring [CMR] {ZHS} {Worthless}', '1 Opt'].join('\n'))
    expect(serializeInventory(inventory)).toBe(['1 Opt', '2 Sol Ring [CMR]', '1 Sol Ring [CMR] {ZHS} {Worthless}', ''].join('\n'))
    expect(serializeInventory(inventory, true)).toBe(['1 Opt', '3 Sol Ring [CMR]', ''].join('\n'))
  })
})

describe('stand-ins', () => {
  it('reads and writes the {Stand-in} mark', () => {
    const [line] = cardLines(parseList('1 Sol Ring <284> [LTC] {stand-in}'))
    expect(line.standIn).toBe(true)
    expect(serializeList([line])).toBe('1 Sol Ring <284> [LTC] {Stand-in}\n')
  })

  it('owns a line wanting a Version only with copies of it, when asked to', () => {
    const inventory = parseInventory('1 Sol Ring <1> [C21]\n')
    const lines = cardLines(parseList('1 Sol Ring <284> [LTC]'))
    expect(allocateOwned(lines, inventory)[0]).toMatchObject({ owned: 1 })
    expect(allocateOwned(lines, inventory, undefined, true)[0]).toMatchObject({ owned: 0, substitutes: 1 })
  })
})
