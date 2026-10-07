import type { ReadableCard } from './mechanics'

/**
 * Test fixtures: real Oracle text (Scryfall, October 2026) of cards around the Flubs, the Fool and
 * Valakut, the Molten Pinnacle deck, including cards that work against it.
 *
 * @packageDocumentation
 */

/** Type line, Oracle text and keywords by card name. */
const CARDS: Record<string, Omit<ReadableCard, 'name'> & { colorIdentity: string[] }> = {
  'Flubs, the Fool': {
    typeLine: 'Legendary Creature — Frog Scout',
    text: 'You may play an additional land on each of your turns.\nWhenever you play a land or cast a spell, draw a card if you have no cards in hand. Otherwise, discard a card.',
    keywords: [],
    colorIdentity: ['G', 'R', 'U']
  },
  'Valakut, the Molten Pinnacle': {
    typeLine: 'Land',
    text: 'This land enters tapped.\nWhenever a Mountain you control enters, if you control at least five other Mountains, you may have this land deal 3 damage to any target.\n{T}: Add {R}.',
    keywords: [],
    colorIdentity: ['R']
  },
  'Blood Moon': { typeLine: 'Enchantment', text: 'Nonbasic lands are Mountains.', keywords: [], colorIdentity: ['R'] },
  'Crucible of Worlds': { typeLine: 'Artifact', text: 'You may play lands from your graveyard.', keywords: [], colorIdentity: [] },
  'Seismic Assault': {
    typeLine: 'Enchantment',
    text: 'Discard a land card: This enchantment deals 2 damage to any target.',
    keywords: [],
    colorIdentity: ['R']
  },
  'Glint-Horn Buccaneer': {
    typeLine: 'Creature — Minotaur Pirate',
    text: 'Haste\nWhenever you discard a card, this creature deals 1 damage to each opponent.\n{1}{R}, Discard a card: Draw a card. Activate only if this creature is attacking.',
    keywords: ['Haste'],
    colorIdentity: ['R']
  },
  Harmonize: { typeLine: 'Sorcery', text: 'Draw three cards.', keywords: [], colorIdentity: ['G'] },
  'Faithless Looting': {
    typeLine: 'Sorcery',
    text: 'Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
    keywords: ['Flashback'],
    colorIdentity: ['R']
  },
  'Thrill of Possibility': {
    typeLine: 'Instant',
    text: 'As an additional cost to cast this spell, discard a card.\nDraw two cards.',
    keywords: [],
    colorIdentity: ['R']
  },
  'Tatyova, Benthic Druid': {
    typeLine: 'Legendary Creature — Merfolk Druid',
    text: 'Landfall — Whenever a land you control enters, you gain 1 life and draw a card.',
    keywords: ['Landfall'],
    colorIdentity: ['G', 'U']
  },
  'Aesi, Tyrant of Gyre Strait': {
    typeLine: 'Legendary Creature — Serpent',
    text: 'You may play an additional land on each of your turns.\nLandfall — Whenever a land you control enters, you may draw a card.',
    keywords: ['Landfall'],
    colorIdentity: ['G', 'U']
  },
  'Prismatic Omen': {
    typeLine: 'Enchantment',
    text: 'Lands you control are every basic land type in addition to their other types.',
    keywords: [],
    colorIdentity: ['G']
  },
  Scapeshift: {
    typeLine: 'Sorcery',
    text: 'Sacrifice any number of lands. Search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle.',
    keywords: [],
    colorIdentity: ['G']
  },
  'Wooded Foothills': {
    typeLine: 'Land',
    text: '{T}, Pay 1 life, Sacrifice this land: Search your library for a Mountain or Forest card, put it onto the battlefield, then shuffle.',
    keywords: [],
    colorIdentity: []
  },
  'Stomping Ground': {
    typeLine: 'Land — Mountain Forest',
    text: "({T}: Add {R} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.",
    keywords: [],
    colorIdentity: ['G', 'R']
  },
  Mountain: { typeLine: 'Basic Land — Mountain', text: '({T}: Add {R}.)', keywords: [], colorIdentity: ['R'] },
  'Titania, Protector of Argoth': {
    typeLine: 'Legendary Creature — Elemental',
    text: 'When Titania enters, return target land card from your graveyard to the battlefield.\nWhenever a land you control is put into a graveyard from the battlefield, create a 5/3 green Elemental creature token.',
    keywords: [],
    colorIdentity: ['G']
  },
  'Rest in Peace': {
    typeLine: 'Enchantment',
    text: 'When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.',
    keywords: [],
    colorIdentity: ['W']
  },
  'Waste Not': {
    typeLine: 'Enchantment',
    text: 'Whenever an opponent discards a creature card, create a 2/2 black Zombie creature token.\nWhenever an opponent discards a land card, add {B}{B}.\nWhenever an opponent discards a noncreature, nonland card, draw a card.',
    keywords: [],
    colorIdentity: ['B']
  },
  'Fiery Temper': {
    typeLine: 'Instant',
    text: 'Fiery Temper deals 3 damage to any target.\nMadness {R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)',
    keywords: ['Madness'],
    colorIdentity: ['R']
  },
  'Valley Rannet': {
    typeLine: 'Creature — Beast',
    text: 'Mountaincycling {2}, forestcycling {2} ({2}, Discard this card: Search your library for a Mountain or Forest card, reveal it, put it into your hand, then shuffle.)',
    keywords: ['Mountaincycling', 'Forestcycling', 'Typecycling'],
    colorIdentity: ['G', 'R']
  },
  'Path to Exile': {
    typeLine: 'Instant',
    text: 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    keywords: [],
    colorIdentity: ['W']
  },
  'Rhystic Study': {
    typeLine: 'Enchantment',
    text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    keywords: [],
    colorIdentity: ['U']
  },
  Cultivate: {
    typeLine: 'Sorcery',
    text: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
    keywords: [],
    colorIdentity: ['G']
  },
  'Retreat to Valakut': {
    typeLine: 'Enchantment',
    text: "Landfall — Whenever a land you control enters, choose one —\n• Target creature gets +2/+0 until end of turn.\n• Target creature can't block this turn.",
    keywords: ['Landfall'],
    colorIdentity: ['R']
  },
  'Wrenn and Six': {
    typeLine: 'Legendary Planeswalker — Wrenn',
    text: '+1: Return up to one target land card from your graveyard to your hand.\n−1: Wrenn and Six deals 1 damage to any target.\n−7: You get an emblem with "Instant and sorcery cards in your graveyard have retrace." (You may cast instant and sorcery cards from your graveyard by discarding a land card in addition to paying their other costs.)',
    keywords: [],
    colorIdentity: ['G', 'R']
  },
  "Azusa's Many Journeys // Likeness of the Seeker": {
    typeLine: 'Enchantment — Saga // Enchantment Creature — Human Monk',
    text: '(As this Saga enters and after your draw step, add a lore counter.)\nI — You may play an additional land this turn.\nII — You gain 3 life.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.\nWhenever this creature becomes blocked, untap up to three lands you control.',
    keywords: [],
    colorIdentity: ['G']
  },
  "Grafdigger's Cage": {
    typeLine: 'Artifact',
    text: "Creature cards in graveyards and libraries can't enter the battlefield.\nPlayers can't cast spells from graveyards or libraries.",
    keywords: [],
    colorIdentity: []
  },
  Greenseeker: {
    typeLine: 'Creature — Elf Spellshaper',
    text: '{G}, {T}, Discard a card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
    keywords: [],
    colorIdentity: ['G']
  },
  'Lotus Cobra': {
    typeLine: 'Creature — Snake',
    text: 'Landfall — Whenever a land you control enters, add one mana of any color.',
    keywords: ['Landfall'],
    colorIdentity: ['G']
  },
  'Splendid Reclamation': {
    typeLine: 'Sorcery',
    text: 'Return all land cards from your graveyard to the battlefield tapped.',
    keywords: [],
    colorIdentity: ['G']
  },
  "Nylea's Presence": {
    typeLine: 'Enchantment — Aura',
    text: 'Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land is every basic land type in addition to its other types.',
    keywords: ['Enchant'],
    colorIdentity: ['G']
  },
  Exploration: { typeLine: 'Enchantment', text: 'You may play an additional land on each of your turns.', keywords: [], colorIdentity: ['G'] }
}

/** Fixture card names. */
export type TestCardName = keyof typeof CARDS

/** @returns The fixture card, legal in Commander. */
export function testCard(name: TestCardName): ReadableCard & { colorIdentity: string[]; legalities: Record<string, string> } {
  return { name, ...CARDS[name], legalities: { commander: 'legal' } }
}

/** @returns Every fixture card. */
export function testCards() {
  return (Object.keys(CARDS) as TestCardName[]).map(testCard)
}
