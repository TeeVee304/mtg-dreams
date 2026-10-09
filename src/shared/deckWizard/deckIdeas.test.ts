import { describe, expect, it } from 'vitest'
import type { Combo } from './combos'
import { deckIdeas, MAX_IDEAS } from './deckIdeas'
import { engineSignal, MIN_FIT } from './deckPool'
import { BRIEF, setUp } from './testDecks'

const flubs = setUp(BRIEF)
const focus = flubs.context.focus

describe('deck ideas', () => {
  const ideas = deckIdeas(focus, flubs.pool)

  it('offers a few concepts in community words, each with a theme, a win condition and a strategy', () => {
    expect(ideas.length).toBeGreaterThan(0)
    expect(ideas.length).toBeLessThanOrEqual(MAX_IDEAS)
    const landfall = ideas.find((idea) => idea.engines.includes('land-enters'))!
    expect(landfall.title).toMatch(/^Landfall /)
    expect(landfall.tags.map((t) => t.label)).toContain('Landfall')
    expect(landfall.pitch).toMatch(/^Flubs, the Fool .*\. Win with /)
    expect(new Set(ideas.map((idea) => idea.id)).size).toBe(ideas.length)
  })

  it('shows sample cards from the cards the deck may play, that carry the theme', () => {
    for (const idea of ideas) {
      expect(idea.samples.length).toBeGreaterThan(0)
      expect(idea.samples.every((name) => flubs.pool.eligible.has(name.toLowerCase()))).toBe(true)
    }
    const landfall = ideas.find((idea) => idea.engines.includes('land-enters'))!
    const carries = (name: string) => (engineSignal('land-enters', flubs.pool.eligible.get(name.toLowerCase())!.profile)?.weight ?? 0) >= MIN_FIT
    expect(landfall.samples.every(carries)).toBe(true)
  })

  it('leads with a combo of the commander when the bracket allows it', () => {
    const combo: Combo = { id: 'c', cards: ['Flubs, the Fool', 'Seismic Assault'], results: ['Infinite damage'], steps: '', manaValue: 6, popularity: 10 }
    expect(deckIdeas(focus, flubs.pool, [combo])[0].wincons).not.toContain('combo')
    const high = setUp({ ...BRIEF, bracket: 4 })
    const first = deckIdeas(high.context.focus, high.pool, [combo])[0]
    expect(first).toMatchObject({ strategy: 'combo', wincons: ['combo'], samples: ['Seismic Assault'] })
    expect(first.pitch).toMatch(/^Flubs, the Fool \+ Seismic Assault: infinite damage\./)
  })
})
