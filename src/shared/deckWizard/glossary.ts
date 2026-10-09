/**
 * Plain-words meanings of the jargon players will hear, for the Deck Wizard's choices and card
 * reasons: the first time a term appears, it explains itself on hover or focus.
 *
 * @packageDocumentation
 */

/** A term and what it means. */
export interface GlossaryEntry {
  term: string
  /** Other forms that mean the same, e.g. plurals. */
  also?: string[]
  meaning: string
}

/** The glossary. */
export const GLOSSARY: GlossaryEntry[] = [
  { term: 'ramp', also: ['ramping', 'mana boost'], meaning: 'Getting more mana sooner than one land a turn, so you can cast bigger spells earlier.' },
  { term: 'landfall', meaning: 'An ability that triggers whenever a land enters the battlefield under your control.' },
  { term: 'land drop', also: ['land drops'], meaning: 'Playing a land from your hand. Normally you get one each turn.' },
  { term: 'card advantage', meaning: 'Having more cards to use than your opponents, by drawing extra or getting more than one thing out of a card.' },
  { term: 'card draw', meaning: 'Effects that let you draw extra cards.' },
  { term: 'impulse draw', meaning: 'Exiling cards from the top of your library and letting you play them for a short time, instead of drawing them.' },
  { term: 'loot', also: ['looting', 'looter'], meaning: 'Draw a card, then discard a card: you dig for what you need.' },
  { term: 'rummage', also: ['rummaging'], meaning: 'Discard a card, then draw a card.' },
  { term: 'discard outlet', also: ['discard outlets'], meaning: 'A card that lets you discard cards whenever you want, usually for some benefit.' },
  { term: 'hellbent', meaning: 'A bonus some cards get while you have no cards in hand.' },
  { term: 'removal', also: ['spot removal'], meaning: 'A card that gets rid of one opposing threat, such as a creature or an artifact.' },
  { term: 'board wipe', also: ['board wipes', 'wrath', 'wraths', 'sweeper', 'sweepers'], meaning: 'A card that destroys or removes many creatures or permanents at once.' },
  { term: 'counterspell', also: ['counterspells'], meaning: 'A card that stops a spell while it is being cast, so it never happens.' },
  { term: 'tutor', also: ['tutors'], meaning: 'A card that searches your library for a specific card.' },
  { term: 'evasion', meaning: 'Abilities such as flying or trample that get creatures past blockers.' },
  { term: 'poison', also: ['poison counter', 'poison counters'], meaning: 'A counter players get, mostly from infect and toxic creatures. A player with ten poison counters loses the game.' },
  { term: 'infect', meaning: 'Creatures with infect deal damage to players as poison counters, and to creatures as -1/-1 counters.' },
  { term: 'toxic', meaning: 'A player dealt combat damage by a creature with toxic also gets that many poison counters.' },
  { term: 'proliferate', also: ['proliferating'], meaning: 'Choose any players and permanents that have counters, then give each one more of a counter it already has.' },
  { term: 'deathtouch', meaning: 'Any amount of damage from a creature with deathtouch destroys the creature it hits.' },
  { term: 'burn', meaning: 'Damage dealt straight to players or creatures by spells and abilities, without attacking.' },
  { term: 'win condition', also: ['win conditions', 'win con', 'win cons', 'finisher', 'finishers'], meaning: 'A card or combination of cards that actually ends the game.' },
  { term: 'synergy', meaning: 'Cards that work better together than apart.' },
  { term: 'anti-synergy', meaning: 'Cards that work against each other, like one that turns off another’s ability.' },
  { term: 'staple', also: ['staples'], meaning: 'A card played in many decks because it is good almost anywhere.' },
  { term: 'mana value', meaning: 'The total mana in a card’s cost; {2}{R} has mana value 3. Lands have mana value 0.' },
  { term: 'mana curve', also: ['curve', 'low curve'], meaning: 'How many cards a deck has at each mana value. A low curve means lots of cheap cards.' },
  { term: 'color identity', meaning: 'Every color in a card’s cost and rules text. In Commander, each card must fit your commander’s color identity.' },
  { term: 'singleton', meaning: 'One copy of each card, except basic lands: the Commander rule.' },
  { term: 'mana rock', also: ['mana rocks'], meaning: 'An artifact that taps for mana.' },
  { term: 'mana dork', also: ['mana dorks'], meaning: 'A small creature that taps for mana.' },
  { term: 'fetch land', also: ['fetch lands', 'fetchland', 'fetchlands'], meaning: 'A land you sacrifice to find another land in your library. It counts as two lands entering, for landfall.' },
  { term: 'utility land', also: ['utility lands'], meaning: 'A land with an ability beyond making mana.' },
  { term: 'land recursion', also: ['recursion'], meaning: 'Getting cards, such as lands, back from your graveyard to use them again.' },
  { term: 'lands matter', meaning: 'Decks that reward having, playing and reusing lots of lands.' },
  { term: 'ETB', also: ['enters the battlefield'], meaning: '“Enters the battlefield”: an ability that triggers when the card comes into play.' },
  { term: 'blink', also: ['flicker'], meaning: 'Exiling your own creature and returning it right away, to use its enter ability again.' },
  { term: 'go wide', meaning: 'Making many small creatures, then making them all stronger at once.' },
  { term: 'voltron', meaning: 'Making one creature, often your commander, huge with Equipment and Auras.' },
  { term: 'aristocrats', meaning: 'Sacrificing your own creatures for value, with cards that trigger when they die.' },
  { term: 'aggro', meaning: 'A strategy of cheap creatures and fast attacks, to win before opponents set up.' },
  { term: 'control deck', also: ['control decks'], meaning: 'A deck that answers everything opponents do, with removal, counterspells and board wipes, then wins the long game.' },
  { term: 'combo', also: ['combos'], meaning: 'A few cards that win together, often in one turn, or loop forever.' },
  { term: 'group slug', meaning: 'Hurting every opponent at once with damage or life loss, without attacking.' },
  { term: 'mill', also: ['milling', 'self-mill'], meaning: 'Putting cards from the top of a library into the graveyard; a player who must draw from an empty library loses.' },
  { term: 'commander damage', meaning: 'A player dealt 21 combat damage by the same commander loses, whatever their life total.' },
  { term: 'bracket', also: ['brackets', 'commander brackets'], meaning: 'The official power levels of Commander, from 1 (Exhibition) to 5 (cEDH), so a table can agree how strong its decks should be.' },
  { term: 'cEDH', meaning: 'Competitive Commander: the strongest possible decks, built to win as fast as they can.' },
  { term: 'game changer', also: ['game changers'], meaning: 'A card on the official list of Commander’s most powerful cards. Brackets 1 and 2 allow none, Bracket 3 up to three.' },
  { term: 'precon', also: ['precons', 'preconstructed deck'], meaning: 'A preconstructed deck, sold ready to play.' },
  { term: 'interaction', meaning: 'Cards that stop or answer what opponents do: removal, board wipes, counterspells.' },
  { term: 'extra turns', also: ['extra turn', 'extra-turn'], meaning: 'Cards that give you another turn after this one. Low brackets don’t allow chaining them.' },
  { term: 'land destruction', also: ['mass land destruction', 'MLD'], meaning: 'Destroying or locking down many lands at once. Not allowed below Bracket 4; most tables dislike it.' },
  { term: 'pips', also: ['pip', 'color pips'], meaning: 'The colored mana symbols in a card’s cost: {G}{G} is two green pips.' },
  { term: 'color sources', also: ['color source'], meaning: 'Lands and other cards that make mana of a color. More pips of a color need more sources.' },
  { term: 'fixing', also: ['mana fixing'], meaning: 'Lands and cards that make more than one color of mana, so you can cast all your spells.' },
  { term: 'goldfish', also: ['goldfishing'], meaning: 'Playing a deck alone, without opponents, to see how fast and smoothly it runs.' },
  { term: 'tribal', also: ['typal', 'kindred'], meaning: 'A deck built around one creature type, like Elves or Dragons, with cards that reward having many of them.' },
  { term: 'changeling', also: ['changelings'], meaning: 'A card that is every creature type at once, so it counts for any tribal deck.' },
  { term: 'legends matter', meaning: 'Decks full of legendary cards, with cards that reward casting them.' },
  { term: 'historic', meaning: 'Artifacts, legendary cards and Sagas.' },
  { term: 'flyers', also: ['flyer'], meaning: 'Creatures with flying, which only creatures with flying or reach can block.' },
  { term: 'cascade', also: ['cascading'], meaning: 'When you cast a spell with cascade, you reveal cards from your library until a cheaper spell, and cast it for free.' },
  { term: 'discover', meaning: 'Like cascade: reveal cards until one with that mana value or less, then cast it for free or put it into your hand.' },
  { term: 'superfriends', meaning: 'A deck full of planeswalkers, with cards that protect them and add loyalty.' },
  { term: 'clones', also: ['clone'], meaning: 'Cards that copy a creature or other permanent.' },
  { term: 'toughness matters', meaning: 'Decks of creatures with big toughness or defender, with cards that let them deal damage equal to their toughness.' },
  { term: 'monarch', meaning: 'A title one player holds: the monarch draws an extra card each turn, and loses the title to whoever deals them combat damage.' },
  { term: 'drain', meaning: 'Making opponents lose life directly, often gaining that much yourself.' },
  { term: 'X spells', also: ['X spell'], meaning: 'Spells with {X} in their cost: you choose X when you cast them, and they get bigger the more mana you spend.' },
  { term: 'bending', meaning: 'Airbending, earthbending, firebending and waterbending: keyword actions from the Avatar cards.' },
  { term: 'spellslinger', meaning: 'Decks built around casting many instants and sorceries.' },
  { term: 'enchantress', meaning: 'Decks that draw cards and get bonuses for casting enchantments.' },
  { term: 'lifegain', meaning: 'Gaining life, and cards that reward you each time you do.' },
  { term: 'treasure', also: ['treasures', 'treasure token', 'treasure tokens'], meaning: 'A token you can sacrifice for one mana of any color.' },
  { term: 'token', also: ['tokens'], meaning: 'A creature or object made by an effect. It stops existing if it leaves the battlefield.' },
  { term: 'cycling', also: ['landcycling'], meaning: 'Paying a cost to discard the card and draw a new one; landcycling finds a land instead.' },
  { term: 'madness', meaning: 'If you discard this card, you may cast it for its madness cost.' },
  { term: 'flashback', meaning: 'You may cast this card once more from your graveyard.' },
  { term: 'hexproof', meaning: 'Can’t be the target of your opponents’ spells or abilities.' },
  { term: 'indestructible', meaning: 'Can’t be destroyed by damage or “destroy” effects.' },
  { term: 'trample', meaning: 'Extra combat damage beyond what kills a blocker carries over to the player.' },
  { term: 'haste', meaning: 'Can attack and use tap abilities the turn it comes into play.' },
  { term: 'midrange', meaning: 'A balanced deck with cheap and expensive cards that adapts to the game.' },
  { term: 'beatdown', meaning: 'Winning by attacking with creatures turn after turn.' },
  { term: 'big mana', meaning: 'Making lots of mana to cast powerful, expensive cards.' }
]

/** Every form of every term, longest first, so “card advantage” wins over “card”. */
const FORMS = GLOSSARY.flatMap((entry) => [entry.term, ...(entry.also ?? [])].map((form) => ({ form, entry }))).sort(
  (a, b) => b.form.length - a.form.length
)
/** Entries by lower-case form. */
const BY_FORM = new Map(FORMS.map(({ form, entry }) => [form.toLowerCase(), entry]))
/** Any form as a whole word or phrase. */
const FORM_RE = new RegExp(`(?<![\\w-])(${FORMS.map(({ form }) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`, 'gi')

/** @returns The entry for a term or one of its forms, any case; undefined if unknown. */
export function glossaryEntry(term: string): GlossaryEntry | undefined {
  return BY_FORM.get(term.toLowerCase())
}

/** Part of a text: plain, or a glossary term. */
export type TermPart = string | { text: string; entry: GlossaryEntry }

/**
 * Splits text into plain parts and glossary terms, marking each term the first time it appears.
 * @param seen - Entries already explained elsewhere on the page; updated with the ones found.
 */
export function findTerms(text: string, seen: Set<GlossaryEntry> = new Set()): TermPart[] {
  const parts: TermPart[] = []
  let at = 0
  for (const match of text.matchAll(FORM_RE)) {
    const entry = BY_FORM.get(match[0].toLowerCase())!
    if (seen.has(entry)) continue
    seen.add(entry)
    if (match.index > at) parts.push(text.slice(at, match.index))
    parts.push({ text: match[0], entry })
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push(text.slice(at))
  return parts
}
