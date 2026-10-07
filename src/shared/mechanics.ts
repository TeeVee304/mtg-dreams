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
  use: `counts your ${plural}`
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
    use: 'gets better with more lands'
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
  }
} as const satisfies Record<string, MechanicInfo>

/** Mechanic id. */
export type MechanicId = keyof typeof MECHANIC_INFO

/** Mechanics in plain words, by id. */
export const MECHANICS: Record<MechanicId, MechanicInfo> = MECHANIC_INFO

/** A deck role in plain words. */
export interface RoleInfo {
  label: string
  explain: string
  term?: string
}

/** Deck roles the detectors know. */
const ROLE_INFO = {
  land: { label: 'Land', explain: 'Makes mana; most decks play 35 to 38 of them.' },
  ramp: { label: 'Mana boost', explain: 'Gets you more mana sooner than one land a turn.', term: 'ramp' },
  'card-advantage': {
    label: 'More cards',
    explain: 'Gives you more cards to play than your opponents.',
    term: 'card advantage'
  },
  removal: { label: 'Removal', explain: 'Gets rid of one threat.', term: 'spot removal' },
  'board-wipe': { label: 'Board wipe', explain: 'Gets rid of many creatures or permanents at once.', term: 'wrath' },
  counterspell: { label: 'Counterspell', explain: 'Stops a spell as it is being cast.', term: 'counter' },
  protection: { label: 'Protection', explain: 'Keeps your important cards safe.', term: 'protection' },
  tutor: { label: 'Card search', explain: 'Finds a specific card from your library.', term: 'tutor' },
  evasion: { label: 'Evasion', explain: 'Gets creatures past blockers.', term: 'evasion' },
  burn: { label: 'Direct damage', explain: 'Deals damage straight to players or creatures.', term: 'burn' }
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
  /** All must match within one sentence. */
  all: RegExp[]
  /** Skips sentences that match. */
  unless?: RegExp
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
/** Effects that help another player rather than you. */
const OTHERS_RE = /\bopponent|\btheir library\b|\bits controller\b|\bthat player\b|\btarget player\b/i
/** Damage or life loss for every opponent at once. */
const TABLE_BURN_RE = /\bdeals? [^.]*?\bdamage to (?:each opponent|each player)\b|\beach opponent loses (?:\d+|X|\w+) life\b/i
/** Damage to one player, or to any target. */
const TARGET_BURN_RE = /\bdeals? (?:\d+|X|that much|damage equal|\w+)(?: damage)?[^.]*\bto (?:any target|target player|target opponent|that player)\b/i
/** Triggers that happen once: as the card enters, dies, turns face up, or a Saga chapter. */
const ONCE_TRIGGER_RE = /^(?:chapter|this(?: [\w-]+)? (?:enters|dies|is turned face up))$/i

/** The ability can happen again and again: activated, a recurring trigger, or a permanent's static ability. */
const repeats = (facts: Facts, ability: Ability) =>
  ability.kind === 'activated' ||
  (ability.kind === 'triggered' && !ONCE_TRIGGER_RE.test(ability.trigger ?? '')) ||
  (ability.kind === 'static' && !isSpell(facts))

/** Text detectors, in no particular order; the strongest finding per id wins. */
const DETECTORS: Detector[] = [
  // Land drops and playing lands
  { side: 'provides', id: 'extra-land-drop', in: ['effect'], all: [/\bplay (?:an|one|two|three|\w+) additional lands?\b(?! this turn)|\bplay any number of (?:additional )?lands\b/i] },
  { side: 'provides', id: 'extra-land-drop', in: ['effect'], all: [/\badditional lands? this turn\b/i], weight: 0.5 },
  { side: 'stops', id: 'extra-land-drop', in: ['effect'], all: [/\bcan't play (?:more than one )?lands?\b/i], unless: /\bopponents?\b|\btarget player\b|\bother players\b|\bif this creature was cast\b/i },
  { side: 'uses', id: 'land-play', in: ['trigger'], all: [/\b(?:you|a player) plays? (?:a|an|your \w+) land\b|\bplay a land or cast\b/i] },
  { side: 'uses', id: 'land-play', in: ['effect'], all: [/\bplayed (?:a|an|two or more|\w+) lands? this turn\b/i], weight: 0.7 },
  { side: 'provides', id: 'land-play', in: ['effect'], all: [/\bplay lands? from (?:the top of your library|your graveyard|exile|among)\b/i] },
  { side: 'provides', id: 'land-play', in: ['effect', 'cost'], all: [/\breturn\b/i, /\blands?\b|\bland cards?\b/i, /\bto (?:its owner's|your|their owners') hands?\b/i], unless: /opponent/i, weight: 0.7 },
  { side: 'provides', id: 'land-play', in: ['effect'], all: [/\bsearch your library for\b/i, LAND_WORD_RE, /\b(?:into|to) your hand\b/i], weight: 0.6 },
  { side: 'provides', id: 'land-play', in: ['effect'], all: [/\byou may play (?:that card|those cards|them|it|the exiled cards?|cards exiled)\b/i], weight: 0.4 },
  // Lands entering, leaving and counting
  { side: 'uses', id: 'land-enters', in: ['trigger'], all: [/\b(?:a|an|another|one or more|each|two or more)(?: [\w-]+)? lands?\b[^,]*\benters?\b/i], unless: /opponent/i },
  { side: 'provides', id: 'land-enters', in: ['effect'], all: [/\b(?:put|puts|return|returns|search)\b/i, LAND_WORD_RE, /\b(?:onto|to) the battlefield\b/i], unless: OTHERS_RE },
  { side: 'provides', id: 'land-leaves', in: ['cost'], all: [/\bsacrifice (?:a|an|another|two|three|X|\w+) lands?\b/i] },
  { side: 'provides', id: 'land-leaves', in: ['cost'], all: [/\bsacrifice this\b/i], only: (facts) => facts.land },
  { side: 'provides', id: 'land-leaves', in: ['effect'], all: [/\bsacrifices? (?:any number of|all|a|an|two|\w+) lands?\b/i], unless: /opponent sacrifices|target player sacrifices/i },
  { side: 'provides', id: 'land-leaves', in: ['effect'], all: [/\bdestroy all lands\b/i] },
  { side: 'uses', id: 'land-leaves', in: ['trigger'], all: [/\blands?\b[^,]*\b(?:is|are) put into (?:a|your) graveyard from the battlefield\b|\byou sacrifice (?:a|one or more) lands?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'lands-in-graveyard', in: ['trigger', 'effect', 'cost'], all: [/\bland cards? (?:from|in) your graveyard\b|\blands? from your graveyard\b|\bland cards? (?:is|are) put into your graveyard\b|\bfor each land card in your graveyard\b/i] },
  { side: 'provides', id: 'lands-in-graveyard', in: ['cost', 'effect'], all: [/\bdiscard (?:a|an|\w+) land cards?\b/i] },
  { side: 'provides', id: 'lands-in-graveyard', in: ['effect'], all: [/\bland\b/i, /\binto your graveyard\b/i] },
  { side: 'uses', id: 'land-count', in: ['trigger', 'effect'], all: [/\bfor each land you control\b|\bnumber of lands you control\b|\b(?:\w+) or more lands\b|\bequal to the number of lands\b/i] },
  // Nonbasic lands
  { side: 'stops', id: 'nonbasic-utility', in: ['effect'], all: [/\bnonbasic lands are\b|\b(?:destroy|exile) all nonbasic lands\b|\bnonbasic lands? (?:lose|have no|has no)\b|\blands (?:lose all abilities|have no abilities)\b/i], unless: /your opponents control|an opponent controls/i },
  { side: 'stops', id: 'nonbasic-utility', in: ['effect'], all: [/\bnonbasic lands don't untap\b/i], weight: 0.7 },
  // Hand
  { side: 'provides', id: 'discard', in: ['cost'], all: [/\bdiscard\b/i] },
  { side: 'uses', id: 'discard', in: ['trigger'], all: [/\byou (?:cycle or )?discards?\b|\bdiscard one or more\b|\ba player discards\b|\bdiscarded\b/i], unless: /opponent/i },
  { side: 'uses', id: 'empty-hand', in: ['trigger', 'effect', 'cost'], all: [/\bno cards in (?:your )?hand\b|\bone or fewer cards in (?:your )?hand\b|\bfewer than \w+ cards in (?:your )?hand\b/i] },
  // A repeatable discard empties your hand, unless it hands you a card back.
  { side: 'provides', id: 'empty-hand', in: ['cost'], all: [/\bdiscard\b/i], weight: 0.8, only: (_, a) => a.kind === 'activated' && !/\bdraws?\b|\b(?:into|to) your hand\b/i.test(a.effect) },
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
  { side: 'uses', id: 'spell-cast', in: ['trigger'], all: [/\bcast\b/i, /\bspells?\b/i], unless: /opponent/i },
  { side: 'provides', id: 'spell-cast', in: ['effect'], all: [/\byou may (?:play|cast) (?:that card|those cards|them|it|the exiled cards?|cards exiled)\b|\bcast (?:it|that card|them) without paying\b/i], weight: 0.6 },
  { side: 'uses', id: 'instants-sorceries', in: ['trigger'], all: [/\bcast an? (?:instant or sorcery|instant|sorcery|noncreature)\b/i], unless: /opponent/i },
  { side: 'uses', id: 'instants-sorceries', in: ['effect'], all: [/\binstant (?:and|or) sorcery (?:cards?|spells?)\b|\binstants and sorceries\b/i], weight: 0.8 },
  // Creatures
  { side: 'provides', id: 'creature-tokens', in: ['effect'], all: [/\bcreate\b/i, /\bcreature tokens?\b/i], unless: OTHERS_RE },
  { side: 'uses', id: 'creature-tokens', in: ['trigger', 'effect'], all: [/\bcreature tokens? you control\b|\bwhenever (?:a|one or more) (?:creature )?tokens?\b|\bfor each creature you control\b|\bcreatures you control get \+/i] },
  { side: 'provides', id: 'counters', in: ['effect', 'cost'], all: [/\bput (?:a|an|one|two|three|\w+|X|that many) \+1\/\+1 counters? on (?!this\b)|\bproliferate\b/i] },
  { side: 'provides', id: 'counters', in: ['effect'], all: [/\bput (?:a|an|one|two|three|\w+|X|that many) \+1\/\+1 counters? on this\b|\benters with (?:a|an|one|two|\w+|X) (?:additional )?\+1\/\+1 counters?\b/i], weight: 0.5 },
  { side: 'uses', id: 'counters', in: ['trigger', 'effect'], all: [/\bwith (?:a|one or more) \+1\/\+1 counters? on (?:it|them)\b|\b\+1\/\+1 counters? (?:is|are) put\b|\bproliferate\b|\bfor each \+1\/\+1 counter\b/i] },
  { side: 'provides', id: 'creature-dies', in: ['cost'], all: [/\bsacrifice (?:a|an|another|two|X|\w+) (?:other )?(?:creature|artifact|permanent|nonland permanent)s?\b/i] },
  { side: 'provides', id: 'creature-dies', in: ['effect'], all: [/\beach player sacrifices (?:a|two|\w+) creatures?\b|\bdestroy all creatures\b/i], weight: 0.5 },
  { side: 'uses', id: 'creature-dies', in: ['trigger'], all: [/\b(?:a|another|one or more|each)(?: other)?(?: nontoken)? creatures?(?: you control)? dies?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'creature-dies', in: ['trigger'], all: [/\bthis(?: creature)? dies\b/i], weight: 0.5 },
  { side: 'provides', id: 'creature-enters', in: ['effect'], all: [/\bexile\b/i, /\breturn (?:it|that card|them|those cards|the exiled cards?) to the battlefield\b/i] },
  { side: 'provides', id: 'creature-enters', in: ['effect'], all: [/\breturn target creature card\b[^.]*\bto the battlefield\b/i], weight: 0.7 },
  { side: 'uses', id: 'creature-enters', in: ['trigger'], all: [/\b(?:a|another|one or more|each)(?: other)?(?: nontoken)? creatures?(?: you control)? enters?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'attacking', in: ['trigger'], all: [/\battacks?\b|\bdeals combat damage to (?:a player|an opponent|one or more players)\b/i], weight: 0.8 },
  { side: 'provides', id: 'lifegain', in: ['effect'], all: [/\bgains? (?:\w+|X) life\b|\bgains? life equal\b/i], unless: /\bits controller gains|\btarget player gains|\bopponent gains/i },
  { side: 'uses', id: 'lifegain', in: ['trigger'], all: [/\byou gain life\b/i] },
  { side: 'provides', id: 'artifacts', in: ['effect'], all: [/\bcreate\b/i, /\b(?:Treasure|Clue|Food|Blood|Map|Powerstone|Gold|artifact) tokens?\b/i], unless: OTHERS_RE, weight: 0.7 },
  { side: 'uses', id: 'artifacts', in: ['trigger', 'effect'], all: [/\bartifacts? you control\b|\bfor each artifact\b|\bcast an artifact spell\b|\bartifacts? (?:you control )?enters?\b/i], unless: /opponent/i },
  { side: 'uses', id: 'enchantments', in: ['trigger', 'effect'], all: [/\benchantments? you control\b|\bcast an enchantment spell\b|\bfor each enchantment\b|\benchantment (?:you control )?enters\b/i], unless: /opponent/i },
  { side: 'uses', id: 'equipment-auras', in: ['trigger', 'effect'], all: [/\bequipped creatures?\b|\benchanted creatures?\b|\bfor each (?:Aura|Equipment)\b|\b(?:Auras?|Equipment) (?:you control|attached)\b/i], only: (facts) => !hasType(facts, 'Equipment') && !hasType(facts, 'Aura') },
  { side: 'provides', id: 'treasure', in: ['effect'], all: [/\bcreate\b/i, /\bTreasure tokens?\b/i], unless: OTHERS_RE },
  { side: 'uses', id: 'treasure', in: ['trigger', 'effect', 'cost'], all: [/\bTreasures? you control\b|\bsacrifice a Treasure\b|\bTreasure tokens? you control\b/i] },
  // Roles
  { side: 'roles', id: 'ramp', in: ['effect'], all: [/^add\b/i], only: (facts, a) => !facts.land && a.kind === 'activated' && /\{T\}/.test(a.cost ?? '') },
  { side: 'roles', id: 'ramp', in: ['effect'], all: [/\badd (?:\{|one mana|two mana|\w+ mana)/i], only: (facts, a) => !facts.land && a.kind === 'static' && isSpell(facts), weight: 0.3 },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\b(?:destroy|exile) (?:target|up to (?:one|two|three|\w+) target|another target)\b[^.]*\b(?:creature|artifact|enchantment|planeswalker|permanent|battle)s?\b/i], unless: /\bfrom (?:a|your|their|target player's|an opponent's) graveyard\b|\byou control\b/i },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\bdeals? (?:\d+|X|that much|damage equal|\w+)(?: damage)?[^.]*\bto (?:any target|target (?:creature|planeswalker|attacking|blocking|player or planeswalker|creature or planeswalker|battle))\b/i] },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\bfights? (?:target|another target|up to one target)\b/i] },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\btarget creature (?:an opponent controls )?gets -(?:\d+|X)\/-(?:\d+|X)\b/i] },
  { side: 'roles', id: 'removal', in: ['effect'], all: [/\breturn target (?:nonland permanent|creature|artifact|enchantment|permanent)\b[^.]*\bto its owner's hand\b/i], weight: 0.6 },
  { side: 'roles', id: 'board-wipe', in: ['effect'], all: [/\b(?:destroy|exile) all (?:other )?(?:creatures|nonland permanents|artifacts|enchantments|permanents|planeswalkers)\b|\bdeals? (?:\d+|X) damage to each creature\b|\ball creatures get -|\beach creature gets -|\breturn all (?:other )?(?:creatures|nonland permanents)\b/i] },
  { side: 'roles', id: 'counterspell', in: ['effect'], all: [/\bcounter target\b/i] },
  { side: 'roles', id: 'protection', in: ['effect'], all: [/\b(?:creatures|permanents) you control (?:gain|have) (?:hexproof|indestructible|shroud|protection)\b|\btarget (?:creature|permanent) you control gains (?:hexproof|indestructible|shroud|protection)\b|\bphases? out\b/i] },
  { side: 'roles', id: 'tutor', in: ['effect'], all: [/\bsearch your library for\b/i, /\binto your hand\b|\bon top of your library\b|\bonto the battlefield\b/i], unless: LAND_WORD_RE },
  { side: 'roles', id: 'evasion', in: ['effect'], all: [/\b(?:creatures you control|target creature|equipped creature|enchanted creature|creatures? you control)\b[^.]*\b(?:gains?|have|has) (?:flying|trample|menace|shadow)\b|\bcan't be blocked\b/i] },
  // Direct damage: to every opponent beats one target, and again and again beats once.
  { side: 'roles', id: 'burn', in: ['effect'], all: [TABLE_BURN_RE], only: repeats },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TABLE_BURN_RE], weight: 0.6 },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TARGET_BURN_RE], only: repeats, weight: 0.8 },
  { side: 'roles', id: 'burn', in: ['effect'], all: [/\bdeals? (?:X|that much|damage equal)\b/i, TARGET_BURN_RE], weight: 0.6 },
  { side: 'roles', id: 'burn', in: ['effect'], all: [TARGET_BURN_RE], weight: 0.3 },
  { side: 'roles', id: 'card-advantage', in: ['effect'], all: [/\bexile the top\b/i, /\byou may (?:play|cast)\b/i] },
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
  treasure: [['artifacts', 0.5]]
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
      const hit = detector.in.some((part) =>
        sentences(parts[part]).some(
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
}

/** Roles that follow from mechanics: extra lands are ramp, real card draw is card advantage. */
function readRolesFromMechanics(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const provided = (id: MechanicId) => profile.provides.find((s) => s.id === id)
  if (facts.land) return
  const extraLand = provided('extra-land-drop')
  if (extraLand) add(profile.roles, { id: 'ramp', weight: extraLand.weight, evidence: extraLand.evidence })
  const landsOut = provided('land-enters')
  if (landsOut) add(profile.roles, { id: 'ramp', weight: 1, evidence: landsOut.evidence })
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
