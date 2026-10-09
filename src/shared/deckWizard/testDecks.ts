import type { CommunityStats } from './community'
import { newBrief, type DeckBrief } from './deckBrief'
import type { CheckContext } from './deckCheck'
import { nameKey } from '../decklist'
import { buildPool } from './deckPool'
import { deckTemplate } from './deckTemplate'
import { readCard } from './mechanics'
import { manaValueOf, testCards } from './testCards'
import type { LibraryCard } from './libraryCard'

/**
 * Test fixtures for building decks: the real fixture cards plus enough made-up cards for every
 * job of a Flubs, the Fool + Valakut deck, with made-up prices.
 *
 * @packageDocumentation
 */

/** A made-up card for filling the library. */
function card(name: string, typeLine: string, text: string, manaCost: string, colorIdentity: string[]): LibraryCard {
  return {
    name, typeLine, text, manaCost, colorIdentity,
    keywords: /^Landfall/.test(text) ? ['Landfall'] : [],
    manaValue: manaValueOf(manaCost),
    colors: colorIdentity,
    rarity: 'common',
    legalities: { commander: 'legal' },
    products: []
  }
}
/** `n` made-up cards numbered from 1. */
const many = (n: number, make: (i: number) => LibraryCard) => Array.from({ length: n }, (_, i) => make(i + 1))

/** Fixtures plus enough made-up cards for every job. */
export const LIBRARY: LibraryCard[] = [
  ...testCards(),
  card('Forest', 'Basic Land — Forest', '({T}: Add {G}.)', '', ['G']),
  card('Island', 'Basic Land — Island', '({T}: Add {U}.)', '', ['U']),
  card('Plains', 'Basic Land — Plains', '({T}: Add {W}.)', '', ['W']),
  ...many(20, (i) => card(`Mana Rock ${i}`, 'Artifact', '{T}: Add one mana of any color.', '{2}', [])),
  ...many(20, (i) => card(`Impulse ${i}`, 'Sorcery', 'Exile the top two cards of your library. You may play them this turn.', '{2}{R}', ['R'])),
  ...many(20, (i) => card(`Bolt ${i}`, 'Instant', `This spell deals 3 damage to target creature.`, '{1}{R}', ['R'])),
  ...many(6, (i) => card(`Quake ${i}`, 'Sorcery', 'This spell deals 3 damage to each creature.', '{2}{R}{R}', ['R'])),
  ...many(6, (i) => card(`Shield ${i}`, 'Instant', 'Creatures you control gain hexproof and indestructible until end of turn.', '{1}{G}', ['G'])),
  ...many(6, (i) => card(`Denial ${i}`, 'Instant', 'Counter target spell.', '{1}{U}{U}', ['U'])),
  ...many(6, (i) => card(`Seeker ${i}`, 'Sorcery', 'Search your library for a card, put it into your hand, then shuffle.', '{1}{G}', ['G'])),
  ...many(20, (i) => card(`Ember ${i}`, 'Enchantment', 'At the beginning of your upkeep, this enchantment deals 1 damage to each opponent.', '{2}{R}', ['R'])),
  ...many(30, (i) => card(`Landfall Beast ${i}`, 'Creature — Beast', 'Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature.', '{2}{G}', ['G'])),
  ...many(20, (i) => card(`Bear ${i}`, 'Creature — Bear', '', '{1}{G}', ['G'])),
  ...many(12, (i) => card(`Ridge ${i}`, 'Land — Mountain Forest', '({T}: Add {R} or {G}.)', '', ['G', 'R'])),
  card('Pricey Engine', 'Enchantment', 'You may play an additional land on each of your turns.', '{2}{G}', ['G']),
  card('Ferris Wheel', 'Artifact — Attraction', 'Visit — Target creature phases out.', '', [])
]
/** Library cards with what they do, by name key. */
const BY_NAME = new Map(LIBRARY.map((c) => [nameKey(c.name), { card: c, profile: readCard(c) }]))
/** Made-up prices; others cost €0.50, basic lands €0.05. */
const PRICES: Record<string, number> = { 'Pricey Engine': 25, 'Crucible of Worlds': 18, 'Blood Moon': 6, 'Lotus Cobra': 6 }
/** Price of a library card. */
export const price = (c: LibraryCard) => PRICES[c.name] ?? (/^Basic/.test(c.typeLine) ? 0.05 : 0.5)
/** Library card and what it does, by name. */
export const lookup = (name: string) => BY_NAME.get(nameKey(name))

/** Flubs + Valakut, Midrange Group Slug with a landfall engine, a pet card, an avoided card, €200 at most €20 a card. */
export const BRIEF: DeckBrief = {
  ...newBrief('Flubs, the Fool'),
  anchors: ['Valakut, the Molten Pinnacle'],
  strategy: 'midrange',
  wincons: ['group-slug'],
  engines: ['land-enters'],
  pets: ['Crucible of Worlds'],
  avoid: ['Exploration'],
  budget: { total: 200, perCard: 20, basis: 'trend' },
  wildcards: 2
}

/** The acceptance brief on real data: Midrange Group Slug with a landfall engine, €300 at most €20 a card, 3 wildcards. */
export const FLUBS_BRIEF: DeckBrief = {
  ...newBrief('Flubs, the Fool'),
  anchors: ['Valakut, the Molten Pinnacle'],
  strategy: 'midrange',
  wincons: ['group-slug'],
  engines: ['land-enters'],
  budget: { total: 300, perCard: 20, basis: 'trend' },
  wildcards: 3
}

/** The library with some cards changed, e.g. made Game Changers or given a popularity rank. */
export const libraryWith = (changes: Record<string, Partial<LibraryCard>>): LibraryCard[] => LIBRARY.map((c) => ({ ...c, ...changes[c.name] }))

/** Pool, template and check context for a brief over a library, with what precons play if given. */
export function setUp(brief: DeckBrief, library: LibraryCard[] = LIBRARY, community: CommunityStats | null = null) {
  const focusCards = [brief.commander, ...brief.anchors].map((name) => lookup(name)!)
  const focus = focusCards.map(({ card: c, profile }) => ({ name: c.name, profile }))
  const template = deckTemplate(brief, focus, focusCards[0].card.colorIdentity)
  const pool = buildPool({ brief, template, focus: focusCards, library: library.map((c) => ({ card: c, profile: BY_NAME.get(nameKey(c.name))!.profile })), price, community })
  const context: CheckContext = { brief, template, commander: focusCards[0].card, focus, lookup, price }
  return { pool, template, context, focus }
}
