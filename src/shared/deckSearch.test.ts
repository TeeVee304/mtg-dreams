import { describe, expect, it } from 'vitest'
import { lookUpCards, searchPool } from './deckSearch'
import { BRIEF, lookup, price, setUp } from './testDecks'

const { pool } = setUp(BRIEF)
const names = (search: Parameters<typeof searchPool>[1], exclude?: Set<string>) =>
  searchPool(pool, search, exclude).cards.map((r) => r.entry.card.name)

describe('searching the cards a deck may play', () => {
  it('finds cards with every word, or an exact phrase, in their rules text', () => {
    const landfall = searchPool(pool, { text: 'landfall counter', limit: 30 })
    expect(landfall.total).toBe(30)
    expect(landfall.cards.every((r) => /landfall/i.test(r.entry.card.text) && /counter/i.test(r.entry.card.text))).toBe(true)
    expect(names({ text: '"discard a land card"' })).toEqual(['Seismic Assault'])
  })

  it('ranks by a slot’s job when given one, and filters by type, price and mana value', () => {
    expect(names({ slot: 'route:burn' }).slice(0, 3)).toEqual(['Seismic Assault', 'Wrenn and Six', 'Glint-Horn Buccaneer'])
    expect(names({ type: 'instant', text: 'damage' }).every((name) => name.startsWith('Bolt') || name === 'Fiery Temper')).toBe(true)
    expect(searchPool(pool, { maxManaValue: 1, limit: 30 }).cards.every((r) => r.entry.card.manaValue <= 1)).toBe(true)
    expect(searchPool(pool, { maxPrice: 1, limit: 30 }).cards.every((r) => (r.entry.price ?? 0) <= 1)).toBe(true)
  })

  it('leaves out cards already in the deck, and never offers ineligible ones', () => {
    expect(names({ text: '"discard a land card"' }, new Set(['seismic assault']))).toEqual([])
    expect(names({ text: 'additional land' })).not.toContain('Pricey Engine')
  })

  it('returns 15 cards unless asked for more, up to 30', () => {
    expect(searchPool(pool, {}).cards).toHaveLength(15)
    expect(searchPool(pool, { limit: 500 }).cards).toHaveLength(30)
  })

  it('names the valid slots when given an unknown one', () => {
    expect(() => searchPool(pool, { slot: 'finisher' })).toThrow(/There is no slot “finisher”. Slots: land, route:burn/)
  })
})

describe('looking cards up by name', () => {
  it('says whether each card can be picked, and why not', () => {
    const found = lookUpCards(
      ['lotus cobra', 'Path to Exile', 'Pricey Engine', 'Exploration', 'Mountain', 'Flubs, the Fool', 'Valakut, the Molten Pinnacle', 'Nope', 'Ferris Wheel'],
      pool,
      lookup,
      price
    )
    expect(found[0]).toMatchObject({ name: 'Lotus Cobra', entry: { price: 6 } })
    expect(found.slice(1).map((f) => ('reason' in f ? f.reason : f.name))).toEqual([
      "Path to Exile is outside Flubs, the Fool's colors.",
      'Pricey Engine costs €25.00, over the €20.00 limit per card.',
      'The player asked to leave out Exploration.',
      'Basic lands like Mountain are added automatically.',
      'Flubs, the Fool is already in the deck as your commander.',
      'Valakut, the Molten Pinnacle is already in the deck as one of your key cards.',
      "“Nope” isn't a card MTG Dreams knows. Use its exact English name.",
      'Ferris Wheel is played from outside the deck, not as one of the 99.'
    ])
  })
})
