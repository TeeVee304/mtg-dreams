import { describe, expect, it } from 'vitest'
import { newBrief, normalizeBrief, routeChoice, routeOptions } from './deckBrief'
import { readCard } from './mechanics'
import type { FocusCard } from './synergy'
import { testCard, type TestCardName } from './testCards'

const focusOn = (...names: TestCardName[]): FocusCard[] => names.map((name) => ({ name, profile: readCard(testCard(name)) }))

describe('ways to win', () => {
  const routes = routeOptions(focusOn('Flubs, the Fool', 'Valakut, the Molten Pinnacle'))
  const route = (id: string) => routes.find((r) => r.id === id)

  it('suggests the routes the commander and key cards point to, first, saying why', () => {
    expect(route('burn')?.why).toBe('Valakut, the Molten Pinnacle deals damage on its own.')
    expect(route('value')?.why).toBe('Flubs, the Fool gets you extra mana.')
    expect(route('land-enters')?.why).toBe(
      'Flubs, the Fool lets you play extra lands each turn, which puts extra lands onto the battlefield.'
    )
    expect(route('discard')?.why).toBe('Flubs, the Fool makes you discard.')
    const firstWithout = routes.findIndex((r) => !r.why)
    expect(routes.slice(firstWithout).every((r) => !r.why)).toBe(true)
    expect(routes.slice(firstWithout).map((r) => r.id)).toEqual(['combat', 'go-wide'])
  })

  it('explains mechanic routes in plain words, with the jargon when it names the payoffs', () => {
    expect(routeChoice('land-enters')).toEqual({
      label: 'Win with lands entering',
      explain: 'Stack cards that trigger whenever a land enters under your control, and win through them.',
      term: 'landfall'
    })
    expect(routeChoice('discard')).not.toHaveProperty('term')
    expect(routeChoice('burn').label).toBe('Burn the table')
  })
})

describe('checking a brief', () => {
  it('keeps valid answers', () => {
    const brief = { ...newBrief('Flubs, the Fool'), anchors: ['Valakut, the Molten Pinnacle'], routes: ['burn', 'land-enters'] }
    expect(normalizeBrief(brief)).toEqual(brief)
  })

  it('needs a commander', () => {
    expect(normalizeBrief({})).toBeNull()
    expect(normalizeBrief({ commander: '  ' })).toBeNull()
  })

  it('falls back to defaults for invalid answers and trims lists to their limits', () => {
    const brief = normalizeBrief({
      commander: ' Flubs, the Fool ',
      anchors: ['A', 'b', 'B', 'C', 'D', 'flubs, the fool'],
      pillar: 'speed',
      routes: ['burn', 'burn', 'teleport', 'value', 'land-enters', 'discard'],
      pace: 7,
      pets: ['A', 'Pet', 42],
      avoid: ['Pet', 'Blood Moon'],
      avoidRoles: ['counterspell', 'land', 'nonsense'],
      budget: { total: -5, perCard: 20, basis: 'cheapest' },
      wildcards: 99
    })
    expect(brief).toMatchObject({
      commander: 'Flubs, the Fool',
      anchors: ['A', 'b', 'C'],
      pillar: 'resources',
      routes: ['burn', 'value', 'land-enters'],
      pace: 'steady',
      pets: ['Pet'],
      avoid: ['Blood Moon'],
      avoidRoles: ['counterspell'],
      budget: { total: null, perCard: 20, basis: 'trend' },
      wildcards: 10
    })
  })
})
