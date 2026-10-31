import { describe, expect, it } from 'vitest'
import { parseList } from './decklist'
import { costKind, pipsOf } from './deckStats'
import { showsEnergyCurve, withEnergyCurve } from './listEnergy'
import { atLeast, colorOnTime, landsOnTime, manaBase, sourcesNeeded, type ManaRow, type Table } from './manaBase'
import { energyOf, fetchedColors, rampKind } from './manaText'
import type { CardInfo } from './types'

const info = (name: string, typeLine: string, extra: Partial<CardInfo> = {}): CardInfo => ({
  name,
  colors: [],
  colorIdentity: [],
  typeLine,
  manaValue: 0,
  rarity: 'rare',
  legalities: {},
  ...extra
})

describe('reading mana from rules text', () => {
  it('tells rocks, mana creatures and land searches apart, and leaves rituals out', () => {
    expect(rampKind('Artifact', '{T}: Add {C}{C}.', ['C'])).toBe('rock')
    expect(rampKind('Creature — Elf Druid', '{T}: Add {G}.', ['G'])).toBe('creature')
    expect(rampKind('Sorcery', 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.', [])).toBe('search')
    expect(rampKind('Instant', 'Add {B}{B}{B}.', ['B'])).toBeUndefined()
    expect(rampKind('Land', '{T}: Add {G}.', ['G'])).toBeUndefined()
  })

  it('finds the colors a fetch land finds', () => {
    expect(fetchedColors('{T}, Pay 1 life, Sacrifice this land: Search your library for a Plains or Island card, put it onto the battlefield')).toEqual(['W', 'U'])
    expect(fetchedColors('{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped')).toEqual([
      'W',
      'U',
      'B',
      'R',
      'G'
    ])
    expect(fetchedColors('{T}: Add {C}.')).toEqual([])
  })

  it('counts the energy a card makes and spends', () => {
    expect(energyOf('When this creature enters, you get {E}{E} (two energy counters).')).toEqual({ made: 2, spent: 0 })
    expect(energyOf('Whenever this creature attacks, you may pay {E}{E}{E}. If you do, …')).toEqual({ made: 0, spent: 3 })
    expect(energyOf('You get {E}{E}. Pay eight {E}: Draw a card.')).toEqual({ made: 2, spent: 8 })
    expect(energyOf('Flying')).toBeUndefined()
  })
})

describe('costs', () => {
  it('counts colored pips, hybrid and Phyrexian ones included', () => {
    expect(pipsOf('{2}{W}{W}{U}')).toEqual({ W: 2, U: 1, B: 0, R: 0, G: 0 })
    expect(pipsOf('{W/U}{2/B}{G/P}')).toEqual({ W: 1, U: 1, B: 1, R: 0, G: 1 })
  })

  it('names what a cost asks for: one color, several, generic only, or {C}', () => {
    expect(costKind(info('Bolt', 'Instant', { manaCost: '{R}' }))).toBe('R')
    expect(costKind(info('Electrolyze', 'Instant', { manaCost: '{1}{U}{R}' }))).toBe('M')
    expect(costKind(info('Sol Ring', 'Artifact', { manaCost: '{1}' }))).toBe('generic')
    expect(costKind(info('Thought-Knot Seer', 'Creature', { manaCost: '{3}{C}' }))).toBe('C')
    // Without a cost (card data from before costs were kept), its colors decide.
    expect(costKind(info('Old', 'Creature', { colors: ['G'] }))).toBe('G')
  })
})

describe('draw odds', () => {
  it('computes exact hypergeometric chances', () => {
    expect(atLeast(10, 10, 3, 3)).toBeCloseTo(1)
    expect(atLeast(10, 5, 2, 2)).toBeCloseTo((5 / 10) * (4 / 9))
    expect(atLeast(10, 0, 3, 1)).toBe(0)
  })

  it('gives the chance of making each land drop on time, on the draw', () => {
    // 36 Lands in 99 cards: by turn 1 you have seen 8 cards.
    expect(landsOnTime(99, 36, 1)).toBeCloseTo(1 - (63 / 99) * (62 / 98) * (61 / 97) * (60 / 96) * (59 / 95) * (58 / 94) * (57 / 93) * (56 / 92), 6)
    expect(landsOnTime(99, 36, 3)).toBeGreaterThan(landsOnTime(99, 36, 4))
  })

  it('sees one card fewer on the play', () => {
    expect(landsOnTime(60, 24, 3, true)).toBeCloseTo(atLeast(60, 24, 9, 3))
    expect(landsOnTime(60, 24, 3, true)).toBeLessThan(landsOnTime(60, 24, 3))
    expect(sourcesNeeded(60, 24, 1, 1, true)).toBeGreaterThanOrEqual(sourcesNeeded(60, 24, 1, 1))
  })

  it('asks more sources for more pips on the same turn, and fewer for a later turn', () => {
    expect(colorOnTime(99, 40, 40, 1, 1)).toBeCloseTo(1)
    const one = sourcesNeeded(99, 40, 1, 2)
    expect(sourcesNeeded(99, 40, 2, 2)).toBeGreaterThan(one)
    expect(sourcesNeeded(99, 40, 1, 5)).toBeLessThan(one)
  })
})

describe('manaBase', () => {
  const commander: Table = { deckSize: 100, players: 4 }
  const row = (name: string, qty: number, card: Partial<CardInfo> & { typeLine: string }, leader = false): ManaRow => ({
    line: { name, qty },
    info: info(name, card.typeLine, card),
    ...(leader && { leader })
  })
  const rows = [
    row('Raffine', 1, { typeLine: 'Legendary Creature', manaValue: 3, manaCost: '{W}{U}{B}' }, true),
    row('Plains', 12, { typeLine: 'Basic Land — Plains', produces: ['W'] }),
    row('Island', 12, { typeLine: 'Basic Land — Island', produces: ['U'] }),
    row('Command Tower', 1, { typeLine: 'Land', produces: ['W', 'U', 'B', 'R', 'G'] }),
    row('Arcane Signet', 1, { typeLine: 'Artifact', manaValue: 2, manaCost: '{2}', ramp: 'rock', produces: ['W', 'U', 'B', 'R', 'G'] }),
    row('Cultivate', 1, { typeLine: 'Sorcery', manaValue: 3, manaCost: '{2}{G}', ramp: 'search' }),
    row('Counterspell', 1, { typeLine: 'Instant', manaValue: 2, manaCost: '{U}{U}' }),
    row('Filler', 71, { typeLine: 'Creature', manaValue: 4, manaCost: '{4}' })
  ]

  it('counts the library without the commander, its Lands and its ramp', () => {
    const base = manaBase(rows, commander, 3.1)
    expect(base.library).toBe(99)
    expect(base.lands).toBe(25)
    expect(base.ramp).toEqual({ rocks: 1, creatures: 0, searches: 1, total: 2, cheap: 1 })
    expect(base.onTime).toHaveLength(7)
    expect(base.onTimeRamp[2]).toBeGreaterThan(base.onTime[2])
  })

  it("suggests Lands with Karsten's formula for 100 and 60 cards, and none for other sizes", () => {
    expect(manaBase(rows, commander, 3.1).suggestedLands).toBe(Math.round(31.42 + 3.13 * 3.1 - 0.28 * 1))
    expect(manaBase(rows, { deckSize: 60, players: 2 }, 2.5).suggestedLands).toBe(Math.round(19.59 + 1.9 * 2.5 - 0.28 * 1))
    expect(manaBase(rows, { deckSize: 40, players: 2 }, 3.1).suggestedLands).toBeNull()
    expect(manaBase(rows, null, 3.1).suggestedLands).toBeNull()
  })

  it('counts odds on the play with 2 players', () => {
    expect(manaBase(rows, { deckSize: 100, players: 2 }, 3.1).onTime[2]).toBeLessThan(manaBase(rows, commander, 3.1).onTime[2])
  })

  it("weighs each color's sources against its most demanding card, the commander's cost included", () => {
    const colors = manaBase(rows, commander, 3.1).colors
    expect(colors.map((need) => [need.color, need.pips, need.sources])).toEqual([
      ['W', 1, 14],
      ['U', 3, 14],
      ['B', 1, 2],
      ['G', 1, 2]
    ])
    expect(colors.find((need) => need.color === 'U')?.card).toBe('Counterspell')
  })
})

describe('the energy curve setting', () => {
  it('is off until turned on', () => {
    const lines = parseList('1 Harnessed Lightning')
    expect(showsEnergyCurve(lines)).toBe(false)
    expect(showsEnergyCurve(withEnergyCurve(lines, true))).toBe(true)
    expect(showsEnergyCurve(withEnergyCurve(withEnergyCurve(lines, true), false))).toBe(false)
  })
})
