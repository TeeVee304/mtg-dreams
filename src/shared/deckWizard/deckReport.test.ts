import { describe, expect, it } from 'vitest'
import { draftDeck } from './deckDraft'
import { atLeast, deckReport, type ReportCard } from './deckReport'
import { BRIEF, lookup, setUp } from './testDecks'

describe('the odds of drawing what you need', () => {
  it('match a direct calculation', () => {
    // No land among 7 cards from 99 with 37 lands: 62/99 × 61/98 × … × 56/93.
    let none = 1
    for (let i = 0; i < 7; i++) none *= (62 - i) / (99 - i)
    expect(atLeast(1, 7, 37, 99)).toBeCloseTo(1 - none, 10)
    expect(atLeast(0, 7, 0, 99)).toBe(1)
    expect(atLeast(1, 7, 0, 99)).toBe(0)
    expect(atLeast(3, 10, 99, 99)).toBe(1)
  })
})

describe('the deck report', () => {
  const { pool, template } = setUp(BRIEF)
  const draft = draftDeck(pool)
  const cards: ReportCard[] = draft.picks.map((pick) => ({ ...lookup(pick.name)!, qty: pick.qty }))
  const flubs = lookup('Flubs, the Fool')!
  const report = deckReport(cards, flubs, template, 2)

  it('counts the curve and the lands', () => {
    expect(report.curve.reduce((a, b) => a + b, 0) + report.lands).toBe(99)
    expect(report.lands).toBe(40)
    expect(report.averageManaValue).toBeGreaterThan(1)
  })

  it('gives the odds of casting each color, from the land sources', () => {
    expect(report.colors.map((c) => c.color).sort()).toEqual(['G', 'R', 'U'].filter((c) => report.colors.some((o) => o.color === c)))
    const red = report.colors.find((c) => c.color === 'R')!
    expect(red.sources).toBeGreaterThan(10)
    expect(red.hardest.pips).toBeGreaterThanOrEqual(1)
    expect(red.chance).toBeGreaterThan(0)
    expect(red.chance).toBeLessThanOrEqual(1)
  })

  it('counts each job, a card doing two counting for both', () => {
    const ramp = report.jobs.find((j) => j.role === 'ramp')!
    expect(ramp).toMatchObject({ label: 'Ramp', target: template.slots.find((s) => s.id === 'ramp')!.count })
    expect(ramp.count).toBeGreaterThanOrEqual(ramp.target)
  })

  it('estimates the bracket from the cards, and says why not lower', () => {
    expect(report.power).toMatchObject({ target: 2, estimate: 2, reasons: [], issues: [], gameChangers: [] })
    const spicy = deckReport(cards, flubs, template, 2, {
      facts: { tag: 'P', gameChangers: [cards[5].card.name], massLandDenial: [], extraTurns: [], combos: [] },
      combos: []
    })
    expect(spicy.power).toMatchObject({ estimate: 3, spellbookTag: 'P', gameChangers: [cards[5].card.name] })
    expect(spicy.power.issues[0]).toMatch(/Bracket 2 · Core allows none\.$/)
  })

  it('plays the same solo games every time', () => {
    expect(report.goldfish.landDrops).toBeGreaterThan(0.5)
    expect(report.goldfish.commanderTurn).toBe(3)
    expect(deckReport(cards, flubs, template, 2).goldfish).toEqual(report.goldfish)
  })
})
