import { describe, expect, it } from 'vitest'
import { communityStats, readDecks, type CommunityDeck } from './community'
import { draftDeck } from './deckDraft'
import { deckIdeas } from './deckIdeas'
import { deckReport, stapleReport } from './deckReport'
import { PRECON_IDEA } from './deckPool'
import { BRIEF, lookup, price, setUp } from './testDecks'

/** Precons over the test library: Flubs's own, two other green decks, one red. */
const DECKS: CommunityDeck[] = [
  {
    id: 'FlubsPrecon',
    name: 'Fool’s Errand',
    commanders: ['Flubs, the Fool'],
    cards: ['Mana Rock 20', 'Bolt 1', 'Landfall Beast 1', 'Landfall Beast 2', 'Landfall Beast 3', 'Lotus Cobra', 'Mountain']
  },
  { id: 'Goblins', name: 'Goblin Gang', commanders: ['Krenko, Mob Boss'], cards: ['Mana Rock 20', 'Bolt 2', 'Ember 1'] },
  {
    id: 'Hoard',
    name: 'Hoard',
    commanders: ['Korvold, Fae-Cursed King'],
    cards: ['Mana Rock 20', 'Landfall Beast 2', 'Landfall Beast 4', 'Landfall Beast 5', 'Lotus Cobra']
  },
  { id: 'Superfriends', name: 'Superfriends', commanders: ["Atraxa, Praetors' Voice"], cards: ['Mana Rock 20', 'Bear 1', 'Bear 2', 'Shield 1'] },
  // Left out: a collector's edition of the first, and a deck led by an unknown card.
  { id: 'FlubsPreconCE', name: 'Fool’s Errand CE', commanders: ['Flubs, the Fool'], cards: ['Mana Rock 20'] },
  { id: 'Unknown', name: 'Unknown', commanders: ['Nobody'], cards: ['Mana Rock 20'] }
]
const READ = readDecks(DECKS, lookup)
const STATS = communityStats(READ, 'Flubs, the Fool', ['G', 'U', 'R'], ['land-enters'], lookup)

describe('reading precons', () => {
  it('takes colors from the commanders, and themes from what many cards and the commanders carry', () => {
    expect(READ.map((d) => d.deck.id)).toEqual(['FlubsPrecon', 'Goblins', 'Hoard', 'Superfriends'])
    expect([...READ[2].identity].sort()).toEqual(['B', 'G', 'R'])
    expect(READ[0].themes.has('land-enters')).toBe(true)
    expect(READ[2].themes.has('land-enters')).toBe(true)
    expect(READ[3].themes.has('land-enters')).toBe(false)
  })
})

describe('community statistics', () => {
  const score = (name: string) => STATS.scores.get(name.toLowerCase())

  it('rates a card by the share of decks that could play it that do, smoothed', () => {
    // Every deck plays it: 4 of 4, plus 3 for smoothing.
    expect(score('Mana Rock 20')?.staple).toBeCloseTo(4 / 7)
    // Red: the three red decks could play it; one does.
    expect(score('Bolt 1')?.staple).toBeCloseTo(1 / 6)
    expect(STATS.staples[0]).toEqual({ name: 'Mana Rock 20', rate: 4 / 7 })
  })

  it('rates theme cards by how much more decks on the theme play them', () => {
    // Green decks could play it (3); the two Landfall decks both do.
    expect(score('Lotus Cobra')).toMatchObject({ staple: 2 / 6, themeId: 'land-enters' })
    expect(score('Lotus Cobra')!.theme).toBeCloseTo(2 / 5 - 2 / 6)
    expect(score('Mana Rock 20')!.theme).toBe(0)
  })

  it('knows the commander’s own precon, and leaves out cards outside its colors', () => {
    expect(STATS.own?.id).toBe('FlubsPrecon')
    expect(score('Landfall Beast 1')?.own).toBe(true)
    expect(score('Ember 1')?.own).toBe(false)
    expect(score('Bear 1')?.own).toBe(false)
    expect(STATS.decks).toBe(4)
  })
})

describe('building with community statistics', () => {
  const brief = { ...BRIEF, pets: [], avoid: ['Mana Rock 1'] }
  const without = setUp(brief)
  const withStats = setUp(brief, undefined, STATS)
  const names = (pool: typeof without.pool) => draftDeck(pool).picks.map((p) => p.name)

  it('picks the staple the precons play, and says so', () => {
    expect(names(without.pool)).not.toContain('Mana Rock 20')
    const pick = draftDeck(withStats.pool).picks.find((p) => p.name === 'Mana Rock 20')
    expect(pick?.reason).toMatch(/Flubs, the Fool's own precon, Fool’s Errand, plays it\.$/)
  })

  it('offers building on the commander’s own precon first', () => {
    const [idea] = deckIdeas(withStats.focus, withStats.pool)
    expect(idea).toMatchObject({ id: `${PRECON_IDEA}FlubsPrecon`, title: 'Fool’s Errand, upgraded' })
    expect(idea.tags[0].label).toBe('Precon')
    expect(idea.samples).toEqual(expect.arrayContaining(['Lotus Cobra']))
  })

  it('reports the staples, and why one is missing', () => {
    const deck = names(withStats.pool)
    const report = stapleReport(withStats.pool, deck, lookup, price)!
    expect(report.decks).toBe(4)
    expect(report.cards.find((c) => c.name === 'Mana Rock 20')).toMatchObject({ inDeck: true })
    const avoided = stapleReport(setUp({ ...brief, avoid: ['Mana Rock 20'] }, undefined, STATS).pool, deck.filter((n) => n !== 'Mana Rock 20'), lookup, price)!
    expect(avoided.cards.find((c) => c.name === 'Mana Rock 20')).toMatchObject({ inDeck: false, why: 'The player asked to leave out Mana Rock 20.' })
    expect(stapleReport(without.pool, deck, lookup, price)).toBeNull()
    const flubs = lookup('Flubs, the Fool')!
    expect(deckReport([], flubs, withStats.template, 2, undefined, report).staples).toBe(report)
  })
})
