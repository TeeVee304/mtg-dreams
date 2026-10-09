import { describe, expect, it } from 'vitest'
import type { BracketFacts } from './combos'
import { checkDeck } from './deckCheck'
import { draftDeck } from './deckDraft'
import { optimizeDeck } from './deckOptimizer'
import { BRIEF, libraryWith, setUp } from './testDecks'
import type { DeckBrief } from './deckBrief'
import type { LibraryCard } from './libraryCard'

/** Builds and optimizes a deck for a brief over the fixture library, changed as given. */
function build(brief: DeckBrief = BRIEF, changes: Record<string, Partial<LibraryCard>> = {}, facts: BracketFacts | null = null) {
  const { pool, context } = setUp(brief, libraryWith(changes))
  const seed = draftDeck(pool)
  const deck = optimizeDeck(pool, seed, { facts })
  return { pool, seed, deck, check: checkDeck(deck.picks, context), names: deck.picks.map((p) => p.name) }
}

/** Changes making cards Game Changers, among the strongest cards. */
const changers = (names: string[]): Record<string, Partial<LibraryCard>> =>
  Object.fromEntries(names.map((name) => [name, { gameChanger: true, edhrecRank: 5 }]))

describe('optimizing the 99', () => {
  const { seed, deck, check } = build()

  it('keeps a legal 99 within the budget, never worse than the draft it started from', () => {
    expect(check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(check.cards).toBe(99)
    expect(check.total).toBeLessThanOrEqual(200)
    expect(deck.value).toBeGreaterThanOrEqual(deck.seedValue)
  })

  it('keeps the key card, the pet card, lands and wildcards where the draft put them', () => {
    const kept = seed.picks.filter((p) => p.slot === 'land' || p.slot === 'wildcard' || /^(Your key card|One of your pet cards)\./.test(p.reason))
    for (const pick of kept) expect(deck.picks).toContainEqual(pick)
  })

  it('gives the same deck for the same input', () => {
    expect(build().deck.picks).toEqual(deck.picks)
  })

  it('keeps cards the player locked', () => {
    const theme = seed.picks.find((p) => p.slot === 'theme')!.name
    expect(build({ ...BRIEF, locks: [theme] }).names).toContain(theme)
  })

  it('picks stronger cards for the same job', () => {
    const strong = build(BRIEF, { 'Bolt 20': { edhrecRank: 3 } })
    expect(strong.names).toContain('Bolt 20')
  })
})

describe('keeping to the bracket', () => {
  const bolts = ['Bolt 1', 'Bolt 2', 'Bolt 3', 'Bolt 4', 'Bolt 5']

  it('plays no Game Changers in Bracket 2, and at most three in Bracket 3', () => {
    expect(build({ ...BRIEF, bracket: 2 }, changers(bolts)).names.filter((n) => bolts.includes(n))).toEqual([])
    const upgraded = build({ ...BRIEF, bracket: 3 }, changers(bolts)).names.filter((n) => bolts.includes(n))
    expect(upgraded.length).toBe(3)
    expect(build({ ...BRIEF, bracket: 4 }, changers(bolts)).names.filter((n) => bolts.includes(n)).length).toBeGreaterThan(3)
  })

  it('never lets a two-card combo the bracket forbids come together', () => {
    const { seed } = build()
    const piece = seed.picks.find((p) => p.slot === 'wincon:group-slug' && !/key card|pet card/.test(p.reason))!.name
    const facts: BracketFacts = {
      tag: null,
      gameChangers: [],
      massLandDenial: [],
      extraTurns: [],
      combos: [{ cards: ['Flubs, the Fool', piece], twoCard: true, lock: false, manaValue: 4 }]
    }
    expect(build(BRIEF, {}, facts).names).not.toContain(piece)
    expect(build({ ...BRIEF, bracket: 4 }, {}, facts).names).toContain(piece)
  })
})
