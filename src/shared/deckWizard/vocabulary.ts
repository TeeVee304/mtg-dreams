import { SUBTYPES, type SubtypeId } from './creatureTypes'

/**
 * The words of the card reader: every mechanic and deck role it knows, in plain words and by the
 * names players use for them, and the shape of what it finds on a card. See `mechanics.ts` for the
 * reader and `detectors.ts` for the rules-text patterns.
 *
 * @packageDocumentation
 */

/** A mechanic in plain words, with the jargon term players will hear for it. */
export interface MechanicInfo {
  label: string
  /** One-sentence explanation for new players. */
  explain: string
  /** Jargon for it, if any. */
  term?: string
  /** Completes "<card> …" for a card that provides it. */
  provide: string
  /** Completes "<card> …" for a card that uses it. */
  use: string
  /** Completes "<card> …" for a card that turns it off. */
  stop?: string
}

/** A basic land type's mechanic. */
const landType = (plural: string): MechanicInfo => ({
  label: plural,
  explain: `Counts or triggers on ${plural} you control.`,
  provide: `gives you ${plural}`,
  use: `counts your ${plural}`,
  stop: `gets rid of your ${plural} too`
})

/** Mechanics the detectors know. */
const MECHANIC_INFO = {
  'extra-land-drop': {
    label: 'Extra land drops',
    explain: 'Lets you play more than one land each turn.',
    term: 'ramp',
    provide: 'lets you play extra lands each turn',
    use: 'wants extra land drops',
    stop: 'limits how many lands you can play'
  },
  'land-play': {
    label: 'Playing lands',
    explain: 'Gives you more lands to play, or rewards you for playing them.',
    provide: 'gives you more lands to play',
    use: 'triggers when you play a land'
  },
  'land-enters': {
    label: 'Lands entering',
    explain: 'Something happens whenever a land enters under your control.',
    term: 'landfall',
    provide: 'puts extra lands onto the battlefield',
    use: 'triggers whenever a land enters under your control'
  },
  'land-count': {
    label: 'Lots of lands',
    explain: 'Gets better the more lands you control.',
    term: 'lands matter',
    provide: 'grows your number of lands',
    use: 'gets better with more lands',
    stop: 'gets rid of your lands too'
  },
  'land-leaves': {
    label: 'Lands leaving play',
    explain: 'Sacrificing or destroying your own lands, or rewards for it.',
    term: 'land sacrifice',
    provide: 'sends your lands to the graveyard',
    use: 'triggers when your lands go to the graveyard'
  },
  'lands-in-graveyard': {
    label: 'Lands in your graveyard',
    explain: 'Puts land cards into your graveyard, or plays and returns them from there.',
    term: 'land recursion',
    provide: 'puts land cards into your graveyard',
    use: 'uses land cards from your graveyard',
    stop: 'exiles graveyards, so lands never stay there'
  },
  'land-creatures': {
    label: 'Lands as creatures',
    explain: 'Turns your lands into creatures that can attack, or rewards having land creatures.',
    term: 'animated lands',
    provide: 'turns your lands into creatures',
    use: 'rewards land creatures'
  },
  'type-plains': landType('Plains'),
  'type-island': landType('Islands'),
  'type-swamp': landType('Swamps'),
  'type-mountain': landType('Mountains'),
  'type-forest': landType('Forests'),
  'nonbasic-utility': {
    label: 'Special lands',
    explain: 'Nonbasic lands with abilities beyond making mana.',
    term: 'utility lands',
    provide: 'is a land with a special ability',
    use: 'needs special lands',
    stop: 'turns off the abilities of nonbasic lands'
  },
  discard: {
    label: 'Discarding',
    explain: 'Makes you discard cards, or rewards you when you do.',
    term: 'discard outlet',
    provide: 'makes you discard',
    use: 'rewards discarding'
  },
  'empty-hand': {
    label: 'Empty hand',
    explain: 'Works best when you have no cards in hand.',
    term: 'hellbent',
    provide: 'helps you empty your hand',
    use: 'wants your hand empty',
    stop: 'fills your hand with cards'
  },
  'card-draw': {
    label: 'Drawing cards',
    explain: 'Draws cards, or rewards you for drawing them.',
    term: 'card draw',
    provide: 'draws cards',
    use: 'rewards drawing cards'
  },
  graveyard: {
    label: 'Your graveyard',
    explain: 'Fills your graveyard, or uses the cards in it.',
    term: 'graveyard value',
    provide: 'fills your graveyard',
    use: 'uses cards in your graveyard',
    stop: 'exiles graveyards'
  },
  'spell-cast': {
    label: 'Casting spells',
    explain: 'Lets you cast extra spells, or rewards casting them.',
    provide: 'lets you cast extra spells',
    use: 'triggers when you cast a spell'
  },
  'instants-sorceries': {
    label: 'Instants and sorceries',
    explain: 'Cheap one-shot spells, or cards that reward casting them.',
    term: 'spellslinger',
    provide: 'is an instant or sorcery',
    use: 'rewards casting instants and sorceries'
  },
  'creature-tokens': {
    label: 'Creature tokens',
    explain: 'Makes many small creatures, or makes a wide board stronger.',
    term: 'go wide',
    provide: 'creates creature tokens',
    use: 'gets better with many creatures'
  },
  counters: {
    label: '+1/+1 counters',
    explain: 'Puts +1/+1 counters on creatures, or rewards having them.',
    term: 'counters',
    provide: 'puts +1/+1 counters on creatures',
    use: 'rewards +1/+1 counters'
  },
  poison: {
    label: 'Poison counters',
    explain: 'Gives opponents poison counters: a player with ten loses, however much life they have.',
    term: 'poison',
    provide: 'gives opponents poison counters',
    use: 'adds to or rewards poison counters'
  },
  proliferate: {
    label: 'Proliferate',
    explain: 'Adds one more of each kind of counter already there: +1/+1, poison, loyalty and more.',
    term: 'proliferate',
    provide: 'proliferates, adding to every kind of counter already there',
    use: 'rewards proliferating'
  },
  deathtouch: {
    label: 'Deathtouch',
    explain: 'Creatures whose damage destroys any creature it hits, or cards that reward them.',
    term: 'deathtouch',
    provide: 'has or gives deathtouch',
    use: 'rewards creatures with deathtouch'
  },
  'creature-dies': {
    label: 'Creatures dying',
    explain: 'Sacrifices creatures, or rewards you when they die.',
    term: 'aristocrats',
    provide: 'lets you sacrifice creatures',
    use: 'triggers when creatures die'
  },
  'creature-enters': {
    label: 'Creatures entering',
    explain: 'Brings creatures in again and again, or rewards each one entering.',
    term: 'ETB / blink',
    provide: 'makes creatures enter the battlefield',
    use: 'triggers when creatures enter'
  },
  attacking: {
    label: 'Attacking',
    explain: 'Rewards attacking or hitting opponents with creatures.',
    term: 'combat',
    provide: 'helps creatures attack',
    use: 'triggers on attacks or combat damage'
  },
  lifegain: {
    label: 'Gaining life',
    explain: 'Gains life, or rewards you when you do.',
    term: 'lifegain',
    provide: 'gains you life',
    use: 'rewards gaining life'
  },
  artifacts: {
    label: 'Artifacts',
    explain: 'Artifacts, or cards that get better with many of them.',
    term: 'artifacts matter',
    provide: 'is or makes an artifact',
    use: 'rewards artifacts'
  },
  enchantments: {
    label: 'Enchantments',
    explain: 'Enchantments, or cards that reward casting them.',
    term: 'enchantress',
    provide: 'is an enchantment',
    use: 'rewards enchantments'
  },
  'equipment-auras': {
    label: 'Equipment and Auras',
    explain: 'Gear that makes one creature huge, or cards that reward it.',
    term: 'voltron',
    provide: 'is Equipment or an Aura',
    use: 'rewards Equipment and Auras'
  },
  treasure: {
    label: 'Treasure',
    explain: 'Treasure tokens you can sacrifice for one mana of any color.',
    term: 'treasure',
    provide: 'creates Treasure',
    use: 'rewards Treasure'
  },
  legends: {
    label: 'Legendary cards',
    explain: 'Legendary creatures and other legends, or cards that reward casting them.',
    term: 'legends matter',
    provide: 'is legendary',
    use: 'rewards legendary cards'
  },
  flying: {
    label: 'Flyers',
    explain: 'Creatures with flying, or cards that reward having them.',
    term: 'flyers',
    provide: 'flies, or gives flying',
    use: 'rewards creatures with flying'
  },
  cascade: {
    label: 'Free spells from your library',
    explain: 'Casting a spell also casts a cheaper one from the top of your library for free.',
    term: 'cascade',
    provide: 'casts extra spells from your library for free',
    use: 'rewards cascading'
  },
  planeswalkers: {
    label: 'Planeswalkers',
    explain: 'Planeswalkers, or cards that add loyalty or reward having them.',
    term: 'superfriends',
    provide: 'is a planeswalker',
    use: 'rewards planeswalkers'
  },
  copies: {
    label: 'Copies',
    explain: 'Makes copies of creatures or other permanents.',
    term: 'clones',
    provide: 'copies creatures or permanents',
    use: 'rewards copies'
  },
  toughness: {
    label: 'High toughness',
    explain: 'Creatures with defender or big toughness, or cards that let toughness deal the damage.',
    term: 'toughness matters',
    provide: 'has defender',
    use: 'lets toughness deal damage'
  },
  monarch: {
    label: 'Monarch',
    explain: 'The monarch draws an extra card each turn, until another player deals them combat damage.',
    term: 'monarch',
    provide: 'makes you the monarch',
    use: 'rewards being the monarch'
  },
  'minus-counters': {
    label: '-1/-1 counters',
    explain: 'Puts -1/-1 counters on creatures, usually your opponents’, or rewards it.',
    provide: 'puts -1/-1 counters on creatures',
    use: 'rewards -1/-1 counters'
  },
  upkeep: {
    label: 'Upkeep triggers',
    explain: 'Abilities that happen at the beginning of your upkeep, or extra upkeeps that repeat them.',
    provide: 'gives you extra upkeep steps',
    use: 'triggers at the beginning of your upkeep'
  },
  bending: {
    label: 'Bending',
    explain: 'Airbending, earthbending, firebending and waterbending, or cards that reward bending.',
    term: 'bending',
    provide: 'bends an element',
    use: 'rewards bending'
  },
  'x-spells': {
    label: 'X spells',
    explain: 'Spells with {X} in their cost, which grow with the mana you spend.',
    term: 'X spells',
    provide: 'has {X} in its cost',
    use: 'rewards spells with {X}'
  },
  drain: {
    label: 'Opponents losing life',
    explain: 'Makes opponents lose life without attacking, or rewards them losing it.',
    term: 'drain',
    provide: 'makes opponents lose life',
    use: 'rewards opponents losing life'
  },
  'tribe-any': {
    label: 'Any creature type',
    explain: 'Changelings, which are every creature type, or cards that reward a creature type you choose.',
    term: 'tribal',
    provide: 'counts as every creature type',
    use: 'rewards the creature type you choose'
  }
} as const satisfies Record<string, MechanicInfo>

/** A subtype's mechanic: Vampires, Vehicles. */
const subtypeInfo = (plural: string, creature: boolean): MechanicInfo => ({
  label: plural,
  explain: `${plural}, or cards that reward having many of them.`,
  ...(creature && { term: 'tribal' }),
  provide: `is or makes ${plural}`,
  use: `rewards ${plural}`
})

/** Subtype ids that are creature types, not Vehicles or Sagas. */
export const CREATURE_TYPE_IDS = new Set<string>(SUBTYPES.filter((entry) => entry.length === 3).map(([id]) => id))

/** @returns Whether a mechanic is a creature type's: `tribe-vampire`, not `tribe-any`. */
export const isCreatureType = (id: string): id is SubtypeId => CREATURE_TYPE_IDS.has(id)

/** What players call each mechanic as a deck theme, where it differs from its plain label. */
const COMMUNITY_NAMES: Partial<Record<keyof typeof MECHANIC_INFO, string>> = {
  'extra-land-drop': 'Extra Land Drops',
  'land-play': 'Land Drops',
  'land-enters': 'Landfall',
  'land-count': 'Lands Matter',
  'land-leaves': 'Land Sacrifice',
  'lands-in-graveyard': 'Land Recursion',
  'land-creatures': 'Animated Lands',
  'nonbasic-utility': 'Utility Lands',
  discard: 'Discard',
  'empty-hand': 'Hellbent',
  graveyard: 'Graveyard',
  'spell-cast': 'Spellslinger',
  'instants-sorceries': 'Instants & Sorceries',
  'card-draw': 'Card Draw',
  'creature-tokens': 'Tokens',
  counters: '+1/+1 Counters',
  poison: 'Poison',
  'creature-dies': 'Aristocrats',
  'creature-enters': 'Blink',
  attacking: 'Attack Triggers',
  lifegain: 'Lifegain',
  enchantments: 'Enchantress',
  'equipment-auras': 'Equipment & Auras',
  legends: 'Legends',
  flying: 'Flyers',
  cascade: 'Cascade',
  planeswalkers: 'Superfriends',
  copies: 'Clones',
  toughness: 'Toughness Matters',
  'minus-counters': '-1/-1 Counters',
  upkeep: 'Upkeep Triggers',
  'x-spells': 'X Spells',
  drain: 'Drain',
  'tribe-any': 'Changelings'
}

/** Community names of subtypes: "Vampire Tribal", "Vehicles". */
const SUBTYPE_NAMES = new Map<string, string>(SUBTYPES.map((entry) => [entry[0], entry.length === 3 ? `${entry[1]} Tribal` : entry[2]]))

/** @returns What players call a mechanic as a deck theme: "Landfall", "Vampire Tribal". */
export function mechanicName(id: MechanicId): string {
  return COMMUNITY_NAMES[id as keyof typeof MECHANIC_INFO] ?? SUBTYPE_NAMES.get(id) ?? MECHANICS[id].label
}

/** Mechanic id. */
export type MechanicId = keyof typeof MECHANIC_INFO | SubtypeId

/** Mechanics in plain words, by id. */
export const MECHANICS: Record<MechanicId, MechanicInfo> = {
  ...MECHANIC_INFO,
  ...(Object.fromEntries(SUBTYPES.map(([id, , plural]) => [id, subtypeInfo(plural, CREATURE_TYPE_IDS.has(id))])) as Record<SubtypeId, MechanicInfo>)
}

/** A deck role: what players call it, the same in plain words, and what it means. */
export interface RoleInfo {
  label: string
  plain?: string
  explain: string
}

/** Deck roles the detectors know. */
const ROLE_INFO = {
  land: { label: 'Lands', explain: 'Make mana; most decks play 35 to 38 of them.' },
  ramp: { label: 'Ramp', plain: 'Mana boost', explain: 'Gets you more mana sooner than one land a turn.' },
  'card-advantage': { label: 'Card Draw', plain: 'More cards', explain: 'Gives you more cards to play than your opponents, so you don’t run out of things to do.' },
  removal: { label: 'Removal', plain: 'Answers to one threat', explain: 'Gets rid of one creature, artifact or other threat.' },
  'board-wipe': { label: 'Board Wipes', plain: 'Clear the board', explain: 'Gets rid of many creatures or permanents at once, for when you fall behind.' },
  counterspell: { label: 'Counterspells', plain: 'Stop spells', explain: 'Stops a spell while it is being cast, so it never happens.' },
  protection: { label: 'Protection', plain: 'Keep key cards safe', explain: 'Keeps your commander and important cards from being removed.' },
  tutor: { label: 'Tutors', plain: 'Card search', explain: 'Finds a specific card from your library.' },
  evasion: { label: 'Evasion', plain: 'Get past blockers', explain: 'Gets your creatures past blockers: flying, trample, unblockable…' },
  burn: { label: 'Burn', plain: 'Direct damage', explain: 'Deals damage straight to players or creatures, without attacking.' },
  mill: { label: 'Mill', plain: 'Empty libraries', explain: "Puts cards from opponents' libraries into their graveyards." },
  'extra-turn': { label: 'Extra Turns', plain: 'Take another turn', explain: 'Gives you an extra turn after this one; chaining them is limited below Bracket 4.' },
  'land-denial': { label: 'Land Destruction', plain: 'Destroy many lands', explain: 'Destroys or locks down many lands at once; it is limited below Bracket 4 and most tables dislike it.' }
} as const satisfies Record<string, RoleInfo>

/** Role id. */
export type RoleId = keyof typeof ROLE_INFO

/** Deck roles in plain words, by id. */
export const ROLES: Record<RoleId, RoleInfo> = ROLE_INFO

/** One finding about a card, with the rules text it came from. */
export interface Signal<T extends string = MechanicId> {
  id: T
  /** Strength, 0 to 1: how fully the card does this. */
  weight: number
  /** Rules text or type line it was read from. */
  evidence: string
  /** Mechanic this one follows from, e.g. discarding fills the graveyard. */
  via?: MechanicId
  /** Does it to all your lands at once (Prismatic Omen, Scapeshift): far stronger than one at a time. */
  mass?: true
}

/** What a card does, read from its rules text. */
export interface CardProfile {
  provides: Signal[]
  uses: Signal[]
  stops: Signal[]
  roles: Array<Signal<RoleId>>
}

/** The card fields the reader needs. */
export interface ReadableCard {
  name: string
  typeLine: string
  /** Oracle text, faces joined by newlines. */
  text: string
  /** Keyword abilities and ability words. */
  keywords: string[]
  /** e.g. `{X}{G}`; tells X spells. */
  manaCost?: string
}
