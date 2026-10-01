import { describe, expect, it } from 'vitest'
import { deckStats } from './deckStats'
import type { CardInfo } from './types'

const card = (typeLine: string, manaValue: number, colors: string[]): CardInfo => ({
  name: typeLine,
  colors,
  colorIdentity: colors,
  typeLine,
  manaValue,
  rarity: 'common',
  legalities: {}
})

describe('deck stats', () => {
  it('builds the curve from non-land cards, split into creatures and other spells', () => {
    const stats = deckStats([
      { line: { qty: 4 }, info: card('Creature — Elf Druid', 1, ['G']) },
      { line: { qty: 2 }, info: card('Instant', 1, ['R']) },
      { line: { qty: 1 }, info: card('Artifact Creature — Golem', 3, []) },
      { line: { qty: 1 }, info: card('Sorcery', 9, ['B']) },
      { line: { qty: 20 }, info: card('Basic Land — Forest', 0, []) }
    ])
    expect(stats.curve[1]).toEqual({ manaValue: 1, creatures: 4, others: 2 })
    expect(stats.curve[3]).toEqual({ manaValue: 3, creatures: 1, others: 0 })
    expect(stats.curve[7]).toEqual({ manaValue: 7, creatures: 0, others: 1 }) // 9 goes in 7+
    expect(stats.spells).toBe(8)
    expect(stats.lands).toBe(20)
    expect(stats.averageManaValue).toBeCloseTo((4 + 2 + 3 + 9) / 8)
  })

  it('counts multicolored cards toward each of their colors, and colorless ones apart', () => {
    const stats = deckStats([
      { line: { qty: 2 }, info: card('Creature — Human', 2, ['W', 'U']) },
      { line: { qty: 1 }, info: card('Artifact', 1, []) },
      { line: { qty: 3 }, info: card('Instant', 1, ['U']) }
    ])
    expect(stats.colors).toEqual({ W: 2, U: 5, B: 0, R: 0, G: 0 })
    expect(stats.multicolor).toBe(2)
    expect(stats.colorless).toBe(1)
  })

  it('treats a land on its back face as a spell, and reports cards still loading', () => {
    const stats = deckStats([
      { line: { qty: 1 }, info: card('Instant // Land', 3, ['G']) },
      { line: { qty: 2 }, info: undefined },
      { line: { qty: 1 }, info: null }
    ])
    expect(stats.spells).toBe(1)
    expect(stats.pending).toBe(2)
  })

  it('has no average without spells', () => {
    expect(deckStats([{ line: { qty: 10 }, info: card('Basic Land — Island', 0, []) }]).averageManaValue).toBeNull()
  })
})
