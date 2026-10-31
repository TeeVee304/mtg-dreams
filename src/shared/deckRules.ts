import { cardLines, listHeader, nameKey, newLineId } from './decklist'
import { ui } from './text'
import type { CardInfo, ListLine } from './types'

/**
 * Deckbuilding exceptions on top of a format's rules: Rulebreaker commanders, which let cards past
 * the color identity or the deck size, and Companions, whose condition the whole starting deck meets.
 * They are few and rarely printed, so their rules are written out here, by card name ({@link RULEBREAKERS},
 * {@link COMPANION_RULES}); a new one is recognized by its keyword and left unchecked until added.
 *
 * @packageDocumentation
 */

/** A Rulebreaker commander's deckbuilding exceptions (`Rulebreaker — A deck with this commander…`). */
export interface Rulebreaker {
  /** Cards of any color identity: those with all of a rule's type words, and at least its mana value. */
  anyColor?: { types: string[]; minManaValue?: number }[]
  /** Lands of any color identity: basic ones, or all of them. */
  lands?: 'basic' | 'any'
  /** Card types whose color identity may add one color of your choice (`instant`, `sorcery`). */
  extraColor?: string[]
  /** No maximum deck size. */
  noMaxSize?: true
  /** A Rulebreaker the app doesn't know yet: its rule isn't applied. */
  unknown?: true
}

/** A Companion's deckbuilding condition, on the whole starting deck (the commanders included). */
export type CompanionRule =
  | { kind: 'even' }
  | { kind: 'odd' }
  /** No card has more than one of the same mana symbol in its mana cost. */
  | { kind: 'symbols' }
  /** Each creature card has one of `types`. */
  | { kind: 'creatureTypes'; types: string[] }
  /** Only cards with mana value `min` or greater, and lands. */
  | { kind: 'minManaValue'; min: number }
  /** Each permanent card has mana value `max` or less. */
  | { kind: 'maxPermanentManaValue'; max: number }
  /** Each nonland card has a different name. */
  | { kind: 'singleton' }
  /** Each nonland card shares a card type. */
  | { kind: 'sharedType' }
  /** The deck has at least `extra` cards more than the minimum deck size. */
  | { kind: 'biggerDeck'; extra: number }
  /** Each permanent card has an activated ability. */
  | { kind: 'activated' }
  /** A condition the app doesn't know: never checked. */
  | { kind: 'other' }

/** Every Rulebreaker's exceptions, by card name. */
export const RULEBREAKERS: Record<string, Rulebreaker> = {
  'Grizzlegom, Hurloon Hero': { lands: 'any' },
  'Maular, the Next Evolution': { anyColor: [{ types: ['creature'], minManaValue: 7 }], lands: 'basic' },
  'Seluma, Light of Aysen': { anyColor: [{ types: ['angel'] }], lands: 'basic' },
  'The Everforger': { anyColor: [{ types: ['artifact', 'creature'] }, { types: ['equipment'] }], lands: 'basic' },
  'The Unluckiest Planeswalker': { anyColor: [{ types: ['aura'] }], lands: 'basic' },
  'Tolabow, Loch Rascal': { extraColor: ['instant', 'sorcery'], lands: 'basic' },
  'Valko Indorian': { anyColor: [{ types: ['phyrexian'] }], lands: 'basic' },
  'Whtz, the Bibliophile': { noMaxSize: true }
}

/** Every Companion's condition, by card name. */
export const COMPANION_RULES: Record<string, CompanionRule> = {
  'Gyruda, Doom of Depths': { kind: 'even' },
  'Jegantha, the Wellspring': { kind: 'symbols' },
  'Kaheera, the Orphanguard': { kind: 'creatureTypes', types: ['Cat', 'Elemental', 'Nightmare', 'Dinosaur', 'Beast'] },
  'Keruga, the Macrosage': { kind: 'minManaValue', min: 3 },
  'Lurrus of the Dream-Den': { kind: 'maxPermanentManaValue', max: 2 },
  'Lutri, the Spellchaser': { kind: 'singleton' },
  'Obosh, the Preypiercer': { kind: 'odd' },
  'Umori, the Collector': { kind: 'sharedType' },
  'Yorion, Sky Nomad': { kind: 'biggerDeck', extra: 20 },
  'Zirda, the Dawnwaker': { kind: 'activated' }
}

/** The Companions a deck may fit ({@link companionBreaks}). */
export const COMPANIONS = Object.keys(COMPANION_RULES)

/** @returns Whether rules text has a `keyword —` ability (Rulebreaker, Companion). */
const hasAbility = (text: string, keyword: string) => text.split('\n').some((line) => new RegExp(`^${keyword}\\s*[—-]`, 'i').test(line.trim()))

/** @returns A card's Rulebreaker exceptions, by its name; `unknown` for a Rulebreaker not listed; undefined for other cards. */
export function rulebreakerOf(name: string, text: string): Rulebreaker | undefined {
  return RULEBREAKERS[name] ?? (hasAbility(text, 'Rulebreaker') ? { unknown: true } : undefined)
}

/** @returns A card's Companion condition, by its name; `other` for a Companion not listed; undefined for other cards. */
export function companionOf(name: string, text: string): CompanionRule | undefined {
  return COMPANION_RULES[name] ?? (hasAbility(text, 'Companion') ? { kind: 'other' } : undefined)
}

/** @returns A Companion's condition, as its problems name it: `permanents of mana value 2 or less`. */
export function companionCondition(rule: CompanionRule): string {
  const text = ui.rules.companionCondition
  switch (rule.kind) {
    case 'creatureTypes':
      return text.creatureTypes(rule.types)
    case 'minManaValue':
      return text.minManaValue(rule.min)
    case 'maxPermanentManaValue':
      return text.maxPermanentManaValue(rule.max)
    case 'biggerDeck':
      return text.biggerDeck(rule.extra)
    case 'other':
      return ''
    default:
      return text[rule.kind]
  }
}

/** @returns Whether a mana cost has a symbol twice, like `{R}{R}` or `{X}{X}`. */
export function repeatsManaSymbol(cost: string): boolean {
  const symbols = cost.match(/\{[^}]+\}/g) ?? []
  return new Set(symbols).size < symbols.length
}

/** Keyword abilities that are activated abilities, written without a colon (`Equip {2}`, `Cycling {1}`). */
const ACTIVATED_KEYWORDS =
  /^(equip|(?:basic |snow )?\w*cycling|crew|saddle|reconfigure|(?:commander )?ninjutsu|unearth|embalm|eternalize|outlast|level up|fortify|transmute|scavenge|encore|bloodrush|craft|station|forecast|transfigure|reinforce)\b/i

/**
 * @returns Whether rules text has an activated ability: a `cost: effect` line, or a keyword that is
 * one. Abilities in quotes, which a card grants others, and reminder text don't count.
 */
export function hasActivatedAbility(text: string): boolean {
  return text.split('\n').some((raw) => {
    const line = raw.replace(/\s*\([^)]*\)/g, '').replace(/"[^"]*"/g, '').trim()
    return /:/.test(line) || ACTIVATED_KEYWORDS.test(line)
  })
}

/** Permanent card types. */
const PERMANENTS = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle']
/** Card types a nonland card can share. */
const CARD_TYPES = ['artifact', 'battle', 'creature', 'enchantment', 'instant', 'kindred', 'planeswalker', 'sorcery']
/** Basic land types, whose lands have a mana ability. */
const BASIC_TYPES = ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']

/** @returns The lower-case words of the front face's type line, subtypes included. */
const frontWords = (card: CardInfo) => card.typeLine.split('//')[0].toLowerCase().split(/[\s—]+/).filter(Boolean)
/** @returns The front face's lower-case card types. */
const frontTypes = (card: CardInfo) => card.typeLine.split('//')[0].split('—')[0].toLowerCase().split(/\s+/)
const isLand = (card: CardInfo) => frontTypes(card).includes('land')
const isPermanent = (card: CardInfo) => frontTypes(card).some((type) => PERMANENTS.includes(type))

/**
 * @param commanders - The commanders' card data; the exceptions of the Rulebreakers among them apply.
 * @param chosenColor - The color a Rulebreaker lets some card types add ({@link Rulebreaker.extraColor}).
 * @returns The commander that lets a card outside the color identity in (or with the chosen color
 * added); null if the card fits the identity anyway, or no commander lets it in.
 */
export function identityException(card: CardInfo, identity: string[], commanders: CardInfo[], chosenColor: string | null): CardInfo | null {
  if (card.colorIdentity.every((color) => identity.includes(color))) return null
  const words = frontWords(card)
  const lets = ({ rulebreaker: rules }: CardInfo) => {
    if (!rules) return false
    if (rules.lands === 'any' && isLand(card)) return true
    if (rules.lands === 'basic' && words.includes('basic') && isLand(card)) return true
    const matches = rules.anyColor?.some(
      (rule) => rule.types.every((type) => words.includes(type)) && card.manaValue >= (rule.minManaValue ?? 0)
    )
    if (matches) return true
    if (rules.extraColor && chosenColor && rules.extraColor.some((type) => frontTypes(card).includes(type))) {
      return card.colorIdentity.every((color) => identity.includes(color) || color === chosenColor)
    }
    return false
  }
  return commanders.find(lets) ?? null
}

/** @returns Whether a commander lets the list choose an extra color ({@link Rulebreaker.extraColor}). */
export const choosesColor = (commanders: CardInfo[]) => commanders.some((card) => !!card.rulebreaker?.extraColor)

/** @returns Whether the commanders lift the maximum deck size. */
export const noMaxDeckSize = (commanders: CardInfo[]) => commanders.some((card) => !!card.rulebreaker?.noMaxSize)

/** One card of a starting deck, for {@link companionBreaks}. */
export interface DeckCard {
  name: string
  qty: number
  info: CardInfo
}

/**
 * @param deck - The starting deck: its commanders and main deck, the Companion aside.
 * @returns Names of the cards that break a Companion's condition. A whole-deck condition
 * (`biggerDeck`) breaks no single card: see {@link companionDeckBreak}.
 */
export function companionBreaks(rule: CompanionRule, deck: DeckCard[]): string[] {
  const breaks = (test: (card: DeckCard) => boolean) => deck.filter(test).map((card) => card.name)
  switch (rule.kind) {
    case 'even':
      return breaks(({ info }) => info.manaValue % 2 !== 0)
    case 'odd':
      return breaks(({ info }) => !isLand(info) && info.manaValue % 2 !== 1)
    case 'symbols':
      return breaks(({ info }) => !!info.repeatsSymbol)
    case 'creatureTypes': {
      const types = rule.types.map((type) => type.toLowerCase())
      return breaks(({ info }) => frontTypes(info).includes('creature') && !info.changeling && !frontWords(info).some((word) => types.includes(word)))
    }
    case 'minManaValue':
      return breaks(({ info }) => !isLand(info) && info.manaValue < rule.min)
    case 'maxPermanentManaValue':
      return breaks(({ info }) => isPermanent(info) && info.manaValue > rule.max)
    case 'singleton':
      return breaks(({ info, qty }) => !isLand(info) && qty > 1)
    case 'sharedType': {
      const nonland = deck.filter(({ info }) => !isLand(info))
      // The type most cards have; the cards without it break the condition.
      const counts = CARD_TYPES.map((type) => nonland.filter(({ info }) => frontTypes(info).includes(type)).length)
      const shared = CARD_TYPES[counts.indexOf(Math.max(...counts))]
      return nonland.filter(({ info }) => !frontTypes(info).includes(shared)).map((card) => card.name)
    }
    case 'activated':
      return breaks(({ info }) => isPermanent(info) && !info.activated && !frontWords(info).some((word) => BASIC_TYPES.includes(word)))
    default:
      return []
  }
}

/**
 * @param cards - The starting deck's size, the commanders included.
 * @param minimum - The format's minimum deck size.
 * @returns How many cards short the deck is of a whole-deck condition; 0 if met or none.
 */
export function companionDeckBreak(rule: CompanionRule, cards: number, minimum: number): number {
  return rule.kind === 'biggerDeck' ? Math.max(0, minimum + rule.extra - cards) : 0
}

/** Companion header line: `// Companion: <name>`. */
const COMPANION = listHeader('Companion')
/** Arena/Moxfield `Companion` section heading; the card line that follows is the Companion. */
const COMPANION_HEADING = /^(?:\/\/\s*)?companion\s*:?$/i

/** @returns The Companion's name: the header's, else the card after a `Companion` heading; null if none. */
export function listCompanion(lines: ListLine[]): string | null {
  const named = COMPANION.read(lines)
  if (named) return named
  const heading = lines.findIndex((line) => line.kind === 'text' && COMPANION_HEADING.test(line.text.trim()))
  const next = heading >= 0 ? lines.slice(heading + 1).find((line) => line.kind === 'card' || line.text.trim() !== '') : undefined
  return next?.kind === 'card' ? next.name : null
}

/**
 * Sets the Companion, adding its card line when the list lacks it.
 * @param name - The Companion; null removes the header (the card line stays).
 */
export function withCompanion(lines: ListLine[], name: string | null): ListLine[] {
  const rest = COMPANION.write(lines, null)
  if (!name) return rest
  const index = rest.findIndex((line) => line.kind === 'card')
  const header: ListLine = { kind: 'text', id: newLineId(), text: `// Companion: ${name}` }
  const withHeader = index < 0 ? [...rest, header] : [...rest.slice(0, index), header, ...rest.slice(index)]
  if (cardLines(rest).some((line) => nameKey(line.name) === nameKey(name))) return withHeader
  return [...withHeader, { kind: 'card', id: newLineId(), qty: 1, name, foil: false }]
}

/** The color a Rulebreaker let the list add: `// Rulebreaker color: G`. */
const RULEBREAKER_COLOR = listHeader('Rulebreaker color', 'rulebreaker\\s+colou?r')

/** @returns The color letter a Rulebreaker let the list add; null if unset. */
export function rulebreakerColor(lines: ListLine[]): string | null {
  const value = RULEBREAKER_COLOR.read(lines)?.toUpperCase() ?? ''
  return /^[WUBRG]$/.test(value) ? value : null
}

/** Sets the color a Rulebreaker lets the list add, or removes it (`null`). */
export function withRulebreakerColor(lines: ListLine[], color: string | null): ListLine[] {
  // Written with the commander headers, before the first card.
  return RULEBREAKER_COLOR.write(lines, color, (rest) => {
    const index = rest.findIndex((line) => line.kind === 'card')
    return index < 0 ? rest.length : index
  })
}
