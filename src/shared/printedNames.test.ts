import { describe, expect, it } from 'vitest'
import { cardLines, parseList, serializeList } from './decklist'
import { printedNameFix, withPrintedNames } from './printedNames'
import type { Printing, PrintingsResult } from './types'

function printing(overrides: Partial<Printing>): Printing {
  return {
    id: `${overrides.set}-${overrides.collectorNumber}`,
    name: 'Sword of the Animist',
    set: 'm11',
    setName: 'Magic 2011',
    collectorNumber: '1',
    rarity: 'rare',
    releasedAt: '2010-07-16',
    lang: 'en',
    finishes: ['nonfoil', 'foil'],
    cardmarketId: null,
    price: {},
    priceFoil: {},
    imageSmall: null,
    imageNormal: null,
    imageBack: null,
    cardmarketUrl: null,
    labels: [],
    autoEligible: true,
    ...overrides
  }
}

const sword: PrintingsResult = {
  name: 'Sword of the Animist',
  fetchedAt: 0,
  printings: [
    printing({ set: 'm11', collectorNumber: '217', price: { trend: 3 } }),
    printing({ set: 'ltc', collectorNumber: '355', flavorName: 'Ring of Barahir', price: { trend: 9 } }),
    printing({ set: 'ltc', collectorNumber: '400', flavorName: 'Ring of Barahir', price: { trend: 5 } })
  ]
}

const fixesOf = (text: string, data: PrintingsResult) =>
  cardLines(parseList(text)).flatMap((line) => {
    const fix = printedNameFix(line, data, 'trend')
    return fix ? [fix] : []
  })

describe('lines named by a flavor name', () => {
  it('take the card name and the cheapest printing that carries the flavor name', () => {
    expect(fixesOf('1 Ring of Barahir\n', sword)).toMatchObject([
      { from: 'Ring of Barahir', name: 'Sword of the Animist', set: 'ltc', collector: '400', foil: false }
    ])
  })

  it('keep their own printing when it carries the flavor name', () => {
    expect(fixesOf('1 Ring of Barahir <355> [LTC]\n', sword)).toMatchObject([{ set: 'ltc', collector: '355', foil: false }])
  })

  it('leave exact names, near matches and unloaded cards alone', () => {
    expect(fixesOf('1 Sword of the Animist\n', sword)).toEqual([])
    expect(fixesOf('1 Sword of the Animst\n', sword)).toEqual([])
    expect(printedNameFix(cardLines(parseList('1 Ring of Barahir\n'))[0], undefined, 'trend')).toBeNull()
  })

  it('rename a commander header naming the line', () => {
    const godzilla: PrintingsResult = {
      name: 'Snapdragon',
      fetchedAt: 0,
      printings: [printing({ name: 'Snapdragon', set: 'iko', collectorNumber: '370', flavorName: 'Godzilla, Doom Inviter' })]
    }
    const lines = parseList('// Commander: Godzilla, Doom Inviter\n1 Godzilla, Doom Inviter\n1 Sol Ring\n')
    const fixes = fixesOf(serializeList(lines), godzilla).map((fix) => ({ ...fix, id: cardLines(lines)[0].id }))
    expect(serializeList(withPrintedNames(lines, fixes))).toBe('// Commander: Snapdragon\n1 Snapdragon <370> [IKO]\n1 Sol Ring\n')
  })
})
