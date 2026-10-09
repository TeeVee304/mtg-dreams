import type { LibraryCard } from './libraryCard'

/**
 * Test fixtures: real Oracle text (Scryfall, October 2026) of cards around the Flubs, the Fool and
 * Valakut, the Molten Pinnacle deck, including cards that work against it.
 *
 * @packageDocumentation
 */

/** Type line, Oracle text and keywords by card name. */
const CARDS = {
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
  Exploration: { typeLine: 'Enchantment', text: 'You may play an additional land on each of your turns.', keywords: [], colorIdentity: ['G'] },
  Gamble: {
    typeLine: 'Sorcery',
    text: 'Search your library for a card, put that card into your hand, discard a card at random, then shuffle.',
    keywords: [],
    colorIdentity: ['R']
  },
  'Worldly Tutor': {
    typeLine: 'Instant',
    text: 'Search your library for a creature card, reveal it, then shuffle and put the card on top.',
    keywords: [],
    colorIdentity: ['G']
  },
  'Heroic Intervention': {
    typeLine: 'Instant',
    text: 'Permanents you control gain hexproof and indestructible until end of turn.',
    keywords: [],
    colorIdentity: ['G']
  },
  'Swiftfoot Boots': {
    typeLine: 'Artifact — Equipment',
    text: "Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)",
    keywords: ['Equip'],
    colorIdentity: []
  },
  Apocalypse: { typeLine: 'Sorcery', text: 'Exile all permanents. You discard your hand.', keywords: [], colorIdentity: ['R'] },
  Pangosaur: {
    typeLine: 'Creature — Dinosaur',
    text: "Whenever a player plays a land, return this creature to its owner's hand.",
    keywords: [],
    colorIdentity: ['G']
  },
  'Toph, the First Metalbender': {
    typeLine: 'Legendary Creature — Human Warrior Ally',
    text: "Nontoken artifacts you control are lands in addition to their other types. (They don't gain the ability to {T} for mana.)\nAt the beginning of your end step, earthbend 2. (Target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
    keywords: ['Earthbend'],
    colorIdentity: ['G', 'R', 'W']
  },
  'Avatar Kyoshi, Earthbender': {
    typeLine: 'Legendary Creature — Human Avatar',
    text: "During your turn, Avatar Kyoshi has hexproof.\nAt the beginning of combat on your turn, earthbend 8, then untap that land. (Target land you control becomes a 0/0 creature with haste that's still a land. Put eight +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
    keywords: ['Earthbend'],
    colorIdentity: ['G']
  },
  'Toph, Greatest Earthbender': {
    typeLine: 'Legendary Creature — Human Warrior Ally',
    text: "When Toph enters, earthbend X, where X is the amount of mana spent to cast her. (Target land you control becomes a 0/0 creature with haste that's still a land. Put X +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)\nLand creatures you control have double strike.",
    keywords: ['Earthbend'],
    colorIdentity: ['G', 'R']
  },
  'Akoum Hellkite': {
    typeLine: 'Creature — Dragon',
    text: 'Flying\nLandfall — Whenever a land you control enters, Akoum Hellkite deals 1 damage to any target. If that land is a Mountain, Akoum Hellkite deals 2 damage instead.',
    keywords: ['Flying', 'Landfall'],
    colorIdentity: ['R']
  },
  "Atraxa, Praetors' Voice": {
    typeLine: 'Legendary Creature — Phyrexian Angel Horror',
    text: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)',
    keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink', 'Proliferate'],
    colorIdentity: ['B', 'G', 'U', 'W']
  },
  'Fynn, the Fangbearer': {
    typeLine: 'Legendary Creature — Human Warrior',
    text: 'Deathtouch\nWhenever a creature you control with deathtouch deals combat damage to a player, that player gets two poison counters. (A player with ten or more poison counters loses the game.)',
    keywords: ['Deathtouch'],
    colorIdentity: ['G']
  },
  'Blighted Agent': {
    typeLine: 'Creature — Phyrexian Human Rogue',
    text: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nBlighted Agent can't be blocked.",
    keywords: ['Infect'],
    colorIdentity: ['U']
  },
  "Changeling Outcast": {
    typeLine: "Creature — Shapeshifter",
    text: "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.",
    keywords: ["Changeling"],
    colorIdentity: ["B"]
  },
  "Herald's Horn": {
    typeLine: "Artifact",
    text: "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.",
    keywords: [],
    colorIdentity: []
  },
  "Edgar Markov": {
    typeLine: "Legendary Creature — Vampire Knight",
    text: "Eminence — Whenever you cast another Vampire spell, if Edgar is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar attacks, put a +1/+1 counter on each Vampire you control.",
    keywords: ["First strike", "Haste", "Eminence"],
    colorIdentity: ["B", "R", "W"]
  },
  "Krenko, Mob Boss": {
    typeLine: "Legendary Creature — Goblin Warrior",
    text: "{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.",
    keywords: [],
    colorIdentity: ["R"]
  },
  "Chatterfang, Squirrel General": {
    typeLine: "Legendary Creature — Squirrel Warrior",
    text: "Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\nIf one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.",
    keywords: ["Landwalk", "Forestwalk"],
    colorIdentity: ["B", "G"]
  },
  "Korvold, Fae-Cursed King": {
    typeLine: "Legendary Creature — Dragon Noble",
    text: "Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.",
    keywords: ["Flying"],
    colorIdentity: ["B", "G", "R"]
  },
  "Teysa Karlov": {
    typeLine: "Legendary Creature — Human Advisor",
    text: "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink.",
    keywords: [],
    colorIdentity: ["B", "W"]
  },
  "Giada, Font of Hope": {
    typeLine: "Legendary Creature — Angel",
    text: "Flying, vigilance\nEach other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.\n{T}: Add {W}. Spend this mana only to cast an Angel spell.",
    keywords: ["Flying", "Vigilance"],
    colorIdentity: ["W"]
  },
  'Consuming Sinkhole': {
    typeLine: 'Instant',
    text: 'Devoid (This card has no color.)\nChoose one —\n• Exile target land creature.\n• Consuming Sinkhole deals 4 damage to target player or planeswalker.',
    keywords: ['Devoid'],
    colorIdentity: ['R']
  },
  Vibrance: {
    typeLine: 'Creature — Elemental Incarnation',
    text: 'When this creature enters, if {R}{R} was spent to cast it, this creature deals 3 damage to any target.\nWhen this creature enters, if {G}{G} was spent to cast it, search your library for a land card, reveal it, put it into your hand, then shuffle. You gain 2 life.\nEvoke {R/G}{R/G} (You may cast this spell for its evoke cost. If you do, it\'s sacrificed when it enters.)',
    keywords: ['Evoke'],
    colorIdentity: ['G', 'R']
  }
} satisfies Record<string, Pick<LibraryCard, 'typeLine' | 'text' | 'keywords' | 'colorIdentity'>>

/** Fixture card names. */
export type TestCardName = keyof typeof CARDS

/** Mana costs, front face first. */
const MANA_COSTS: Record<TestCardName, string> = {
  'Flubs, the Fool': '{G}{U}{R}',
  'Valakut, the Molten Pinnacle': '',
  'Blood Moon': '{2}{R}',
  'Crucible of Worlds': '{3}',
  'Seismic Assault': '{R}{R}{R}',
  'Glint-Horn Buccaneer': '{1}{R}{R}',
  Harmonize: '{2}{G}{G}',
  'Faithless Looting': '{R}',
  'Thrill of Possibility': '{1}{R}',
  'Tatyova, Benthic Druid': '{3}{G}{U}',
  'Aesi, Tyrant of Gyre Strait': '{4}{G}{U}',
  'Prismatic Omen': '{1}{G}',
  Scapeshift: '{2}{G}{G}',
  'Wooded Foothills': '',
  'Stomping Ground': '',
  Mountain: '',
  'Titania, Protector of Argoth': '{4}{G}',
  'Rest in Peace': '{1}{W}',
  'Waste Not': '{1}{B}',
  'Fiery Temper': '{1}{R}{R}',
  'Valley Rannet': '{4}{R}{G}',
  'Path to Exile': '{W}',
  'Rhystic Study': '{2}{U}',
  Cultivate: '{2}{G}',
  'Retreat to Valakut': '{2}{R}',
  'Wrenn and Six': '{R}{G}',
  "Azusa's Many Journeys // Likeness of the Seeker": '{1}{G}',
  "Grafdigger's Cage": '{1}',
  Greenseeker: '{G}',
  'Lotus Cobra': '{1}{G}',
  'Splendid Reclamation': '{3}{G}',
  "Nylea's Presence": '{1}{G}',
  Exploration: '{G}',
  Gamble: '{R}',
  'Worldly Tutor': '{G}',
  'Heroic Intervention': '{1}{G}',
  'Swiftfoot Boots': '{2}',
  Apocalypse: '{R}{R}{R}',
  Pangosaur: '{G}',
  Vibrance: '{3}{R/G}{R/G}',
  'Toph, the First Metalbender': '{1}{R}{G}{W}',
  'Avatar Kyoshi, Earthbender': '{5}{G}{G}{G}',
  'Toph, Greatest Earthbender': '{2}{R}{G}',
  'Akoum Hellkite': '{4}{R}{R}',
  'Consuming Sinkhole': '{3}{R}',
  "Atraxa, Praetors' Voice": '{G}{W}{U}{B}',
  'Fynn, the Fangbearer': '{1}{G}',
  'Blighted Agent': '{1}{U}',
  "Changeling Outcast": "{B}",
  "Herald's Horn": "{3}",
  "Edgar Markov": "{3}{R}{W}{B}",
  "Krenko, Mob Boss": "{2}{R}{R}",
  "Chatterfang, Squirrel General": "{2}{G}",
  "Korvold, Fae-Cursed King": "{2}{B}{R}{G}",
  "Teysa Karlov": "{2}{W}{B}",
  "Giada, Font of Hope": "{1}{W}"
}

/** Mana value of a mana cost: `{2}{G}{G}` → 4. */
export function manaValueOf(manaCost: string): number {
  const symbols = manaCost.split(' // ')[0].match(/\{[^}]+\}/g) ?? []
  return symbols.reduce((sum, symbol) => sum + (/^\{\d+\}$/.test(symbol) ? Number(symbol.slice(1, -1)) : symbol === '{X}' ? 0 : 1), 0)
}

/** @returns The fixture card, legal in Commander, with no Cardmarket products. */
export function testCard(name: TestCardName): LibraryCard {
  const manaCost = MANA_COSTS[name]
  const colors = ['W', 'U', 'B', 'R', 'G'].filter((color) => manaCost.includes(`{${color}}`))
  return { name, ...CARDS[name], manaCost, manaValue: manaValueOf(manaCost), colors, rarity: 'rare', legalities: { commander: 'legal' }, products: [] }
}

/** @returns Every fixture card. */
export function testCards(): LibraryCard[] {
  return (Object.keys(CARDS) as TestCardName[]).map(testCard)
}
