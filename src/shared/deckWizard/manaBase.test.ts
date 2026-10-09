import { describe, expect, it } from 'vitest'
import { basicSplit, colorPips, landColors } from './manaBase'
import { testCard } from './testCards'

const colors = (land: { typeLine: string; text: string }) => [...landColors(land)].sort()

describe('which colors a land makes', () => {
  it('reads basic land types, mana abilities and fetched lands', () => {
    expect(colors(testCard('Stomping Ground'))).toEqual(['G', 'R'])
    expect(colors(testCard('Valakut, the Molten Pinnacle'))).toEqual(['R'])
    expect(colors(testCard('Wooded Foothills'))).toEqual(['G', 'R'])
  })

  it('reads lands that make or find any color', () => {
    expect(landColors({ typeLine: 'Land', text: "{T}: Add one mana of any color in your commander's color identity." }).size).toBe(5)
    expect(landColors({ typeLine: 'Land', text: '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.' }).size).toBe(5)
  })

  it('finds no colors in colorless lands', () => {
    expect(colors({ typeLine: 'Land', text: '{T}: Add {C}.' })).toEqual([])
  })
})

describe('colored mana symbols', () => {
  it('counts each color, hybrid symbols half for each', () => {
    expect(colorPips('{G}{U}{R}')).toEqual({ G: 1, U: 1, R: 1 })
    expect(colorPips('{3}{R/G}{R/G}')).toEqual({ R: 1, G: 1 })
    expect(colorPips('{2/R}{R/P}{X}')).toEqual({ R: 2 })
  })
})

describe('splitting basic lands', () => {
  const total = (split: Array<{ qty: number }>) => split.reduce((sum, basic) => sum + basic.qty, 0)

  it('follows the colors of the spells, with at least one of each', () => {
    const split = basicSplit(20, ['G', 'R', 'U'], { G: 30, R: 10, U: 0 })
    expect(total(split)).toBe(20)
    expect(split.map((b) => b.name)).toEqual(['Forest', 'Mountain', 'Island'])
    expect(split.find((b) => b.name === 'Island')?.qty).toBeGreaterThanOrEqual(1)
    expect(split.find((b) => b.name === 'Island')!.qty).toBeLessThan(split.find((b) => b.name === 'Mountain')!.qty)
  })

  it('favors a land type a key card counts', () => {
    const plain = basicSplit(22, ['G', 'R', 'U'], { G: 20, R: 10, U: 10 })
    const valakut = basicSplit(22, ['G', 'R', 'U'], { G: 20, R: 10, U: 10 }, { R: 1 })
    const mountains = (split: typeof plain) => split.find((b) => b.name === 'Mountain')!.qty
    expect(mountains(valakut)).toBeGreaterThan(mountains(plain))
    expect(valakut[0].name).toBe('Mountain')
    expect(total(valakut)).toBe(22)
  })

  it('uses Wastes for colorless decks, and splits nothing when no basics are needed', () => {
    expect(basicSplit(30, [], {})).toEqual([{ name: 'Wastes', qty: 30 }])
    expect(basicSplit(0, ['R'], { R: 5 })).toEqual([])
  })
})
