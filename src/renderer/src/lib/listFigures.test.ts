import { describe, expect, it } from 'vitest'
import { bannerRow, headerBadge, headerLeaders, listColors } from './listFigures'
import type { Row } from './summary'

/** A commander row: its type line, colors and art, once loaded. */
const leader = (name: string, typeLine: string, colorIdentity: string[], loaded = true) =>
  ({
    line: { name },
    info: { typeLine, colorIdentity },
    resolution: loaded ? { printing: { imageNormal: `https://cards.scryfall.io/normal/${name}.jpg` } } : null
  }) as unknown as Row

const art = (name: string) => `https://cards.scryfall.io/art_crop/${name}.jpg`

describe("a list header's commanders", () => {
  it('pictures one commander, or both partners', () => {
    const okaun = leader('Okaun', 'Legendary Creature — Cyclops Berserker', ['R'])
    const zndrsplt = leader('Zndrsplt', 'Legendary Creature — Homunculus', ['U'])
    expect(headerLeaders([okaun], true)).toMatchObject({ names: ['Okaun'], arts: [art('Okaun')], background: null })
    expect(headerLeaders([okaun, zndrsplt], true)).toMatchObject({ names: ['Okaun', 'Zndrsplt'], arts: [art('Okaun'), art('Zndrsplt')] })
  })

  it('puts the commander first, and its Background apart as a badge', () => {
    const giants = leader('Raised by Giants', 'Legendary Enchantment — Background', ['G'])
    const wilson = leader('Wilson', 'Legendary Creature — Bear Warrior', ['G'])
    expect(headerLeaders([giants, wilson], true)).toMatchObject({
      names: ['Wilson', 'Raised by Giants'],
      arts: [art('Wilson')],
      background: { name: 'Raised by Giants', art: art('Raised by Giants'), color: 'G' }
    })
  })

  it('shows no half pair, and no art without card images', () => {
    const okaun = leader('Okaun', 'Legendary Creature — Cyclops Berserker', ['R'])
    const loading = leader('Zndrsplt', 'Legendary Creature — Homunculus', ['U'], false)
    expect(headerLeaders([okaun, loading], true).arts).toEqual([])
    const giants = leader('Raised by Giants', 'Legendary Enchantment — Background', [])
    const wilson = leader('Wilson', 'Legendary Creature — Bear Warrior', ['G'])
    expect(headerLeaders([wilson, giants], false)).toMatchObject({ arts: [], background: { art: null, color: 'C' } })
  })
})

describe("a list header's Companion", () => {
  it('pictures it as a badge ringed in its first color, in WUBRG order', () => {
    const lurrus = leader('Lurrus of the Dream-Den', 'Legendary Creature — Cat Nightmare', ['B', 'W'])
    expect(headerBadge(lurrus, true)).toEqual({ name: 'Lurrus of the Dream-Den', art: art('Lurrus of the Dream-Den'), color: 'W' })
    expect(headerBadge(lurrus, false).art).toBeNull()
  })
})

/** A card row: its quantity, type line, colors and mana value. */
const card = (name: string, qty: number, typeLine: string, colorIdentity: string[], manaValue = 0) =>
  ({
    line: { name, qty },
    side: false,
    info: { typeLine, colorIdentity, manaValue },
    resolution: { printing: { imageNormal: `https://cards.scryfall.io/normal/${name}.jpg` } }
  }) as unknown as Row

describe("a list's colors without a commander", () => {
  it('leaves out a color under a tenth of the colored nonland copies, and the lands', () => {
    const rows = [
      card('Lightning Bolt', 4, 'Instant', ['R']),
      card('Goblin Guide', 4, 'Creature — Goblin Scout', ['R']),
      card('Fireblast', 4, 'Instant', ['R']),
      card('Bloodstained Mire', 4, 'Land', ['B', 'R']),
      card('Kolaghan’s Command', 1, 'Instant', ['B', 'R'])
    ]
    expect(listColors(rows, [])).toEqual(['R'])
    expect(listColors([...rows, card('Bloodghast', 1, 'Creature — Vampire Spirit', ['B'])], [])).toEqual(['B', 'R'])
  })

  it('takes the lands alone when no spell has a color, and C when nothing does', () => {
    expect(listColors([card('Sol Ring', 1, 'Artifact', []), card('Island', 10, 'Basic Land — Island', ['U'])], [])).toEqual(['U'])
    expect(listColors([card('Sol Ring', 1, 'Artifact', [])], [])).toEqual(['C'])
  })
})

describe('the banner of a deck without a commander', () => {
  const rows = [
    card('Lightning Bolt', 4, 'Instant', ['R'], 1),
    card('Glorybringer', 2, 'Creature — Dragon', ['R'], 5),
    card('Ultimatum', 1, 'Sorcery', ['R'], 5),
    card('Mountain', 20, 'Basic Land — Mountain', ['R'])
  ]

  it('is the nonland Card of highest mana value, the first listed on a tie', () => {
    expect(bannerRow(rows, null)?.line.name).toBe('Glorybringer')
  })

  it('waits for all the cards to load', () => {
    const loading = { ...card('Ultimatum', 1, 'Sorcery', ['R'], 5), info: undefined } as unknown as Row
    expect(bannerRow([rows[0], loading], null)).toBeNull()
  })

  it('is the Card the banner header names, when listed', () => {
    expect(bannerRow(rows, 'mountain')?.line.name).toBe('Mountain')
    expect(bannerRow(rows, 'Shock')?.line.name).toBe('Glorybringer')
  })
})
