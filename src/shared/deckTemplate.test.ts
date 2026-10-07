import { describe, expect, it } from 'vitest'
import { newBrief, type DeckBrief } from './deckBrief'
import { DECK_CARDS, deckTemplate, type DeckTemplate, type SlotId } from './deckTemplate'
import { readCard } from './mechanics'
import type { FocusCard } from './synergy'
import { testCard, type TestCardName } from './testCards'

const focusOn = (...names: TestCardName[]): FocusCard[] => names.map((name) => ({ name, profile: readCard(testCard(name)) }))
const TEMUR = ['G', 'R', 'U']
const flubs = focusOn('Flubs, the Fool', 'Valakut, the Molten Pinnacle')
const brief = (changes: Partial<DeckBrief> = {}): DeckBrief => ({ ...newBrief('Flubs, the Fool'), ...changes })
const slot = (template: DeckTemplate, id: SlotId) => template.slots.find((s) => s.id === id)
const total = (template: DeckTemplate) => template.slots.reduce((sum, s) => sum + s.count, 0)

describe('the 99-card plan', () => {
  const plan = deckTemplate(brief({ pillar: 'win-condition', routes: ['burn', 'land-enters', 'value'], wildcards: 3 }), flubs, TEMUR)

  it('adds up to 99 cards', () => {
    expect(total(plan)).toBe(DECK_CARDS)
  })

  it('plays more lands for land-hungry key cards, saying why', () => {
    expect(slot(plan, 'land')).toMatchObject({ count: 40 })
    expect(slot(plan, 'land')?.why).toEqual([
      'Commander decks usually play 36 to 38 lands.',
      'Flubs, the Fool triggers when you play a land, so the deck plays 2 more lands to keep it going.',
      'Valakut, the Molten Pinnacle counts your Mountains, so the deck plays 1 more land to keep it going.',
      'Up to 18 can be nonbasic lands that make more than one color or help your plan; basic lands fill the rest.'
    ])
  })

  it('plays fewer cards that draw a lot for a commander that wants an empty hand', () => {
    expect(slot(plan, 'card-advantage')?.count).toBe(6)
    expect(slot(plan, 'card-advantage')?.why).toContain(
      'Flubs, the Fool wants your hand empty, so the deck plays fewer cards that draw a lot.'
    )
    expect(slot(plan, 'ramp')?.why).toContain('Flubs, the Fool already gets you extra mana.')
  })

  it('shares the game-winning cards between the ways to win', () => {
    expect(['route:burn', 'route:land-enters', 'route:value'].map((id) => slot(plan, id as SlotId)?.count)).toEqual([4, 3, 3])
    expect(slot(plan, 'route:land-enters')).toMatchObject({ label: 'Win with lands entering', term: 'landfall' })
    expect(slot(plan, 'tutor')?.count).toBe(2)
  })

  it('leaves the rest to the commander’s theme and the wildcards', () => {
    expect(slot(plan, 'wildcard')?.count).toBe(3)
    expect(slot(plan, 'theme')?.count).toBe(17)
    expect(plan.curveTop).toBe(6)
  })
})

describe('adjusting the plan to the brief', () => {
  it('plays fewer lands and cheaper cards for a quick start', () => {
    const plan = deckTemplate(brief({ pace: 'fast' }), focusOn('Glint-Horn Buccaneer'), ['R'])
    expect(slot(plan, 'land')?.count).toBe(34)
    expect(plan.curveTop).toBe(4)
  })

  it('adds counterspells for interaction only in blue', () => {
    const blue = deckTemplate(brief({ pillar: 'interaction' }), flubs, TEMUR)
    expect(slot(blue, 'counterspell')?.count).toBe(3)
    expect(slot(blue, 'removal')?.count).toBe(11)
    const red = deckTemplate(brief({ pillar: 'interaction' }), focusOn('Glint-Horn Buccaneer'), ['R'])
    expect(slot(red, 'counterspell')).toBeUndefined()
    expect(slot(red, 'removal')?.count).toBe(13)
  })

  it('leaves out kinds of cards the player avoids, saying so', () => {
    const plan = deckTemplate(brief({ avoidRoles: ['board-wipe'] }), flubs, TEMUR)
    expect(slot(plan, 'board-wipe')).toMatchObject({ count: 0, why: ['You asked to leave these out.'] })
    expect(total(plan)).toBe(DECK_CARDS)
  })

  it('keeps room for the theme by cutting wildcards first', () => {
    const plan = deckTemplate(brief({ pillar: 'interaction', pace: 'big', wildcards: 10, routes: ['burn', 'value', 'combat'] }), flubs, TEMUR)
    expect(slot(plan, 'theme')!.count).toBeGreaterThanOrEqual(10)
    expect(slot(plan, 'wildcard')!.count).toBeLessThan(10)
    expect(slot(plan, 'wildcard')?.why.at(-1)).toMatch(/fewer wildcards?, to leave room/)
    expect(total(plan)).toBe(DECK_CARDS)
  })
})
