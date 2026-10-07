import { describe, expect, it } from 'vitest'
import { readCard } from './mechanics'
import { conflictsWith, explainConflict, explainLink, linksTo, rankCandidates, scoreLinks, type FocusCard } from './synergy'
import { testCard, testCards, type TestCardName } from './testCards'

const focusOn = (...names: TestCardName[]): FocusCard[] => names.map((name) => ({ name, profile: readCard(testCard(name)) }))
const flubsAndValakut = focusOn('Flubs, the Fool', 'Valakut, the Molten Pinnacle')
const profile = (name: TestCardName) => readCard(testCard(name))

describe('connecting cards to the commander and key cards', () => {
  it('explains how a card feeds the deck, and how the deck feeds it', () => {
    const links = linksTo(profile('Crucible of Worlds'), flubsAndValakut)
    expect(links.map((link) => explainLink('Crucible of Worlds', link))).toEqual([
      'Crucible of Worlds gives you more lands to play — Flubs, the Fool triggers when you play a land.',
      'Flubs, the Fool makes you discard, which puts land cards into your graveyard — Crucible of Worlds uses land cards from your graveyard.'
    ])
  })

  it('weighs effects on all your lands at once above one land at a time', () => {
    const [omen] = linksTo(profile('Prismatic Omen'), flubsAndValakut)
    const [mountain] = linksTo(profile('Mountain'), flubsAndValakut)
    expect(omen).toMatchObject({ focus: 'Valakut, the Molten Pinnacle', mechanic: 'type-mountain', weight: 1.5 })
    expect(mountain.weight).toBe(1)
  })

  it('flags cards that turn off what a key card does or needs, in plain words', () => {
    const [moon] = conflictsWith(profile('Blood Moon'), flubsAndValakut)
    expect(explainConflict('Blood Moon', moon)).toBe(
      'Blood Moon turns off the abilities of nonbasic lands — Valakut, the Molten Pinnacle is a land with a special ability.'
    )
    const [harmonize] = conflictsWith(profile('Harmonize'), flubsAndValakut)
    expect(explainConflict('Harmonize', harmonize)).toBe('Harmonize fills your hand with cards — Flubs, the Fool wants your hand empty.')
    expect(conflictsWith(profile('Faithless Looting'), flubsAndValakut)).toEqual([])
  })

  it('counts each extra link to the same key card for less', () => {
    const links = linksTo(profile('Crucible of Worlds'), flubsAndValakut)
    expect(scoreLinks(links)).toBe(1 + 0.5 / 2)
    // One strong link to each key card beats the same weights piled on one.
    const both = [
      { ...links[0], focus: 'A', weight: 1 },
      { ...links[0], focus: 'B', weight: 1 }
    ]
    const one = both.map((link) => ({ ...link, focus: 'A' }))
    expect(scoreLinks(both)).toBeGreaterThan(scoreLinks(one))
  })
})

describe('ranking candidates', () => {
  const candidates = testCards().map((card) => ({ card, profile: readCard(card) }))
  const ranked = rankCandidates(candidates, flubsAndValakut, { identity: ['G', 'R', 'U'], format: 'commander' })
  const names = ranked.map((c) => c.card.name)

  it('keeps to the color identity and leaves out the key cards themselves', () => {
    expect(names).not.toContain('Rest in Peace')
    expect(names).not.toContain('Path to Exile')
    expect(names).not.toContain('Flubs, the Fool')
    expect(names).not.toContain('Valakut, the Molten Pinnacle')
  })

  it('puts cards that serve both key cards first', () => {
    expect(names.slice(0, 3)).toEqual(expect.arrayContaining(['Prismatic Omen', 'Cultivate']))
    expect(names.indexOf('Cultivate')).toBeLessThan(names.indexOf('Lotus Cobra'))
  })

  it('keeps conflicting cards ranked, with their warnings', () => {
    const moon = ranked.find((c) => c.card.name === 'Blood Moon')
    expect(moon?.conflicts.map((c) => c.mechanic)).toEqual(['nonbasic-utility'])
    const tatyova = ranked.find((c) => c.card.name === 'Tatyova, Benthic Druid')
    expect(tatyova?.conflicts).toMatchObject([{ mechanic: 'empty-hand', weight: 0.3 }])
  })

  it('leaves out cards without any connection', () => {
    expect(names).not.toContain('Rhystic Study')
    expect(ranked.every((c) => c.score > 0)).toBe(true)
  })
})
