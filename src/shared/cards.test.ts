import { describe, expect, it } from 'vitest'
import {
  compareCards,
  isBasicLand,
  isSortKey,
  matchesColors,
  matchesFilters,
  NO_FILTERS,
  sortFor,
  typeGroup,
  type CardFilters
} from './cards'
import type { CardInfo } from './types'

function info(overrides: Partial<CardInfo>): CardInfo {
  return {
    name: 'Card', colors: [], colorIdentity: [], typeLine: 'Instant', manaValue: 1, rarity: 'common', legalities: {},
    ...overrides
  }
}

const bolt = info({ name: 'Lightning Bolt', colors: ['R'], colorIdentity: ['R'], typeLine: 'Instant', manaValue: 1 })
const niv = info({
  name: 'Niv-Mizzet, Parun', colorIdentity: ['U', 'R'], typeLine: 'Legendary Creature — Dragon Wizard', manaValue: 6, rarity: 'rare'
})
const tower = info({ name: 'Command Tower', typeLine: 'Land', manaValue: 0 })
const delver = info({
  name: 'Delver of Secrets // Insectile Aberration', colorIdentity: ['U'],
  typeLine: 'Creature — Human Wizard // Creature — Human Insect'
})
const filters = (overrides: Partial<CardFilters>): CardFilters => ({ ...NO_FILTERS, ...overrides })

describe('isBasicLand', () => {
  it('knows basics, snow basics and Wastes', () => {
    expect(isBasicLand('Island')).toBe(true)
    expect(isBasicLand('snow-covered forest')).toBe(true)
    expect(isBasicLand('Wastes')).toBe(true)
    expect(isBasicLand('Command Tower')).toBe(false)
  })
})

describe('matchesColors', () => {
  it('"any" matches cards sharing a color, C matches colorless', () => {
    expect(matchesColors(['U', 'R'], ['R'], 'any')).toBe(true)
    expect(matchesColors(['G'], ['R'], 'any')).toBe(false)
    expect(matchesColors([], ['C'], 'any')).toBe(true)
    expect(matchesColors([], ['R'], 'any')).toBe(false)
  })

  it('"exact" needs the same colors', () => {
    expect(matchesColors(['U', 'R'], ['R', 'U'], 'exact')).toBe(true)
    expect(matchesColors(['R'], ['R', 'U'], 'exact')).toBe(false)
    expect(matchesColors([], ['C'], 'exact')).toBe(true)
  })

  it('"within" fits a color identity; colorless always fits', () => {
    expect(matchesColors(['R'], ['U', 'R'], 'within')).toBe(true)
    expect(matchesColors(['U', 'R'], ['R'], 'within')).toBe(false)
    expect(matchesColors([], ['G'], 'within')).toBe(true)
  })
})

describe('matchesFilters', () => {
  it('filters by name without needing card data', () => {
    expect(matchesFilters('Lightning Bolt', undefined, undefined, filters({ name: 'bolt' }))).toBe(true)
    expect(matchesFilters('Lightning Bolt', undefined, undefined, filters({ name: 'helix' }))).toBe(false)
  })

  it('hides cards without data when other filters are on', () => {
    expect(matchesFilters('Lightning Bolt', undefined, undefined, filters({ type: 'Instant' }))).toBe(false)
  })

  it('filters by type (any face), legendary and rarity', () => {
    expect(matchesFilters(niv.name, niv, undefined, filters({ type: 'Creature', legendary: true }))).toBe(true)
    expect(matchesFilters(bolt.name, bolt, undefined, filters({ legendary: true }))).toBe(false)
    expect(matchesFilters(delver.name, delver, undefined, filters({ type: 'Creature' }))).toBe(true)
    expect(matchesFilters(tower.name, tower, undefined, filters({ type: 'Land', colors: ['C'] }))).toBe(true)
    // The specific printing's rarity wins over the card's default rarity.
    expect(matchesFilters(bolt.name, bolt, 'uncommon', filters({ rarities: ['uncommon'] }))).toBe(true)
    expect(matchesFilters(bolt.name, bolt, undefined, filters({ rarities: ['uncommon'] }))).toBe(false)
  })
})

describe('compareCards', () => {
  const cards = [niv, tower, bolt, delver].map((card) => ({ name: card.name, info: card }))
  const order = (sort: Parameters<typeof compareCards>[0]) =>
    [...cards].sort((a, b) => compareCards(sort, a, b)).map((c) => c.name.split(' ')[0])

  it('sorts by color: mono in WUBRG order, then multicolor, then colorless', () => {
    expect(order('color')).toEqual(['Delver', 'Lightning', 'Niv-Mizzet,', 'Command'])
  })

  it('sorts by mana value and type', () => {
    expect(order('mana')).toEqual(['Command', 'Delver', 'Lightning', 'Niv-Mizzet,'])
    expect(order('type')).toEqual(['Delver', 'Niv-Mizzet,', 'Lightning', 'Command'])
  })

  it('puts cards without data last', () => {
    const sorted = [{ name: 'Unknown' }, { name: 'Bolt', info: bolt }].sort((a, b) => compareCards('mana', a, b))
    expect(sorted[0].name).toBe('Bolt')
  })
})

describe('sortFor', () => {
  it('applies the one chosen sort everywhere it exists', () => {
    for (const view of ['deck', 'wishlist', 'inventory'] as const) {
      expect(sortFor(view, 'mana')).toBe('mana')
      expect(sortFor(view, 'qty')).toBe('qty')
    }
    expect(sortFor('wishlist', 'needed')).toBe('needed')
  })

  it('falls back to the closest sort a view offers', () => {
    expect(sortFor('deck', 'needed')).toBe('unit')
    // Price sorts map to each other: lists sort by unit price, the inventory by value.
    expect(sortFor('inventory', 'needed')).toBe('value')
    expect(sortFor('inventory', 'unit')).toBe('value')
    expect(sortFor('wishlist', 'value')).toBe('unit')
    expect(sortFor('inventory', 'file')).toBe('name')
    expect(sortFor('deck', 'type')).toBe('file')
  })

  it('recognises saved sort keys', () => {
    expect(isSortKey('rarity')).toBe(true)
    expect(isSortKey('price')).toBe(false)
  })
})

describe('typeGroup', () => {
  it('uses the front face, preferring Creature, then Land', () => {
    expect(typeGroup(info({ typeLine: 'Artifact Creature — Golem' }))).toBe('Creature')
    expect(typeGroup(info({ typeLine: 'Artifact Land' }))).toBe('Land')
    expect(typeGroup(info({ typeLine: 'Basic Land — Island' }))).toBe('Land')
    expect(typeGroup(info({ typeLine: 'Kindred Instant — Elf' }))).toBe('Instant')
    expect(typeGroup(info({ typeLine: 'Instant // Land' }))).toBe('Instant')
    expect(typeGroup(delver)).toBe('Creature')
    expect(typeGroup(undefined)).toBe('Other')
  })
})
