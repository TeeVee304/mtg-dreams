import { SUBTYPES, type SubtypeId } from './creatureTypes'
import { parseAbilities, type Ability } from './oracleText'

/**
 * Reads what a card does from its rules text: the game resources and events it **provides** (makes
 * happen), **uses** (benefits from) and **stops** (turns off), plus its deck **roles** (ramp,
 * removal…). Every finding keeps the line of rules text it came from, so any judgment can be
 * explained by quoting the card. No third-party tags or popularity data are involved.
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
const CREATURE_TYPE_IDS = new Set<string>(SUBTYPES.filter((entry) => entry.length === 3).map(([id]) => id))

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

/** Card facts shared by the detectors. */
interface Facts {
  card: ReadableCard
  /** Type words of every face: supertypes, types and subtypes. */
  faces: Array<{ types: string[]; subtypes: string[] }>
  /** The front face is a land. */
  land: boolean
  keywords: Set<string>
  /** Cards discarded as an additional cost to cast it. */
  spellDiscards: number
}

/** Part of an ability a detector reads. */
type Part = 'trigger' | 'cost' | 'effect'
/** Side of a finding. */
type Side = 'provides' | 'uses' | 'stops' | 'roles'

/** Text pattern for one finding. */
interface Detector {
  side: Side
  id: MechanicId | RoleId
  in: Part[]
  /** All must match within one sentence, or within the whole part with {@link Detector.whole}. */
  all: RegExp[]
  /** Skips sentences that match. */
  unless?: RegExp
  /** Matches across the sentences of a part: "Exile the top card. You may play it." */
  whole?: true
  weight?: number
  /** Card-level condition. */
  only?: (facts: Facts, ability: Ability) => boolean
}

const BASIC_TYPES = [
  ['Plains', 'Plains'],
  ['Island', 'Islands'],
  ['Swamp', 'Swamps'],
  ['Mountain', 'Mountains'],
  ['Forest', 'Forests']
] as const

/** Mechanic id of a basic land type. */
const typeId = (type: string) => `type-${type.toLowerCase()}` as MechanicId

/** Escapes text for a regular expression. */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Subtype by its singular or plural word: `Elves` → `tribe-elf`. */
const SUBTYPE_FORMS = new Map<string, SubtypeId>(SUBTYPES.flatMap(([id, one, many]) => [[one, id], [many, id]] as Array<[string, SubtypeId]>))
/** Every subtype word, longest first. */
const SUBTYPE_WORDS = [...SUBTYPE_FORMS.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
/** Creature type words only, longest first. */
const CREATURE_WORDS = [...SUBTYPE_FORMS].filter(([, id]) => CREATURE_TYPE_IDS.has(id)).map(([word]) => word).sort((a, b) => b.length - a.length).map(escapeRe).join('|')
/** A subtype word as rules text writes it: capitalized, whole, and not "non-Human". */
const SUBTYPE_RE = new RegExp(`(?<![\\w'-])(?:${SUBTYPE_WORDS})(?![\\w'-])`, 'g')
/** Tokens of a type: "1/1 green Elf Warrior creature tokens"; an amassed Army: "amass Orcs". */
const SUBTYPE_TOKEN_RE = new RegExp(`(?<![\\w'-])(?:(?:${SUBTYPE_WORDS}) )+(?:(?:artifact|enchantment|legendary|snow) )*(?:creature )?tokens?\\b|\\bamass (?:${SUBTYPE_WORDS})\\b`, 'g')
/** Text right before a type word that makes something that type: "is a 4/4 Elemental", "except it's a black Zombie". */
const SUBTYPE_BECOMES_RE =
  /\b(?:is|are|become|becomes|except it's|except they're)(?: also)? (?:an? )?(?:(?:\d+|X)\/(?:\d+|X) )?(?:(?:white|blue|black|red|green|colorless|artifact|enchantment|legendary|snow|and) )*$/i
/** Text right after a word that makes it an ability's name: " Formula — ". */
const ABILITY_NAME_RE = /^(?: [\w'-]+){0,3} —/
/** Type words right before another: "Elemental " in "is a 4/4 Elemental Spirit". */
const TRAILING_SUBTYPES_RE = new RegExp(`(?:(?:${SUBTYPE_WORDS}) )+$`)
/** Text before a type word that only names it: hate, blocking limits, card names. */
const SUBTYPE_SKIP_RE = /\b(?:protection from|except by|blocked by|named|destroy all|exile all|destroy target|exile target)\b[^.;,]*$/i

/** Card types the other subtypes belong to: a Saga payoff rewards enchantments too. */
const SUBTYPE_PARENTS: Partial<Record<SubtypeId, MechanicId>> = { 'tribe-saga': 'enchantments', 'tribe-shrine': 'enchantments', 'tribe-vehicle': 'artifacts' }

/** Words for numbers in rules text; `X` and "that many" count as 3. */
const NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: 3,
  'that many': 3
}

/** Clauses where another player discards, which don't make *you* discard. */
const OTHERS_DISCARD_RE = /\b(?:target|each|that|an?) (?:player|opponent)s?\b[^.]*?\bdiscards?\b[^.]*/gi
/** Clauses where another player draws (target player, opponents, "that player", "they"). */
const OTHERS_DRAW_RE = /\b(?:target (?:player|opponent)|each opponent|an opponent|that player|they)\b[^.]*?\bdraws?\b[^.]*/gi
/** You discard: imperative, "you discard", or every player. */
const YOU_DISCARD_RE =
  /(?:^|[.,;:—] |\bthen |\band |\byou (?:may )?)discards? (?:a|an|one|two|three|four|\w+|X|that many|your hand|all|up to|the rest|any number)\b|\beach player discards\b/i
/** Land words in effects. */
const LAND_WORD_RE = /\b(?:lands?|land cards?|Plains|Islands?|Swamps?|Mountains?|Forests?)\b/
/** Where a tutor puts the card it finds. */
const TUTOR_TO_RE = /\binto your hand\b|\bon top\b|\bonto the battlefield\b/i
/** Searches that aren't tutors: for lands (ramp), or for one named card. */
const TUTOR_SKIP_RE = /\b(?:lands?|land cards?|Plains|Islands?|Swamps?|Mountains?|Forests?)\b|\bnamed\b|\bsame name\b/
/** Destroying or exiling every land along with other permanents. */
const LAND_WIPE_RE = /\b(?:destroy|exile) all (?:permanents|(?:[\w-]+, )*(?:[\w-]+,? and )?lands)\b|\beach player sacrifices all lands\b/i
/** Triggered effects that only hurt you: a payoff in name only. */
const DRAWBACK_RE = /^(?:return this\b[^.]*\bto its owner's hand|sacrifice this\b[^.]*|you lose \d+ life)\.?$/i
/** Effects that help another player rather than you. */
const OTHERS_RE = /\bopponent|\btheir library\b|\bits controller\b|\bthat player\b|\btarget player\b/i
/** Damage or life loss for every opponent at once. */
const TABLE_BURN_RE = /\bdeals? [^.]*?\bdamage to (?:each opponent|each player)\b|\beach opponent loses (?:(?:\d+|X|\w+) )?life\b/i
/** Damage to one player, or to any target. */
const TARGET_BURN_RE = /\bdeals? (?:\d+|X|that much|damage equal|\w+)(?: damage)?[^.]*\bto (?:any target|target player|target opponent|that player|that permanent or player)\b/i
/** Triggers that happen once: as the card enters, dies, turns face up, or a Saga chapter. */
const ONCE_TRIGGER_RE = /^(?:chapter|this(?: [\w-]+)? (?:enters|dies|is turned face up))(?:,? if\b.*)?$/i

/** The ability can happen again and again: activated, a recurring trigger, or a permanent's static ability. */
const repeats = (facts: Facts, ability: Ability) =>
  ability.kind === 'activated' ||
  (ability.kind === 'triggered' && !ONCE_TRIGGER_RE.test(ability.trigger ?? '')) ||
  (ability.kind === 'static' && !isSpell(facts))

/** Repeats with no once-a-turn limit: no tap symbol and no loyalty cost. */
const repeatsFreely = (facts: Facts, ability: Ability) =>
  repeats(facts, ability) && !(ability.kind === 'activated' && /\{[TQ]\}|^[+−-]?(?:\d+|X)$/.test(ability.cost ?? ''))

/** Text detectors, in no particular order; the strongest finding per id wins. */
const DETECTORS: Detector[] = [
  // Land drops and playing lands
  { side: 'provides', id: 'extra-land-drop', in: ['effect'], all: [/\bplay (?:an|one|two|three|\w+) additional lands?\b(?! this turn)|\bplay any number of (?:additional )?lands\b/i] },
  { side: 'provides', id: 'extra-land-drop', in: ['effect'], all: [/\badditional lands? this turn\b/i], weight: 0.5 },
  { side: 'stops', id: 'extra-land-drop', in: ['effect'], all: [/\bcan't play (?:more than one )?lands?\b/i], unless: /\bopponents?\b|\btarget player\b|\bother players\b|\bif this creature was cast\b/i },
  { side: 'uses', id: 'land-play', in: ['trigger'], all: [/\b(?:you|a player) plays? (?:a|an|your \w+) land\b|\bplay a land or cast\b/i] },
  { side: 'uses', id: 'land-play', in: ['effect'], all: [/\bplayed (?:a|an|two or more|\w+) lands? this turn\b/i], weight: 0.7 },
  { side: 'provides', id: 'land-play', in: ['effect'], all: [/\bplay lands?\b[^.]*?\bfrom (?:the top of your library|your graveyard|exile|among)\b/i] },
  { side: 'provides', id: 'land-play', in: ['effect', 'cost'], all: [/\breturn\b/i, /\blands?\b|\bland cards?\b/i, /\bto (?:its owner's|your|their owners') hands?\b/i], unless: /opponent/i, weight: 0.7 },
  { side: 'provides', id: 'land-play', in: ['effect'], all: [/\bsearch your library for\b/i, LAND_WORD_RE, /\b(?:into|to) your hand\b/i], weight: 0.6 },
  { side: 'provides', id: 'land-play', in: ['effect'], all: [/\byou may play (?:that card|those cards|them|it|the exiled cards?|cards exiled)\b/i], weight: 0.4 },
  // Lands entering, leaving and counting
  { side: 'uses', id: 'land-enters', in: ['trigger'], all: [/\b(?:a|an|another|one or more|each|two or more)(?: [\w-]+)? lands?\b[^,]*\benters?\b/i], unless: /opponent/i },
  // A Mountain entering is a land entering, of one type only.
  { side: 'uses', id: 'land-enters', in: ['trigger'], all: [/\b(?:a|an|another|one or more|each)(?: [\w-]+)? (?:Plains|Islands?|Swamps?|Mountains?|Forests?)\b[^,]*\benters?\b/], unless: /opponent/i, weight: 0.5 },
  // An earthbent land coming back after dying is the same land, not an extra one.
  { side: 'provides', id: 'land-enters', in: ['effect'], all: [/\b(?:put|puts|return|returns|search)\b/i, LAND_WORD_RE, /\b(?:onto|to) the battlefield\b/i], unless: new RegExp(`${OTHERS_RE.source}|\\bdies or is exiled, return it\\b`, 'i') },
  { side: 'provides', id: 'land-leaves', in: ['cost'], all: [/\bsacrifice (?:a|an|another|two|three|X|\w+) lands?\b/i] },
  { side: 'provides', id: 'land-leaves', in: ['cost'], all: [/\bsacrifice this\b/i], only: (facts) => facts.land },
  { side: 'provides', id: 'land-leaves', in: ['effect'], all: [/\bsacrifices? (?:any number of|all|a|an|two|\w+) lands?\b/i], unless: /opponent sacrifices|target player sacrifices/i },
  { side: 'provides', id: 'land-leaves', in: ['effect'], all: [/\bdestroy all lands\b/i] },
  { side: 'uses', id: 'land-leaves', in: ['trigger'], all: [/\blands?\b[^,]*\b(?:is|are) put into (?:a|your) graveyard from the battlefield\b|\byou sacrifice (?:a|one or more) lands?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'lands-in-graveyard', in: ['trigger', 'effect', 'cost'], all: [/\bland cards? (?:from|in) your graveyard\b|\blands? from your graveyard\b|\bland cards? (?:is|are) put into your graveyard\b|\bfor each land card in your graveyard\b/i] },
  { side: 'provides', id: 'lands-in-graveyard', in: ['cost', 'effect'], all: [/\bdiscard (?:a|an|\w+) land cards?\b/i] },
  { side: 'provides', id: 'lands-in-graveyard', in: ['effect'], all: [/\bland\b/i, /\binto your graveyard\b/i] },
  { side: 'uses', id: 'land-count', in: ['trigger', 'effect'], all: [/\bfor each land you control\b|\bnumber of lands you control\b|\b(?:\w+) or more lands\b|\bequal to the number of lands\b/i] },
  // Lands as creatures, and other things as lands
  { side: 'provides', id: 'land-creatures', in: ['effect'], all: [/\blands?\b[^.]*\b(?:becomes?|are|is) (?:a|an)?\s?[^.,;]*\bcreatures?\b/i], unless: /\bopponents? control|\bthis\b[^.]*\bbecomes\b/i },
  { side: 'provides', id: 'land-creatures', in: ['effect'], all: [/^this (?:land )?becomes (?:a|an) [^.]*\bcreature\b/i], weight: 0.4 },
  { side: 'uses', id: 'land-creatures', in: ['trigger', 'effect'], all: [/\bland creatures?\b/i], unless: /opponents? control|\btarget land creature(?! you control)/i },
  { side: 'provides', id: 'land-count', in: ['effect'], all: [/\b(?:[\w-]+ )?(?:artifacts|creatures|enchantments) you control are lands\b/i], weight: 0.8 },
  { side: 'provides', id: 'land-enters', in: ['effect'], all: [/\b(?:[\w-]+ )?(?:artifacts|creatures|enchantments) you control are lands\b/i], weight: 0.8 },
  { side: 'uses', id: 'artifacts', in: ['effect'], all: [/\b(?:[\w-]+ )?artifacts you control are lands\b/i] },
  // Nonbasic lands
  { side: 'stops', id: 'nonbasic-utility', in: ['effect'], all: [/\bnonbasic lands are\b|\b(?:destroy|exile) all nonbasic lands\b|\bnonbasic lands? (?:lose|have no|has no)\b|\blands (?:lose all abilities|have no abilities)\b/i], unless: /your opponents control|an opponent controls/i },
  { side: 'stops', id: 'nonbasic-utility', in: ['effect'], all: [/\bnonbasic lands don't untap\b/i], weight: 0.7 },
  // Hand
  { side: 'provides', id: 'discard', in: ['cost'], all: [/\bdiscard\b/i] },
  { side: 'uses', id: 'discard', in: ['trigger'], all: [/\byou (?:cycle or )?discards?\b|\bdiscard one or more\b|\ba player discards\b|\bdiscarded\b/i], unless: /opponent/i },
  { side: 'uses', id: 'empty-hand', in: ['trigger', 'effect', 'cost'], all: [/\bno cards in (?:your )?hand\b|\bone or fewer cards in (?:your )?hand\b|\bfewer than \w+ cards in (?:your )?hand\b/i] },
  // A repeatable discard empties your hand, unless it hands you a card back; fully without a tap symbol.
  { side: 'provides', id: 'empty-hand', in: ['cost'], all: [/\bdiscard\b/i], weight: 0.8, only: (_, a) => a.kind === 'activated' && !/\bdraws?\b|\b(?:into|to) your hand\b/i.test(a.effect) },
  { side: 'provides', id: 'empty-hand', in: ['cost'], all: [/\bdiscard\b/i], only: (f, a) => repeatsFreely(f, a) && a.kind === 'activated' && !/\bdraws?\b|\b(?:into|to) your hand\b/i.test(a.effect) },
  { side: 'provides', id: 'empty-hand', in: ['effect'], all: [/\bdiscard (?:your hand|all (?:the )?cards in your hand)\b/i], unless: /\bdraws?\b/i },
  { side: 'provides', id: 'empty-hand', in: ['effect'], all: [/\bput (?:a|an|any number of|up to \w+|two|\w+) (?:[\w-]+ )?cards? from your hand onto the battlefield\b/i], weight: 0.6 },
  { side: 'provides', id: 'card-draw', in: ['effect'], all: [/\bdraws? (?:a|an|one|two|three|four|five|six|seven|\w+|X|that many) (?:additional )?cards?\b|\bdraws? cards equal\b/i], unless: /\b(?:target|each|an) opponent draws\b/i },
  { side: 'uses', id: 'card-draw', in: ['trigger'], all: [/\byou draw\b/i] },
  // Graveyard (land cards in it are the more specific mechanic above)
  { side: 'uses', id: 'graveyard', in: ['trigger', 'effect', 'cost'], all: [/\bfrom your graveyard\b|\bcards? in your graveyard\b|\bin your graveyard\b/i], unless: /\bland cards? (?:from|in) your graveyard\b|\blands? from your graveyard\b/i },
  { side: 'provides', id: 'graveyard', in: ['effect'], all: [/\bmills? (?:a|one|two|three|four|five|\w+|X) cards?\b/i], unless: /\b(?:target|each) opponent mills\b/i, weight: 0.8 },
  { side: 'provides', id: 'graveyard', in: ['effect'], all: [/\binto your graveyard\b/i], weight: 0.8 },
  // Graveyard hate that hits your own graveyard too: lasting, once, or only part of it.
  { side: 'stops', id: 'graveyard', in: ['effect'], all: [/\bif a card(?: or token)? would be put into a graveyard from anywhere\b/i] },
  { side: 'stops', id: 'lands-in-graveyard', in: ['effect'], all: [/\bif a card(?: or token)? would be put into a graveyard from anywhere\b/i] },
  { side: 'stops', id: 'graveyard', in: ['effect', 'trigger'], all: [/\bexile all graveyards\b|\bexile all cards from all graveyards\b|\bexile each player's graveyard\b/i], weight: 0.5 },
  { side: 'stops', id: 'lands-in-graveyard', in: ['effect', 'trigger'], all: [/\bexile all graveyards\b|\bexile all cards from all graveyards\b|\bexile each player's graveyard\b/i], weight: 0.5 },
  { side: 'stops', id: 'graveyard', in: ['effect'], all: [/\bcards in graveyards can't be the targets\b|\bplayers can't cast spells from (?:their )?graveyards\b/i], unless: /your opponents control/i, weight: 0.5 },
  { side: 'stops', id: 'lands-in-graveyard', in: ['effect'], all: [/\b(?:permanent|land) cards in graveyards can't enter the battlefield\b|\bcards in graveyards can't be the targets\b/i], unless: /your opponents control/i, weight: 0.5 },
  // Spells
  // Casting a creature spell, or a Vampire spell, rewards creatures or Vampires, not spells.
  { side: 'uses', id: 'spell-cast', in: ['trigger'], all: [/\bcast\b/i, /\bspells?\b/i], unless: new RegExp(`opponent|\\bcast (?:another |an? )?(?:(?:creature|${CREATURE_WORDS})(?: or )?)+ spell`, 'i') },
  { side: 'provides', id: 'spell-cast', in: ['effect'], all: [/\byou may (?:play|cast) (?:that card|those cards|them|it|the exiled cards?|cards exiled)\b|\bcast (?:it|that card|them) without paying\b/i], weight: 0.6 },
  { side: 'uses', id: 'instants-sorceries', in: ['trigger'], all: [/\bcast an? (?:instant or sorcery|instant|sorcery|noncreature)\b/i], unless: /opponent/i },
  { side: 'uses', id: 'instants-sorceries', in: ['effect'], all: [/\binstant (?:and|or) sorcery (?:cards?|spells?)\b|\binstants and sorceries\b/i], weight: 0.8 },
  // Creatures
  { side: 'provides', id: 'creature-tokens', in: ['effect'], all: [/\bcreated?\b|\bcreates\b/i, /\bcreature tokens?\b/i], unless: OTHERS_RE },
  { side: 'provides', id: 'creature-tokens', in: ['effect'], all: [/\bcreate\b/i, /\btokens? (?:that's|that are) (?:a )?cop(?:y|ies) of\b|\btoken cop(?:y|ies) of\b/i], unless: OTHERS_RE, weight: 0.8 },
  { side: 'provides', id: 'creature-tokens', in: ['effect'], all: [/\b(?:gains?|have|has) offspring\b/i] },
  { side: 'uses', id: 'creature-tokens', in: ['cost'], all: [/\btokens you control\b/i] },
  { side: 'uses', id: 'creature-tokens', in: ['trigger', 'effect'], all: [/\bcreature tokens? you control\b|\bwhenever (?:a|one or more) (?:creature )?tokens?\b|\bfor each creature you control\b|\bcreatures you control get \+|\b(?:untapped )?tokens you control\b|\bnumber of (?:other )?creatures you control\b/i] },
  { side: 'provides', id: 'counters', in: ['effect', 'cost'], all: [/\bput (?:a number of|a|an|one|two|three|\w+|X|that many) \+1\/\+1 counters? on (?!this\b)/i] },
  // A creature that keeps growing itself gains from anything that adds counters.
  { side: 'uses', id: 'counters', in: ['effect'], all: [/\bput (?:a|an|one|two|three|\w+|X|that many) \+1\/\+1 counters? on this\b/i], only: repeats, weight: 0.8 },
  { side: 'provides', id: 'counters', in: ['effect'], all: [/\b(?:each other|other|each)\b[^.]*\benters with (?:a|an|one|two|\w+|X) (?:additional )?\+1\/\+1 counters?\b/i] },
  { side: 'provides', id: 'counters', in: ['effect'], all: [/\bput (?:a|an|one|two|three|\w+|X|that many) \+1\/\+1 counters? on this\b|\benters with (?:a|an|one|two|\w+|X) (?:additional )?\+1\/\+1 counters?\b/i], weight: 0.5 },
  { side: 'uses', id: 'counters', in: ['trigger', 'effect'], all: [/\bwith (?:a|one or more) \+1\/\+1 counters? on (?:it|them)\b|\b\+1\/\+1 counters? (?:is|are) put\b|\bproliferate\b|\bfor each \+1\/\+1 counter\b/i] },
  // Poison: ten poison counters and a player loses.
  { side: 'provides', id: 'poison', in: ['effect'], all: [/\bgets? (?:a|an|one|two|three|four|five|\w+|X|that many) poison counters?\b/i], unless: /\byou get\b/i },
  { side: 'uses', id: 'poison', in: ['trigger', 'effect'], all: [/\bpoison counters?\b/i], unless: /\bgets? (?:a|an|one|two|three|four|five|\w+|X|that many) poison counters?\b/i },
  { side: 'uses', id: 'poison', in: ['effect'], all: [/\bproliferate\b/i], weight: 0.8 },
  { side: 'provides', id: 'proliferate', in: ['effect'], all: [/\bproliferate\b/i] },
  { side: 'uses', id: 'proliferate', in: ['trigger'], all: [/\bwhenever you proliferate\b/i] },
  { side: 'provides', id: 'deathtouch', in: ['effect'], all: [/\b(?:gains?|have|has) [^.]*\bdeathtouch\b/i], unless: /\bopponents? control\b/i },
  { side: 'uses', id: 'deathtouch', in: ['trigger', 'effect'], all: [/\bwith deathtouch\b/i] },
  { side: 'provides', id: 'creature-dies', in: ['cost'], all: [/\bsacrifice (?:a|an|another|two|X|\w+) (?:other )?(?:creature|artifact|permanent|nonland permanent)s?\b/i] },
  { side: 'provides', id: 'creature-dies', in: ['effect'], all: [/\beach player sacrifices (?:a|two|\w+) creatures?\b|\bdestroy all creatures\b/i], weight: 0.5 },
  { side: 'uses', id: 'creature-dies', in: ['trigger'], all: [new RegExp(`\\b(?:a|an|another|one or more|each)(?: other)?(?: nontoken)? (?:creatures?|${CREATURE_WORDS})(?: you control)? dies?\\b`, 'i')], unless: /opponent/i },
  { side: 'uses', id: 'creature-dies', in: ['trigger', 'effect'], all: [/\byou sacrifice (?:a|an|another|one or more|\w+) (?:\w+ )?(?:creature|permanent|nontoken|token)s?\b|\bcreature dying causes\b|\bcreature tokens? you control leaves the battlefield\b/i] },
  { side: 'provides', id: 'creature-dies', in: ['effect'], all: [/\bsacrifice (?:another|a|an|two|three|X|\w+) (?:other |nontoken )?(?:creature|permanent|nonland permanent)s?\b/i], unless: /\b(?:each|target|that) (?:player|opponent)s? sacrifices?\b|\bopponents? sacrifices?\b/i },
  { side: 'provides', id: 'creature-dies', in: ['effect'], all: [/\b(?:gains?|have|has) blitz\b/i], weight: 0.8 },
  { side: 'uses', id: 'creature-dies', in: ['trigger'], all: [/\bthis(?: creature)? dies\b/i], weight: 0.5 },
  { side: 'provides', id: 'creature-enters', in: ['effect'], all: [/\bexile\b/i, /\breturn (?:it|that card|them|those cards|the exiled cards?) to the battlefield\b/i] },
  { side: 'provides', id: 'creature-enters', in: ['effect'], all: [/\breturn target creature card\b[^.]*\bto the battlefield\b/i], weight: 0.7 },
  { side: 'uses', id: 'creature-enters', in: ['trigger'], all: [/\b(?:a|another|one or more|each)(?: other)?(?: nontoken)? creatures?(?: you control)? enters?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'attacking', in: ['trigger'], all: [/\battacks?\b|\bdeals combat damage to (?:a player|an opponent|one or more players)\b/i], weight: 0.8 },
  { side: 'uses', id: 'attacking', in: ['effect'], all: [/\bcreature attacking causes\b/i] },
  { side: 'provides', id: 'lifegain', in: ['effect'], all: [/\bgains? (?:\w+|X) life\b|\bgains? life equal\b/i], unless: /\bits controller gains|\btarget player gains|\bopponent gains/i },
  { side: 'uses', id: 'lifegain', in: ['trigger'], all: [/\byou gain life\b/i] },
  { side: 'uses', id: 'lifegain', in: ['trigger', 'effect'], all: [/\byou(?:'ve)? gained (?:\w+ or more )?life\b|\blife you(?:'ve)? gained\b/i] },
  { side: 'provides', id: 'artifacts', in: ['effect'], all: [/\bcreate\b/i, /\b(?:Treasure|Clue|Food|Blood|Map|Powerstone|Gold|artifact) tokens?\b/i], unless: OTHERS_RE, weight: 0.7 },
  { side: 'provides', id: 'artifacts', in: ['effect'], all: [/\bcreate\b/i, /\bartifact creature tokens?\b/i], unless: OTHERS_RE },
  { side: 'uses', id: 'artifacts', in: ['cost', 'effect'], all: [/\bsacrifice (?:a|an|another|two|three|X|\w+) (?:other )?artifacts?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'artifacts', in: ['effect'], all: [/\beach (?:non-[\w]+ )?artifact\b[^.]*\byou control\b/i] },
  { side: 'uses', id: 'artifacts', in: ['trigger', 'effect'], all: [/\bartifacts? you control\b|\bfor each artifact\b|\bcast an artifact spell\b|\bartifacts? (?:you control )?enters?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'enchantments', in: ['trigger', 'effect'], all: [/\benchantments? you control\b|\bcast an enchantment spell\b|\bfor each enchantment\b|\benchantment (?:you control )?enters\b/i], unless: /opponent/i },
  { side: 'uses', id: 'enchantments', in: ['trigger', 'effect'], all: [/\bAuras? you control\b|\benchantment cards?\b|\b(?:each|and) (?:non-[\w]+ )?enchantment\b[^.]*\byou control\b/i], unless: /opponent/i, weight: 0.8 },
  { side: 'uses', id: 'equipment-auras', in: ['trigger', 'effect'], all: [/\bequipped creatures?\b|\benchanted creatures?\b|\bfor each (?:Aura|Equipment)\b|\b(?:Auras?|Equipment) (?:you control|attached)\b/i], only: (facts) => !hasType(facts, 'Equipment') && !hasType(facts, 'Aura') },
  { side: 'provides', id: 'treasure', in: ['effect'], all: [/\bcreate\b/i, /\bTreasure tokens?\b/i], unless: OTHERS_RE },
  { side: 'uses', id: 'treasure', in: ['trigger', 'effect', 'cost'], all: [/\bTreasures? you control\b|\bsacrifice (?:a|an|two|three|four|five|X|\w+) Treasures?\b|\bTreasure tokens? you control\b/i] },
  // Reanimation, discarding everyone's cards, spells granted to tokens
  { side: 'uses', id: 'graveyard', in: ['effect'], all: [/\b(?:return|put)s? (?:up to (?:one|two|\w+) )?target [^.]*?\bcreature cards?\b[^.]*?\bfrom (?:a|your|an opponent's|their|any) graveyards? (?:to|onto) the battlefield\b/i] },
  { side: 'provides', id: 'discard', in: ['effect'], all: [/\beach player discards\b/i], weight: 0.8 },
  { side: 'uses', id: 'instants-sorceries', in: ['effect'], all: [/\bwhenever you cast a noncreature spell\b/i], weight: 0.8 },
  { side: 'uses', id: 'spell-cast', in: ['effect'], all: [/\bwhenever you cast an? (?:noncreature |instant or sorcery )?spell\b/i], weight: 0.8 },
  { side: 'provides', id: 'graveyard', in: ['effect'], all: [/\b(?:have|has|gains?) dredge\b/i] },
  // Opponents losing life
  { side: 'provides', id: 'drain', in: ['effect'], all: [TABLE_BURN_RE] },
  { side: 'provides', id: 'drain', in: ['effect'], all: [TARGET_BURN_RE], weight: 0.6 },
  { side: 'uses', id: 'drain', in: ['trigger', 'effect'], all: [/\b(?:an|each) opponent loses life\b|\bopponents? (?:is|are) dealt (?:combat )?damage\b|\bdeals exactly 1 damage\b/i] },
  // Legends, flyers, free spells, planeswalkers, copies
  { side: 'uses', id: 'legends', in: ['trigger', 'effect', 'cost'], all: [/\blegendary (?:creatures?|permanents?|spells?|cards?|nonland|nontoken|planeswalkers?|artifacts?)\b|\bhistoric\b/i], unless: /\bward\b/i },
  { side: 'provides', id: 'flying', in: ['effect'], all: [/\b(?:gains?|have|has) [^.]*\bflying\b/i], unless: /\bopponents? control\b|\bwithout flying\b|\bcreate\b/i },
  { side: 'uses', id: 'flying', in: ['trigger', 'effect'], all: [/\bwith flying\b|\bflying creatures?\b/i, /\byou control\b/i], unless: /\bwithout flying\b|\bopponents? control\b/i },
  { side: 'provides', id: 'cascade', in: ['effect'], all: [/\b(?:has|have|gains?) "?cascade\b|\bdiscover (?:\d+|X)\b/i] },
  { side: 'provides', id: 'cascade', in: ['effect'], all: [/\buntil you exile a\b[^.]*\bnonland card\b/i, /\bwithout paying\b/i], whole: true },
  { side: 'uses', id: 'planeswalkers', in: ['trigger', 'effect'], all: [/\bplaneswalkers? you control\b|\bloyalty abilit(?:y|ies)\b|\bplaneswalker spells?\b|\bloyalty counters?\b/i], unless: /\byou or (?:a )?planeswalkers? you control\b/i },
  { side: 'uses', id: 'planeswalkers', in: ['effect'], all: [/\bplaneswalker cards?\b|\bproliferate\b/i], weight: 0.8 },
  { side: 'provides', id: 'copies', in: ['effect'], all: [/\bcreate\b|\bbecomes?\b|\benters? as\b/i, /\bcop(?:y|ies) of\b/i], unless: /\bspells?\b|\babilit(?:y|ies)\b/i },
  { side: 'provides', id: 'copies', in: ['effect'], all: [/\b(?:gains?|have|has) offspring\b/i] },
  // Toughness, monarch, -1/-1 counters, upkeeps, bending, X spells, any creature type
  { side: 'uses', id: 'toughness', in: ['trigger', 'effect'], all: [/\bequal to (?:its|their) toughness\b|\bwith defender\b|\bas though (?:it|they) didn't have defender\b|\b(?:greatest|total) toughness\b/i], unless: /\bcreate\b/i },
  { side: 'provides', id: 'toughness', in: ['effect'], all: [/\bcreate\b/i, /\bwith defender\b/i] },
  { side: 'provides', id: 'monarch', in: ['effect'], all: [/\byou become the monarch\b/i] },
  { side: 'uses', id: 'monarch', in: ['trigger', 'effect'], all: [/\bmonarch\b/i], unless: /\byou become the monarch\b/i },
  { side: 'provides', id: 'minus-counters', in: ['effect'], all: [/\bput[^.]*-1\/-1 counters?\b|\bblights? (?:\d+|X|\w+)\b/i], unless: /\bward\b/i },
  { side: 'uses', id: 'minus-counters', in: ['trigger', 'effect'], all: [/-1\/-1 counters? (?:is|are) put\b|\bfor each -1\/-1 counter\b|\bwith (?:a|one or more) -1\/-1 counters? on\b/i] },
  { side: 'uses', id: 'minus-counters', in: ['effect'], all: [/\bproliferate\b/i], weight: 0.6 },
  { side: 'provides', id: 'upkeep', in: ['effect'], all: [/\badditional upkeep steps?\b/i] },
  { side: 'uses', id: 'upkeep', in: ['trigger'], all: [/^at the beginning of your upkeep\b/i], weight: 0.5 },
  { side: 'uses', id: 'bending', in: ['trigger'], all: [/\byou (?:waterbend|earthbend|firebend|airbend)\b/i] },
  { side: 'uses', id: 'x-spells', in: ['trigger', 'effect'], all: [/\{X\} in (?:its|their) mana costs?\b|\bspells? with \{X\}/i] },
  { side: 'uses', id: 'tribe-any', in: ['trigger', 'effect'], all: [/\bchoose a creature type\b|\bchosen (?:creature )?type\b|\bshares? a creature type\b|\bcreature type of your choice\b/i] },
  // Roles
  { side: 'roles', id: 'ramp', in: ['effect'], all: [/^add\b/i], only: (facts, a) => !facts.land && a.kind === 'activated' && /\{T\}/.test(a.cost ?? '') },
  { side: 'roles', id: 'ramp', in: ['effect'], all: [/^add\b/i], only: (facts, a) => !facts.land && a.kind === 'triggered' && repeats(facts, a), weight: 0.8 },
  { side: 'roles', id: 'ramp', in: ['effect'], all: [/\badd (?:\{|one mana|two mana|\w+ mana)/i], only: (facts, a) => !facts.land && a.kind === 'static' && isSpell(facts), weight: 0.3 },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\b(?:destroy|exile) (?:target|up to (?:one|two|three|\w+) target|another target)\b[^.]*\b(?:creature|artifact|enchantment|planeswalker|permanent|battle)s?\b/i], unless: /\bfrom (?:a|your|their|target player's|an opponent's) graveyard\b|\byou control\b/i },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\bdeals? (?:\d+|X|that much|damage equal|\w+)(?: damage)?[^.]*\bto (?:any target|target (?:creature|planeswalker|attacking|blocking|player or planeswalker|creature or planeswalker|battle))\b/i] },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\bfights? (?:target|another target|up to one target)\b/i] },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\btarget creature (?:an opponent controls )?gets -(?:\d+|X)\/-(?:\d+|X)\b/i] },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\breturn target (?:nonland permanent|creature|artifact|enchantment|permanent)\b[^.]*\bto its owner's hand\b/i], weight: 0.6 },
  { side: 'roles', id: 'board-wipe', in: ['effect'], all: [/\b(?:destroy|exile) all (?:other )?(?:creatures|nonland permanents|artifacts|enchantments|permanents|planeswalkers)\b|\bdeals? (?:\d+|X) damage to each creature\b|\ball creatures get -|\beach creature gets -|\breturn all (?:other )?(?:creatures|nonland permanents)\b/i] },
  { side: 'roles', id: 'counterspell', in: ['effect'], all: [/\bcounter target\b/i] },
  // Protection: everything you control beats gear for one creature, which beats a one-off.
  { side: 'roles', id: 'protection', in: ['effect'], all: [/\b(?:creatures|permanents) you control (?:gain|have) (?:hexproof|indestructible|shroud|protection)\b|\b(?:creatures|permanents) you control phase out\b/i] },
  { side: 'roles', id: 'protection', in: ['effect'], all: [/\b(?:equipped|enchanted) creature (?:has|gains) (?:hexproof|indestructible|shroud|protection)\b/i], weight: 0.8 },
  { side: 'roles', id: 'protection', in: ['effect'], all: [/\btarget (?:creature|permanent) you control gains (?:hexproof|indestructible|shroud|protection)\b|\bphases? out\b/i], weight: 0.7 },
  // Card search: any card beats one kind of card; a card with one name is too narrow to count.
  { side: 'roles', id: 'tutor', in: ['effect'], all: [/\bsearch your library for (?:a|an|up to \w+) cards?\b/i, TUTOR_TO_RE], unless: TUTOR_SKIP_RE },
  { side: 'roles', id: 'tutor', in: ['effect'], all: [/\bsearch your library for\b/i, TUTOR_TO_RE], unless: TUTOR_SKIP_RE, weight: 0.6 },
  // Wipes that take your lands with everything else.
  ...(['land-count', ...BASIC_TYPES.map(([type]) => typeId(type))] as MechanicId[]).map(
    (id): Detector => ({ side: 'stops', id, in: ['effect'], all: [LAND_WIPE_RE], unless: /\byou don't control\b|\byour opponents control\b/i })
  ),
  { side: 'roles', id: 'evasion', in: ['effect'], all: [/\b(?:creatures you control|target creature|equipped creature|enchanted creature|creatures? you control)\b[^.]*\b(?:gains?|have|has) (?:flying|trample|menace|shadow)\b|\bcan't be blocked\b/i] },
  // Direct damage: to every opponent beats one target, and again and again beats once a turn, which beats once.
  { side: 'roles', id: 'burn', in: ['effect'], all: [TABLE_BURN_RE], only: repeats },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TABLE_BURN_RE], weight: 0.6 },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TARGET_BURN_RE], only: repeatsFreely },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TARGET_BURN_RE], only: repeats, weight: 0.8 },
  { side: 'roles', id: 'burn', in: ['effect'], all: [/\bdeals? (?:X|that much|damage equal)\b/i, TARGET_BURN_RE], weight: 0.6 },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TARGET_BURN_RE], weight: 0.3 },
  { side: 'roles', id: 'extra-turn', in: ['effect'], all: [/\btakes? an extra turn\b|\bextra turns? after this one\b/i] },
  { side: 'roles', id: 'land-denial', in: ['effect'], all: [LAND_WIPE_RE] },
  { side: 'roles', id: 'land-denial', in: ['effect'], all: [/\blands? (?:don't|doesn't) untap\b|\bcan't untap more than one land\b/i], weight: 0.8 },
  { side: 'roles', id: 'mill', in: ['effect'], all: [/\b(?:target player|target opponent|each opponent|each player|that player|defending player) mills\b/i] },
  // Rad counters mill their player each turn.
  { side: 'roles', id: 'mill', in: ['effect'], all: [/\b(?:each player|each opponent|target player|target opponent|that player) gets? (?:a|an|one|two|three|\w+|X) rad counters?\b/i], weight: 0.8 },
  { side: 'roles', id: 'card-advantage', in: ['effect'], all: [/\bexile the top\b/i, /\byou may (?:play|cast)\b/i], whole: true },
  { side: 'roles', id: 'card-advantage', in: ['effect'], all: [/\breturn\b[^.]*\bfrom your graveyard to your hand\b/i], weight: 0.6 },
  { side: 'roles', id: 'card-advantage', in: ['effect'], all: [/\bplay lands? from the top of your library\b/i], weight: 0.7 }
]

/** Types and subtypes of each face. */
function facesOf(typeLine: string): Facts['faces'] {
  return typeLine.split(' // ').map((face) => {
    const [types, subtypes = ''] = face.split(' — ')
    return { types: types.trim().split(/\s+/), subtypes: subtypes.trim().split(/\s+/).filter(Boolean) }
  })
}

/** Any face has the type or subtype. */
const hasType = (facts: Facts, type: string) => facts.faces.some((f) => f.types.includes(type) || f.subtypes.includes(type))
/** The front face is an instant or sorcery. */
const isSpell = (facts: Facts) => facts.faces[0].types.includes('Instant') || facts.faces[0].types.includes('Sorcery')

/** Sentences of an ability part. */
const sentences = (text: string) => text.split(/(?<=[.;])\s+/).filter(Boolean)

/** Parses a count word: `two` → 2, `X` → 3. */
const count = (word: string) => NUMBERS[word.toLowerCase()] ?? (Number.parseInt(word, 10) || 1)

/**
 * Net cards an ability adds to your hand: cards drawn minus cards discarded, minus the spell
 * itself for instants and sorceries. Only forced draws count; "you may draw" is a choice.
 * @returns Net hand change; 0 when it draws nothing.
 */
function netDraw(facts: Facts, ability: Ability): number {
  const effect = ability.effect.replace(OTHERS_DRAW_RE, '').replace(OTHERS_DISCARD_RE, '')
  if (/\bif you have no cards in hand\b/i.test(effect)) return 0
  const draw = /(?<!may )\bdraws? (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X|that many)\b[^.]*?\bcards?\b/i.exec(effect)
  if (!draw) return 0
  if (/\bdiscard (?:your hand|all (?:the )?cards in your hand)\b|\bdiscards (?:their|his or her) hand\b/i.test(effect)) return 3
  let net = count(draw[1]) + (/\bplus one\b/i.test(effect) ? 1 : 0)
  const discard = /\bdiscards? (a|an|one|two|three|four|that many|X|\d+)\b[^.]*?\bcards?\b/i.exec(effect)
  if (discard) net -= count(discard[1])
  if (ability.kind === 'activated') net -= discardCost(ability)
  // The card itself left your hand: a spell, or a permanent drawing once as it enters.
  const entersOnce = ability.kind === 'triggered' && /^this(?: [\w-]+)? enters$/i.test(ability.trigger ?? '')
  if (isSpell(facts) && ability.kind === 'static') net -= 1 + facts.spellDiscards
  else if (entersOnce) net -= 1
  return net
}

/** Cards an ability's cost discards. */
function discardCost(ability: Ability): number {
  const discard = /\bdiscard (a|an|one|two|three)\b/i.exec(ability.cost ?? '')
  return discard ? count(discard[1]) : 0
}

/** Adds a signal, keeping the strongest per id. */
function add<T extends string>(list: Array<Signal<T>>, signal: Signal<T>): void {
  const existing = list.findIndex((s) => s.id === signal.id)
  if (existing < 0) list.push(signal)
  else if (signal.weight > list[existing].weight) list[existing] = signal
}

/** Mechanics a provided mechanic leads to, with how strongly. */
const PROVIDE_IMPLIES: Partial<Record<MechanicId, Array<[MechanicId, number]>>> = {
  'extra-land-drop': [['land-play', 1]],
  'land-play': [['land-enters', 1]],
  'land-enters': [['land-count', 0.5]],
  'land-leaves': [['lands-in-graveyard', 1]],
  'lands-in-graveyard': [['graveyard', 1]],
  discard: [['graveyard', 0.5], ['lands-in-graveyard', 0.5]],
  'creature-tokens': [['creature-enters', 0.7]],
  treasure: [['artifacts', 0.8]]
}

/** Keywords and ability words that use or provide a mechanic. */
const KEYWORDS: Array<{ keywords: string[]; side: Side; id: MechanicId | RoleId; weight: number }> = [
  { keywords: ['madness'], side: 'uses', id: 'discard', weight: 0.8 },
  { keywords: ['cycling'], side: 'provides', id: 'discard', weight: 0.6 },
  { keywords: ['landfall'], side: 'uses', id: 'land-enters', weight: 1 },
  { keywords: ['hellbent'], side: 'uses', id: 'empty-hand', weight: 1 },
  { keywords: ['flashback', 'escape', 'unearth', 'retrace', 'jump-start', 'embalm', 'eternalize', 'disturb', 'aftermath', 'delirium', 'threshold', 'scavenge', 'encore'], side: 'uses', id: 'graveyard', weight: 0.8 },
  { keywords: ['dredge'], side: 'provides', id: 'graveyard', weight: 1 },
  { keywords: ['lifelink'], side: 'provides', id: 'lifegain', weight: 0.7 },
  { keywords: ['infect', 'toxic', 'poisonous'], side: 'provides', id: 'poison', weight: 1 },
  { keywords: ['corrupted'], side: 'uses', id: 'poison', weight: 1 },
  { keywords: ['flying'], side: 'provides', id: 'flying', weight: 0.6 },
  { keywords: ['cascade', 'discover'], side: 'provides', id: 'cascade', weight: 1 },
  { keywords: ['defender'], side: 'provides', id: 'toughness', weight: 0.8 },
  { keywords: ['wither', 'infect'], side: 'provides', id: 'minus-counters', weight: 0.8 },
  { keywords: ['earthbend', 'airbend', 'waterbend', 'firebending'], side: 'provides', id: 'bending', weight: 1 },
  // Keyword actions whose reminder text is what they do.
  { keywords: ['explore'], side: 'provides', id: 'counters', weight: 0.8 },
  { keywords: ['connive'], side: 'provides', id: 'discard', weight: 0.8 },
  { keywords: ['amass'], side: 'provides', id: 'creature-tokens', weight: 0.8 },
  { keywords: ['amass'], side: 'provides', id: 'counters', weight: 0.8 },
  { keywords: ['mobilize'], side: 'provides', id: 'creature-tokens', weight: 1 },
  { keywords: ['offspring', 'populate', 'myriad'], side: 'provides', id: 'creature-tokens', weight: 0.8 },
  { keywords: ['offspring', 'populate', 'myriad'], side: 'provides', id: 'copies', weight: 0.8 },
  { keywords: ['blitz'], side: 'provides', id: 'creature-dies', weight: 0.8 },
  { keywords: ['ninjutsu', 'commander ninjutsu'], side: 'uses', id: 'attacking', weight: 0.8 },
  { keywords: ['changeling'], side: 'provides', id: 'tribe-any', weight: 0.6 },
  { keywords: ['deathtouch'], side: 'provides', id: 'deathtouch', weight: 0.6 },
  { keywords: ['flying', 'trample', 'menace', 'shadow', 'horsemanship', 'skulk', 'fear', 'intimidate'], side: 'roles', id: 'evasion', weight: 0.5 }
]

/** Abilities that are only mana, an entry condition, or a keyword line: not a land's "special" ability. */
const PLAIN_LAND_ABILITY_RE =
  /^(?:Add\b|This (?:land )?enters tapped|this enters tapped|As this (?:land )?enters|If you control two or fewer other lands|[A-Z][a-z]*cycling\b|Cycling\b|Indestructible$)/

/** @returns The card's profile: what it provides, uses and stops, and its deck roles. */
export function readCard(card: ReadableCard): CardProfile {
  const faces = facesOf(card.typeLine)
  const abilities = parseAbilities(card.name, card.text)
  const facts: Facts = {
    card,
    faces,
    land: faces[0].types.includes('Land'),
    keywords: new Set(card.keywords.map((k) => k.toLowerCase())),
    spellDiscards: abilities.reduce((sum, a) => sum + (a.kind === 'static' ? discardCost(a) : 0), 0)
  }
  const profile: CardProfile = { provides: [], uses: [], stops: [], roles: [] }

  for (const ability of abilities) {
    const parts: Record<Part, string> = {
      trigger: ability.trigger ?? '',
      cost: ability.cost ?? '',
      effect: ability.effect
    }
    for (const detector of DETECTORS) {
      if (detector.only && !detector.only(facts, ability)) continue
      if (detector.side === 'uses' && ability.kind === 'triggered' && DRAWBACK_RE.test(ability.effect)) continue
      const hit = detector.in.some((part) =>
        (detector.whole ? [parts[part]] : sentences(parts[part])).some(
          (sentence) => detector.all.every((re) => re.test(sentence)) && !detector.unless?.test(sentence)
        )
      )
      if (hit) add(profile[detector.side] as Signal<string>[], { id: detector.id, weight: detector.weight ?? 1, evidence: ability.text })
    }
    const ownDiscard = ability.effect.replace(OTHERS_DISCARD_RE, '')
    if (YOU_DISCARD_RE.test(ownDiscard)) add(profile.provides, { id: 'discard', weight: 1, evidence: ability.text })
    readLandTypes(ability, profile)
    readHandSize(facts, ability, profile)
  }

  for (const { keywords, side, id, weight } of KEYWORDS) {
    const keyword = keywords.find((k) => facts.keywords.has(k))
    if (keyword) add(profile[side] as Signal<string>[], { id, weight, evidence: titleCase(keyword) })
  }
  readTypeLine(facts, abilities, profile)
  readSubtypes(facts, abilities, profile)
  readRolesFromMechanics(facts, abilities, profile)
  for (const signal of profile.provides) {
    if (MASS_MECHANICS.has(signal.id) && MASS_RE.test(signal.evidence)) signal.mass = true
  }
  addImplied(profile)
  return profile
}

/** Land mechanics that can happen to all your lands at once. */
const MASS_MECHANICS = new Set<MechanicId>([
  'land-enters', 'land-leaves', 'lands-in-graveyard', ...BASIC_TYPES.map(([type]) => typeId(type))
])
/** Rules text acting on all your lands at once. */
const MASS_RE = /\blands you control are every basic land type\b|\b(?:all|any number of)\b[^.]*\blands?\b/i

/** Capitalizes a keyword for display. */
const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** Basic land types the card gives you or counts. */
function readLandTypes(ability: Ability, profile: CardProfile): void {
  const text = `${ability.trigger ?? ''} ${ability.effect}`
  const searches = /\bsearch your library for\b/i.test(ability.effect)
  // A land put into your hand still has to be played: later, and it uses a land drop.
  const toHand = /\binto your hand\b/i.test(ability.effect) && !/\bonto the battlefield\b/i.test(ability.effect)
  for (const [type, plural] of BASIC_TYPES) {
    const id = typeId(type)
    const evidence = ability.text
    // Searching for a basic or any land finds this type whenever the deck wants it to.
    if (searches && new RegExp(`\\b${type}\\b`).test(ability.effect)) add(profile.provides, { id, weight: toHand ? 0.6 : 1, evidence })
    else if (searches && /\bbasic land\b|\bland cards?\b/i.test(ability.effect)) add(profile.provides, { id, weight: toHand ? 0.5 : 0.8, evidence })
    // Lands returning to the battlefield bring back whatever types they have.
    else if (/\bland cards?\b[^.]*\b(?:onto|to) the battlefield\b/i.test(ability.effect)) add(profile.provides, { id, weight: 0.5, evidence })
    if (/\bevery basic land type\b/i.test(ability.effect)) add(profile.provides, { id, weight: 1, evidence })
    if (new RegExp(`\\b(?:are|is an?|become|becomes an?) ${plural === type ? type : `(?:${type}|${plural})`}\\b`).test(ability.effect)) {
      add(profile.provides, { id, weight: 0.5, evidence })
    }
    const counts = new RegExp(
      `\\b(?:${type}|${plural}) you control\\b|\\bfor each ${type}\\b|\\bother ${plural}\\b|\\bcontrol (?:a|an|\\w+|at least \\w+)(?: other)? (?:${type}|${plural})\\b`
    )
    // "Enters tapped unless you control a Mountain" only helps the land itself a little.
    if (!searches && counts.test(text)) add(profile.uses, { id, weight: /\benters tapped unless\b/i.test(text) ? 0.3 : 1, evidence })
  }
}

/** Draws that fill your hand, which turn off empty-hand payoffs. */
function readHandSize(facts: Facts, ability: Ability, profile: CardProfile): void {
  const net = netDraw(facts, ability)
  if (net >= 2) add(profile.stops, { id: 'empty-hand', weight: 1, evidence: ability.text })
  else if (net === 1) {
    // One card at a time only adds up when it repeats on its own (a forced trigger).
    const weight = ability.kind === 'triggered' || isSpell(facts) ? 0.3 : 0
    if (weight > 0) add(profile.stops, { id: 'empty-hand', weight, evidence: ability.text })
  }
}

/** Findings from the type line and keywords: land types, special lands, card types. */
function readTypeLine(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const { card } = facts
  const landFaces = facts.faces.filter((f) => f.types.includes('Land'))
  for (const [type] of BASIC_TYPES) {
    if (landFaces.some((f) => f.subtypes.includes(type))) add(profile.provides, { id: typeId(type), weight: 1, evidence: card.typeLine })
  }
  // Landcycling finds a land to play; Mountaincycling a Mountain.
  for (const keyword of facts.keywords) {
    const cycling = /^(basic land|land|plains|island|swamp|mountain|forest)cycling$/.exec(keyword)
    if (!cycling) continue
    const evidence = titleCase(keyword)
    for (const [type] of BASIC_TYPES) {
      if ([type.toLowerCase(), 'basic land', 'land'].includes(cycling[1])) add(profile.provides, { id: typeId(type), weight: 0.5, evidence })
    }
    add(profile.provides, { id: 'land-play', weight: 0.5, evidence })
  }
  if (facts.land && !facts.faces[0].types.includes('Basic')) {
    const special = abilities.find((a) => a.kind === 'triggered' || !PLAIN_LAND_ABILITY_RE.test(a.effect || a.text))
    if (special) add(profile.provides, { id: 'nonbasic-utility', weight: 1, evidence: special.text })
  }
  if (facts.land) add(profile.roles, { id: 'land', weight: 1, evidence: card.typeLine })
  else if (landFaces.length > 0) add(profile.roles, { id: 'land', weight: 0.5, evidence: card.typeLine })
  const front = facts.faces[0].types
  if (front.includes('Instant') || front.includes('Sorcery')) add(profile.provides, { id: 'instants-sorceries', weight: 0.5, evidence: card.typeLine })
  if (front.includes('Artifact')) add(profile.provides, { id: 'artifacts', weight: 0.6, evidence: card.typeLine })
  if (front.includes('Enchantment')) add(profile.provides, { id: 'enchantments', weight: 0.6, evidence: card.typeLine })
  if (hasType(facts, 'Equipment') || hasType(facts, 'Aura')) add(profile.provides, { id: 'equipment-auras', weight: 1, evidence: card.typeLine })
  if (front.includes('Legendary')) add(profile.provides, { id: 'legends', weight: 0.6, evidence: card.typeLine })
  if (front.includes('Planeswalker')) add(profile.provides, { id: 'planeswalkers', weight: 0.6, evidence: card.typeLine })
  if (/\{X\}/.test(card.manaCost ?? '')) add(profile.provides, { id: 'x-spells', weight: 0.6, evidence: card.manaCost! })
}

/** Subtypes the card is, makes as tokens, or rewards: Vampires you control, a Dragon spell. */
function readSubtypes(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const { card } = facts
  for (const face of facts.faces) {
    const creature = face.types.some((t) => t === 'Creature' || t === 'Kindred' || t === 'Tribal')
    for (const sub of face.subtypes) {
      const id = SUBTYPE_FORMS.get(sub)
      if (id && (creature || !CREATURE_TYPE_IDS.has(id))) add(profile.provides, { id, weight: 0.6, evidence: card.typeLine })
    }
  }
  for (const ability of abilities) {
    const evidence = ability.text
    // Tokens of a type, and amassed Armies, make more of it; the first type of an "Elf Warrior" token most.
    const rest = ability.text.replace(SUBTYPE_TOKEN_RE, (phrase) => {
      for (const [i, word] of (phrase.match(SUBTYPE_RE) ?? []).entries()) add(profile.provides, { id: SUBTYPE_FORMS.get(word)!, weight: i === 0 ? 1 : 0.6, evidence })
      return ' '
    })
    for (const match of rest.matchAll(SUBTYPE_RE)) {
      const id = SUBTYPE_FORMS.get(match[0])!
      // "Goblin Formula — …" names an ability; it isn't about Goblins.
      if (ABILITY_NAME_RE.test(rest.slice(match.index + match[0].length))) continue
      const before = (rest.slice(0, match.index).split(/[.;,]/).at(-1) ?? '').replace(TRAILING_SUBTYPES_RE, '')
      if (SUBTYPE_SKIP_RE.test(before)) continue
      if (SUBTYPE_BECOMES_RE.test(before)) {
        add(profile.provides, { id, weight: 1, evidence })
        continue
      }
      add(profile.uses, { id, weight: 1, evidence })
      const parent = SUBTYPE_PARENTS[id]
      if (parent) add(profile.uses, { id: parent, weight: 0.8, evidence })
      if (CREATURE_TYPE_IDS.has(id) && /\bsacrifice (?:a|an|another|two|three|four|five|X|\w+) (?:other |nontoken )?$/i.test(before)) {
        add(profile.provides, { id: 'creature-dies', weight: 1, evidence })
      }
    }
  }
}

/** Roles that follow from mechanics: extra lands are ramp, real card draw is card advantage. */
function readRolesFromMechanics(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const provided = (id: MechanicId) => profile.provides.find((s) => s.id === id)
  if (facts.land) return
  const extraLand = provided('extra-land-drop')
  if (extraLand) add(profile.roles, { id: 'ramp', weight: extraLand.weight, evidence: extraLand.evidence })
  // Other cards becoming lands makes no mana: they don't gain the ability to tap for it.
  const landsOut = provided('land-enters')
  if (landsOut && !/\bare lands\b/i.test(landsOut.evidence)) add(profile.roles, { id: 'ramp', weight: 1, evidence: landsOut.evidence })
  const treasure = provided('treasure')
  if (treasure) add(profile.roles, { id: 'ramp', weight: 0.6, evidence: treasure.evidence })
  // Card advantage: draws that net at least one card (loot and rummage only filter).
  for (const ability of abilities) {
    const optional = /\byou may draw\b/i.test(ability.effect)
    const net = optional ? 1 : netDraw(facts, ability)
    const repeats = ability.kind !== 'static' || !isSpell(facts)
    if (net >= 1 && (net >= 2 || repeats || isSpell(facts))) {
      add(profile.roles, { id: 'card-advantage', weight: net >= 2 || repeats ? 1 : 0.5, evidence: ability.text })
    }
  }
}

/** Adds what provided mechanics lead to, e.g. discarding also fills the graveyard. */
function addImplied(profile: CardProfile): void {
  for (let changed = true; changed; ) {
    changed = false
    for (const signal of [...profile.provides]) {
      for (const [id, factor] of PROVIDE_IMPLIES[signal.id] ?? []) {
        const weight = signal.weight * factor
        const existing = profile.provides.find((s) => s.id === id)
        if (existing && existing.weight >= weight) continue
        add(profile.provides, { id, weight, evidence: signal.evidence, via: signal.via ?? signal.id, ...(signal.mass && { mass: true as const }) })
        changed = true
      }
    }
  }
}
