import { describe, expect, it } from 'vitest'
import {
  companionBreaks,
  companionCondition,
  companionDeckBreak,
  companionOf,
  COMPANION_RULES,
  hasActivatedAbility,
  identityException,
  listCompanion,
  repeatsManaSymbol,
  rulebreakerColor,
  rulebreakerOf,
  RULEBREAKERS,
  withCompanion,
  withRulebreakerColor,
  type CompanionRule,
  type DeckCard
} from './deckRules'
import { parseList, serializeList } from './decklist'
import type { CardInfo } from './types'

const info = (name: string, typeLine: string, extra: Partial<CardInfo> = {}): CardInfo => ({
  name,
  colors: [],
  colorIdentity: [],
  typeLine,
  manaValue: 2,
  rarity: 'rare',
  legalities: { commander: 'legal' },
  ...extra
})

describe('the rules table', () => {
  it('lists the 8 Rulebreakers and the 10 Companions', () => {
    expect(Object.keys(RULEBREAKERS)).toHaveLength(8)
    expect(Object.keys(COMPANION_RULES)).toHaveLength(10)
  })

  it('finds a card by name, and leaves a new Rulebreaker or Companion unchecked', () => {
    expect(rulebreakerOf('Whtz, the Bibliophile', 'Rulebreaker — …')).toEqual({ noMaxSize: true })
    expect(rulebreakerOf('Someone New', 'Rulebreaker — A deck with this commander can have anything.')).toEqual({ unknown: true })
    expect(rulebreakerOf('Grizzly Bears', '')).toBeUndefined()
    expect(companionOf('Lurrus of the Dream-Den', 'Companion — …')).toEqual({ kind: 'maxPermanentManaValue', max: 2 })
    expect(companionOf('Someone New', 'Companion — Something new.')).toEqual({ kind: 'other' })
    expect(companionOf('Lifelink Bear', 'Lifelink')).toBeUndefined()
  })

  it('names each condition for its problems', () => {
    expect(companionCondition(COMPANION_RULES['Lurrus of the Dream-Den'])).toBe('permanents of mana value 2 or less')
    expect(companionCondition(COMPANION_RULES['Kaheera, the Orphanguard'])).toBe('every creature is a Cat, Elemental, Nightmare, Dinosaur, Beast')
    expect(companionCondition(COMPANION_RULES['Yorion, Sky Nomad'])).toBe('20 Cards over the minimum Deck size')
  })
})

describe('identityException', () => {
  const identity = ['B']
  const rulebreaker = (name: string) => info(name, 'Legendary Creature', { rulebreaker: RULEBREAKERS[name] })
  const valko = rulebreaker('Valko Indorian')
  const tolabow = rulebreaker('Tolabow, Loch Rascal')
  const grizzlegom = rulebreaker('Grizzlegom, Hurloon Hero')
  const lets = (card: CardInfo, colors: string[], commanders: CardInfo[], chosen: string | null = null) =>
    identityException(card, colors, commanders, chosen)?.name ?? null

  it("names the Rulebreaker letting its cards and basic lands past the color identity", () => {
    expect(lets(info('Elesh Norn', 'Legendary Creature — Phyrexian Praetor', { colorIdentity: ['W'] }), identity, [valko])).toBe('Valko Indorian')
    expect(lets(info('Plains', 'Basic Land — Plains', { colorIdentity: ['W'] }), identity, [valko])).toBe('Valko Indorian')
    expect(lets(info('Hallowed Fountain', 'Land — Plains Island', { colorIdentity: ['W', 'U'] }), identity, [valko])).toBeNull()
    expect(lets(info('Hallowed Fountain', 'Land — Plains Island', { colorIdentity: ['W', 'U'] }), identity, [grizzlegom])).toBe('Grizzlegom, Hurloon Hero')
    expect(lets(info('Swords to Plowshares', 'Instant', { colorIdentity: ['W'] }), identity, [valko])).toBeNull()
  })

  it('needs no exception for a card within the colors', () => {
    expect(lets(info('Swamp', 'Basic Land — Swamp', { colorIdentity: ['B'] }), identity, [valko])).toBeNull()
  })

  it("adds the chosen color to Tolabow's instants and sorceries only", () => {
    const bolt = info('Lightning Bolt', 'Instant', { colorIdentity: ['R'] })
    expect(lets(bolt, ['U'], [tolabow])).toBeNull()
    expect(lets(bolt, ['U'], [tolabow], 'R')).toBe('Tolabow, Loch Rascal')
    expect(lets(info('Electrolyze', 'Instant', { colorIdentity: ['U', 'R'] }), ['U'], [tolabow], 'R')).toBe('Tolabow, Loch Rascal')
    expect(lets(info('Terminate', 'Instant', { colorIdentity: ['B', 'R'] }), ['U'], [tolabow], 'R')).toBeNull()
    expect(lets(info('Goblin Guide', 'Creature — Goblin', { colorIdentity: ['R'] }), ['U'], [tolabow], 'R')).toBeNull()
  })

  it('needs a Rulebreaker commander', () => {
    expect(lets(info('Plains', 'Basic Land — Plains', { colorIdentity: ['W'] }), identity, [info('Other', 'Legendary Creature')])).toBeNull()
  })
})

describe('companionBreaks', () => {
  const card = (name: string, typeLine: string, extra: Partial<CardInfo> = {}, qty = 1): DeckCard => ({ name, qty, info: info(name, typeLine, extra) })
  const deck = [
    card('Atraxa', 'Legendary Creature — Phyrexian Angel Horror', { manaValue: 4 }),
    card('Sol Ring', 'Artifact', { manaValue: 1, activated: true }),
    card('Lightning Bolt', 'Instant', { manaValue: 1 }),
    card('Cryptolith Rite', 'Enchantment', { manaValue: 2, repeatsSymbol: true }),
    card('Forest', 'Basic Land — Forest', { manaValue: 0 }, 30),
    card('Command Tower', 'Land', { manaValue: 0, activated: true })
  ]
  const breaks = (rule: CompanionRule) => companionBreaks(rule, deck)

  it('names the cards that break each condition', () => {
    expect(breaks({ kind: 'even' })).toEqual(['Sol Ring', 'Lightning Bolt'])
    expect(breaks({ kind: 'odd' })).toEqual(['Atraxa', 'Cryptolith Rite'])
    expect(breaks({ kind: 'symbols' })).toEqual(['Cryptolith Rite'])
    expect(breaks({ kind: 'creatureTypes', types: ['Cat', 'Beast'] })).toEqual(['Atraxa'])
    expect(breaks({ kind: 'minManaValue', min: 3 })).toEqual(['Sol Ring', 'Lightning Bolt', 'Cryptolith Rite'])
    expect(breaks({ kind: 'maxPermanentManaValue', max: 2 })).toEqual(['Atraxa'])
    expect(breaks({ kind: 'singleton' })).toEqual([])
    expect(breaks({ kind: 'sharedType' })).toEqual(['Atraxa', 'Lightning Bolt', 'Cryptolith Rite'])
    expect(breaks({ kind: 'activated' })).toEqual(['Atraxa', 'Cryptolith Rite'])
    expect(breaks({ kind: 'biggerDeck', extra: 20 })).toEqual([])
  })

  it('counts changelings as every creature type', () => {
    expect(companionBreaks({ kind: 'creatureTypes', types: ['Cat'] }, [card('Mirror Entity', 'Creature — Shapeshifter', { changeling: true })])).toEqual([])
  })

  it('finds Yorion out of reach of an exact 100-card deck', () => {
    expect(companionDeckBreak({ kind: 'biggerDeck', extra: 20 }, 100, 100)).toBe(20)
    expect(companionDeckBreak({ kind: 'biggerDeck', extra: 20 }, 120, 100)).toBe(0)
    expect(companionDeckBreak({ kind: 'even' }, 100, 100)).toBe(0)
  })
})

describe('card text checks', () => {
  it('finds a mana symbol twice', () => {
    expect(repeatsManaSymbol('{1}{G}{G}')).toBe(true)
    expect(repeatsManaSymbol('{X}{X}{R}')).toBe(true)
    expect(repeatsManaSymbol('{2}{W}{U}')).toBe(false)
    expect(repeatsManaSymbol('')).toBe(false)
  })

  it('finds activated abilities, not granted ones or reminder text', () => {
    expect(hasActivatedAbility('{T}: Add {C}{C}.')).toBe(true)
    expect(hasActivatedAbility('+1: Draw a card.')).toBe(true)
    expect(hasActivatedAbility('Equip {2}')).toBe(true)
    expect(hasActivatedAbility('Basic landcycling {1}{G}')).toBe(true)
    expect(hasActivatedAbility('Commander ninjutsu {U}{B}')).toBe(true)
    expect(hasActivatedAbility('Saddle 2')).toBe(true)
    expect(hasActivatedAbility('Creatures you control have "{T}: Add {G}."')).toBe(false)
    expect(hasActivatedAbility('Flying\nWard {2} (Whenever this becomes the target of a spell, counter it unless that player pays {2}: …)')).toBe(false)
  })
})

describe('list headers', () => {
  it('sets a Companion, adding its card, and reads it back', () => {
    const lines = withCompanion(parseList('// Format: Commander\n1 Atraxa'), 'Lurrus of the Dream-Den')
    expect(serializeList(lines)).toBe('// Format: Commander\n// Companion: Lurrus of the Dream-Den\n1 Atraxa\n1 Lurrus of the Dream-Den\n')
    expect(listCompanion(lines)).toBe('Lurrus of the Dream-Den')
    expect(listCompanion(withCompanion(lines, null))).toBeNull()
  })

  it('reads a Companion section of an exported deck', () => {
    expect(listCompanion(parseList('Commander\n1 Atraxa\n\nCompanion\n1 Jegantha, the Wellspring\n\nDeck\n1 Sol Ring'))).toBe(
      'Jegantha, the Wellspring'
    )
  })

  it('keeps the color a Rulebreaker lets the list add', () => {
    const lines = withRulebreakerColor(parseList('1 Tolabow, Loch Rascal'), 'R')
    expect(rulebreakerColor(lines)).toBe('R')
    expect(rulebreakerColor(withRulebreakerColor(lines, null))).toBeNull()
    expect(rulebreakerColor(parseList('// Rulebreaker color: purple'))).toBeNull()
  })
})
