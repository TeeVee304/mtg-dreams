import { describe, expect, it } from 'vitest'
import { newBrief, type DeckBrief } from './deckBrief'
import { DECK_CARDS, deckTemplate, slotInfo, type DeckTemplate, type SlotId } from './deckTemplate'
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
  const plan = deckTemplate(brief({ wincons: ['group-slug', 'beatdown'], engines: ['land-enters'], wildcards: 3 }), flubs, TEMUR)

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

  it('shares the game-winning cards between the win conditions', () => {
    expect(['wincon:group-slug', 'wincon:beatdown'].map((id) => slot(plan, id as SlotId)?.count)).toEqual([4, 4])
    expect(slot(plan, 'wincon:group-slug')).toMatchObject({ label: 'Group Slug', plain: 'Burn and drain the table' })
  })

  it('plays tutors from Bracket 2 up, more as power rises', () => {
    expect(slot(plan, 'tutor')).toMatchObject({ count: 1, why: ['Bracket 2 · Core: 1 tutor to find your best cards.'] })
    expect(slot(deckTemplate(brief({ bracket: 1 }), flubs, TEMUR), 'tutor')).toBeUndefined()
    expect(slot(deckTemplate(brief({ bracket: 4 }), flubs, TEMUR), 'tutor')?.count).toBe(4)
  })

  it('multiplies the engine with cards that do it too or reward it', () => {
    expect(slot(plan, 'engine:land-enters')).toMatchObject({ count: 10, engine: 'land-enters', label: 'Landfall' })
    expect(slot(plan, 'engine:land-enters')?.why[0]).toMatch(/^10 cards that do this too, or reward it, to multiply what Flubs, the Fool/)
  })

  it('leaves the rest to the commander’s theme and the wildcards', () => {
    expect(slot(plan, 'theme')?.count).toBe(10)
    expect(slot(plan, 'wildcard')).toMatchObject({ count: 0, why: ['You asked for 3 wildcards.', '3 fewer wildcards, to leave room for cards that play your plan.'] })
    expect(plan.curveTop).toBe(6)
  })
})

describe('adjusting the plan to the brief', () => {
  it('plays fewer lands and cheaper cards for Aggro, and leaves interaction to the strategy', () => {
    const plan = deckTemplate(brief({ strategy: 'aggro' }), focusOn('Glint-Horn Buccaneer'), ['R'])
    expect(slot(plan, 'land')).toMatchObject({ count: 34, why: expect.arrayContaining(['Aggro: cheap cards need fewer lands.']) })
    expect(plan.curveTop).toBe(4)
    expect(slot(plan, 'removal')?.why).toContain('Aggro decks interact lightly: fewer answers, more room for your own plan.')
  })

  it('adds answers for lots of interaction, counterspells only in blue', () => {
    const some = deckTemplate(brief(), focusOn('Glint-Horn Buccaneer'), ['R'])
    const blue = deckTemplate(brief({ interaction: 'heavy' }), flubs, TEMUR)
    expect(slot(blue, 'counterspell')?.count).toBe(4)
    expect(slot(blue, 'removal')!.count).toBe(slot(some, 'removal')!.count + 3)
    const red = deckTemplate(brief({ interaction: 'heavy' }), focusOn('Glint-Horn Buccaneer'), ['R'])
    expect(slot(red, 'counterspell')).toBeUndefined()
    expect(slot(red, 'removal')!.count).toBe(slot(some, 'removal')!.count + 5)
    expect(total(red)).toBe(DECK_CARDS)
  })

  it('plays fewer answers for little interaction', () => {
    const some = deckTemplate(brief(), focusOn('Glint-Horn Buccaneer'), ['R'])
    const light = deckTemplate(brief({ interaction: 'light' }), focusOn('Glint-Horn Buccaneer'), ['R'])
    expect(slot(light, 'removal')!.count).toBe(slot(some, 'removal')!.count - 3)
    expect(slot(light, 'board-wipe')!.count).toBe(slot(some, 'board-wipe')!.count - 1)
    expect(total(light)).toBe(DECK_CARDS)
  })

  it('protects and gets through one huge threat', () => {
    const some = deckTemplate(brief(), focusOn('Glint-Horn Buccaneer'), ['R'])
    const voltron = deckTemplate(brief({ wincons: ['voltron'] }), focusOn('Glint-Horn Buccaneer'), ['R'])
    expect(slot(voltron, 'wincon:voltron')?.count).toBe(8)
    expect(slot(voltron, 'protection')!.count).toBe((slot(some, 'protection')?.count ?? 0) + 2)
    expect(total(voltron)).toBe(DECK_CARDS)
  })

  it('names any slot from its id', () => {
    expect(slotInfo('wincon:voltron')).toMatchObject({ label: 'Voltron', plain: 'One huge threat' })
    expect(slotInfo('engine:land-creatures')).toMatchObject({ label: 'Animated Lands', plain: 'Lands as creatures' })
    expect(slotInfo('ramp')).toMatchObject({ label: 'Ramp', plain: 'Mana boost' })
    expect(slotInfo('theme')).toMatchObject({ label: 'Synergy', plain: 'Your plan' })
  })

  it('leaves out kinds of cards the player avoids, saying so', () => {
    const plan = deckTemplate(brief({ avoidRoles: ['board-wipe'] }), flubs, TEMUR)
    expect(slot(plan, 'board-wipe')).toMatchObject({ count: 0, why: ['You asked to leave these out.'] })
    expect(total(plan)).toBe(DECK_CARDS)
  })

  it('keeps room for the theme by cutting wildcards first', () => {
    const plan = deckTemplate(brief({ interaction: 'heavy', strategy: 'big-mana', wildcards: 10, wincons: ['group-slug', 'beatdown'], engines: ['land-enters', 'discard'] }), flubs, TEMUR)
    expect(slot(plan, 'theme')!.count).toBeGreaterThanOrEqual(10)
    expect(slot(plan, 'wildcard')!.count).toBeLessThan(10)
    expect(slot(plan, 'wildcard')?.why.at(-1)).toMatch(/fewer wildcards?, to leave room/)
    expect(total(plan)).toBe(DECK_CARDS)
  })
})
