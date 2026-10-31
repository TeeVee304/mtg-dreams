import { frontTypeWords, isBasicLand } from './cards'
import { cardLines, listHeader, nameKey, newLineId } from './decklist'
import { ui } from './text'
import type { CardInfo, ListLine, PartnerAbility, Printing } from './types'

/**
 * What can lead a deck: a legendary creature (or Vehicle or Spacecraft), that or a planeswalker,
 * a planeswalker only (Oathbreaker), or a creature printed at uncommon (Pauper Commander).
 */
export type LeaderRule = 'legendary' | 'legendaryOrPlaneswalker' | 'planeswalker' | 'uncommonCreature'

/** A commander format's command zone. */
export interface CommandRules {
  leads: LeaderRule
  /** Two commanders may share command (Partner, Backgrounds…). */
  partners: boolean
  /** Commander brackets and Game Changers apply. */
  brackets?: true
}

/** Constructed format definition. Logic reads these fields, never the id. */
export interface DeckFormat {
  /** Scryfall legality key. */
  id: string
  label: string
  /** Per-card copy limit; basics and `deckLimit` cards are exempt. */
  maxCopies: number
  /** Main deck size: the minimum, or in commander formats the exact size, commander included. */
  deckSize: number
  /** Commander format: what leads, and whether partners may. */
  commander?: CommandRules
  /** Played on MTG Arena only: its Cards include digital ones, and its Decks hold no paper copies. */
  arena?: true
  /** Players at the table. Draw odds assume going first with 2, and drawing first with more. */
  players: number
}

const commander = (leads: LeaderRule, partners = true): CommandRules => ({ leads, partners })

/** Supported formats (Scryfall legality keys): paper constructed, paper commander, then Arena. */
export const FORMATS: DeckFormat[] = [
  { id: 'standard', label: 'Standard', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'pioneer', label: 'Pioneer', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'modern', label: 'Modern', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'premodern', label: 'Premodern', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'legacy', label: 'Legacy', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'vintage', label: 'Vintage', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'pauper', label: 'Pauper', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'oldschool', label: 'Old School', maxCopies: 4, deckSize: 60, players: 2 },
  { id: 'commander', label: 'Commander', maxCopies: 1, deckSize: 100, commander: { ...commander('legendary'), brackets: true }, players: 4 },
  { id: 'duel', label: 'Duel Commander', maxCopies: 1, deckSize: 100, commander: commander('legendary'), players: 2 },
  { id: 'paupercommander', label: 'Pauper Commander', maxCopies: 1, deckSize: 100, commander: commander('uncommonCreature'), players: 4 },
  { id: 'oathbreaker', label: 'Oathbreaker', maxCopies: 1, deckSize: 60, commander: commander('planeswalker', false), players: 4 },
  { id: 'predh', label: 'PreDH', maxCopies: 1, deckSize: 100, commander: commander('legendary'), players: 4 },
  { id: 'alchemy', label: 'Alchemy', maxCopies: 4, deckSize: 60, arena: true, players: 2 },
  { id: 'historic', label: 'Historic', maxCopies: 4, deckSize: 60, arena: true, players: 2 },
  { id: 'timeless', label: 'Timeless', maxCopies: 4, deckSize: 60, arena: true, players: 2 },
  { id: 'brawl', label: 'Brawl', maxCopies: 1, deckSize: 100, commander: commander('legendaryOrPlaneswalker'), arena: true, players: 2 },
  { id: 'standardbrawl', label: 'Standard Brawl', maxCopies: 1, deckSize: 60, commander: commander('legendaryOrPlaneswalker'), arena: true, players: 2 }
]

/** Where a format sits in format menus. */
export type FormatGroup = 'constructed' | 'commander' | 'arena'

/** @returns The format's menu group: Arena formats together, then paper commander and constructed ones. */
export const formatGroup = (format: DeckFormat): FormatGroup => (format.arena ? 'arena' : format.commander ? 'commander' : 'constructed')

/** @returns Whether the format's Decks are always unbuilt: Arena ones hold no paper copies. */
export const holdsNoCopies = (format: DeckFormat | null | undefined) => !!format?.arena

/** Main deck size against its format, from {@link deckSizeCheck}. */
export interface DeckSizeCheck {
  /** `short` below the size; `over` above an exact (commander) size. */
  status: 'ok' | 'short' | 'over'
  /** Count to show: `56/60` while off size or in commander formats, else just the count. */
  label: string
  /** What is off, e.g. `4 short of 60`; null when the size is right. */
  note: string | null
}

/**
 * @param cards - Main deck copies (sideboard aside).
 * @param noMax - A Rulebreaker lifts the maximum: a commander deck's size becomes a minimum.
 */
export function deckSizeCheck(format: DeckFormat, cards: number, noMax = false): DeckSizeCheck {
  const size = format.deckSize
  const exact = format.commander && !noMax
  const status = cards < size ? 'short' : exact && cards > size ? 'over' : 'ok'
  return {
    status,
    label: status === 'ok' && !exact ? String(cards) : `${cards}/${size}`,
    note: status === 'short' ? ui.rules.sizeShort(size - cards, size) : status === 'over' ? ui.rules.sizeOver(cards - size, size) : null
  }
}

/** @returns Format by id; null if unknown or absent. */
export function findFormat(id: string | null | undefined): DeckFormat | null {
  return FORMATS.find((format) => format.id === id) ?? null
}

/** Format header line stored in the list file: `// Format: <label or id>`. */
const FORMAT = listHeader('Format')
/** Lower-case, whitespace-stripped comparison form. */
const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '')

/** @returns Format named by the first format header (matched by id or label); null if none or unknown. */
export function listFormat(lines: ListLine[]): DeckFormat | null {
  const value = FORMAT.read(lines)
  if (value === null) return null
  const key = squash(value)
  return FORMATS.find((format) => format.id === key || squash(format.label) === key) ?? null
}

/**
 * Replaces the format header, placing it first.
 * @param formatId - Format id; null removes the header.
 * @returns New lines; the commander headers are removed unless the format is a commander format.
 */
export function withFormat(lines: ListLine[], formatId: string | null): ListLine[] {
  const format = findFormat(formatId)
  return FORMAT.write(format?.commander ? lines : withCommanders(lines, []), format?.label ?? null)
}

/** Commander header line: `// Commander: <name>`, one per commander (two for partners). */
const COMMANDER = listHeader('Commander')
/** Arena/Moxfield `Commander` section heading; the card lines that follow are the commanders. */
const COMMANDER_HEADING = /^(?:\/\/\s*)?commander\s*:?$/i
/** Most commanders a list has: two, for partners. */
const MAX_COMMANDERS = 2

/** Text line whose trimmed text is a `Commander` heading. */
const isHeading = (line: ListLine) => line.kind === 'text' && COMMANDER_HEADING.test(line.text.trim())

/**
 * @returns Commander names from the commander headers, else the cards right after a `Commander`
 * heading; at most two, without repeats; none if unset.
 */
export function listCommanders(lines: ListLine[]): string[] {
  const named = lines.flatMap((line) => (COMMANDER.is(line) && line.kind === 'text' ? [COMMANDER.read([line])] : []))
  const names = named.filter((name): name is string => !!name)
  if (names.length === 0) {
    const heading = lines.findIndex(isHeading)
    if (heading >= 0) {
      const after = lines.slice(heading + 1)
      const start = after.findIndex((line) => line.kind === 'card' || line.text.trim() !== '')
      for (const line of start < 0 ? [] : after.slice(start)) {
        if (line.kind !== 'card') break
        names.push(line.name)
      }
    }
  }
  const unique = names.filter((name, index) => names.findIndex((other) => nameKey(other) === nameKey(name)) === index)
  return unique.slice(0, MAX_COMMANDERS)
}

/**
 * Replaces the commanders, inserting their headers right after the format header (or first).
 * @param names - Commander names; none removes them.
 */
export function withCommanders(lines: ListLine[], names: string[]): ListLine[] {
  const rest = COMMANDER.write(lines.filter((line) => !isHeading(line)), null)
  const index = rest.findIndex(FORMAT.is) + 1
  const headers = names
    .slice(0, MAX_COMMANDERS)
    .map((name): ListLine => ({ kind: 'text', id: newLineId(), text: `// Commander: ${name}` }))
  return [...rest.slice(0, index), ...headers, ...rest.slice(index)]
}

/** @returns Lines without the commanders no card line matches. */
export function withoutMissingCommanders(lines: ListLine[]): ListLine[] {
  const commanders = listCommanders(lines)
  const keys = new Set(cardLines(lines).map((line) => nameKey(line.name)))
  const kept = commanders.filter((name) => keys.has(nameKey(name)))
  return kept.length === commanders.length ? lines : withCommanders(lines, kept)
}

/** @returns Commander eligibility rule phrase for messages, e.g. `a planeswalker`. */
export function commanderRule(format: DeckFormat): string {
  return ui.rules.commanderRule[format.commander?.leads ?? 'legendary']
}

/** @returns Whether the card was ever printed at uncommon. */
const printedUncommon = (card: CardInfo, printings: Printing[]) => card.rarity === 'uncommon' || printings.some((p) => p.rarity === 'uncommon')

/**
 * Whether the card can be a commander on its own, by the format's {@link LeaderRule}. Legendary:
 * a legendary creature, Vehicle or Spacecraft, or `canBeCommander`; Brawl adds planeswalkers.
 * Backgrounds are excluded.
 * @param printings - Required for Pauper Commander to check uncommon printings.
 */
export function canLead(format: DeckFormat, card: CardInfo, printings: Printing[] = []): boolean {
  const words = frontTypeWords(card.typeLine)
  const leads = format.commander?.leads ?? 'legendary'
  if (leads === 'planeswalker') return words.includes('Planeswalker')
  if (leads === 'uncommonCreature') return words.includes('Creature') && printedUncommon(card, printings)
  const front = card.typeLine.split('//')[0].split(/[\s—]+/)
  const body = ['Creature', 'Vehicle', 'Spacecraft'].some((type) => front.includes(type))
  const walker = leads === 'legendaryOrPlaneswalker' && words.includes('Planeswalker')
  return (words.includes('Legendary') && body) || walker || card.canBeCommander === true
}

/** @returns The partner ability in rules text (an ability starts a line); undefined if none. */
export function partnerAbility(text: string): PartnerAbility | undefined {
  // Reminder text, in parentheses, is no part of the ability.
  const lines = text.split('\n').map((line) => line.replace(/\s*\(.*$/, '').trim())
  for (const line of lines) {
    const withName = /^Partner with (.+)$/i.exec(line)
    if (withName) return { kind: 'with', name: withName[1] }
    const group = /^Partner\s*[—-]\s*(.+)$/i.exec(line)
    if (group) return { kind: 'group', group: group[1] }
    if (/^Partner$/i.test(line)) return { kind: 'any' }
    if (/^Friends forever$/i.test(line)) return { kind: 'group', group: 'Friends forever' }
    if (/^Choose a Background$/i.test(line)) return { kind: 'background' }
    if (/^Doctor's companion$/i.test(line)) return { kind: 'companion' }
  }
  return undefined
}

/**
 * @returns The partner a card names ("Partner with Toothy, Imaginary Friend"), which joins it as a
 * commander, when the format lets two commanders share command; null otherwise.
 */
export function namedPartner(format: DeckFormat | null | undefined, card: CardInfo | null | undefined): string | null {
  return format && allowsPartners(format) && card?.partner?.kind === 'with' ? card.partner.name : null
}

/** @returns Whether the format lets two commanders share command: all commander formats but Oathbreaker. */
export function allowsPartners(format: DeckFormat): boolean {
  return !!format.commander?.partners
}

/** @returns The front face's subtypes, e.g. `Time`, `Lord`, `Doctor`. */
const subtypesOf = (card: CardInfo) => card.typeLine.split('//')[0].split('—')[1]?.trim().split(/\s+/) ?? []

/** @returns Whether the card is a Background. */
export const isBackground = (card: CardInfo) => subtypesOf(card).includes('Background')

/** @returns Whether the card is a Time Lord Doctor, which a Doctor's companion joins. */
export const isTimeLordDoctor = (card: CardInfo) => ['Time', 'Lord', 'Doctor'].every((word) => subtypesOf(card).includes(word))

/** What kind of second commander a card takes: the Deck Wizard names its search bar after it. */
export type SecondCommander = 'partner' | 'friend' | 'background' | 'doctorsCompanion' | 'doctor'

/**
 * @returns The kind of second commander the card can take: a Partner (any `Partner` ability), a
 * Friends forever card, a Background, a Doctor's companion for a Time Lord Doctor, or a Doctor for a
 * Doctor's companion; null if it takes none.
 */
export function secondCommanderOf(card: CardInfo): SecondCommander | null {
  switch (card.partner?.kind) {
    case 'any':
    case 'with':
      return 'partner'
    case 'group':
      return card.partner.group.toLowerCase() === 'friends forever' ? 'friend' : 'partner'
    case 'background':
      return 'background'
    case 'companion':
      return 'doctor'
    default:
      return isTimeLordDoctor(card) ? 'doctorsCompanion' : null
  }
}

/** @returns Whether `a`'s partner ability lets `b` share command with it. */
function partnersWith(a: CardInfo, b: CardInfo): boolean {
  const ability = a.partner
  switch (ability?.kind) {
    case 'any':
      return b.partner?.kind === 'any'
    case 'with':
      return nameKey(ability.name) === nameKey(b.name.split(' // ')[0])
    case 'group':
      return b.partner?.kind === 'group' && b.partner.group.toLowerCase() === ability.group.toLowerCase()
    case 'background':
      return isBackground(b)
    case 'companion':
      return isTimeLordDoctor(b)
    default:
      return false
  }
}

/**
 * @returns Whether two cards can share command: both with Partner, partners with each other, of the
 * same Friends forever or `Partner—` group, a commander that chooses a Background with one, or a
 * Doctor's companion with a Time Lord Doctor.
 */
export function canPartner(a: CardInfo, b: CardInfo): boolean {
  return nameKey(a.name) !== nameKey(b.name) && (partnersWith(a, b) || partnersWith(b, a))
}

/**
 * Whether the card can join `leader` as its partner, a second commander. A Background never leads
 * alone, only beside a commander that chooses one; in Pauper Commander, it must be printed at uncommon.
 * @param printings - Required for Pauper Commander to check uncommon printings.
 */
export function canJoin(format: DeckFormat, leader: CardInfo, card: CardInfo, printings: Printing[] = []): boolean {
  if (!allowsPartners(format) || !canPartner(leader, card)) return false
  if (canLead(format, card, printings)) return true
  const uncommon = format.commander?.leads !== 'uncommonCreature' || printedUncommon(card, printings)
  return leader.partner?.kind === 'background' && isBackground(card) && uncommon
}

/**
 * @param partner - The other commander, when two share command.
 * @returns Commander eligibility error (as partner of `partner`, if given); null if fine. The card's
 * own legality is {@link legalityIssue}'s.
 */
export function commanderIssue(format: DeckFormat, card: CardInfo, printings: Printing[], partner: CardInfo | null = null): LegalityIssue | null {
  if (partner && !allowsPartners(format)) return issue('oneCommander', ui.rules.oneCommander, ui.rules.oneCommanderIn(format.label))
  if (partner && !canPartner(card, partner)) {
    return issue('cantShareCommand', ui.rules.cantShareCommand, ui.rules.cantShareCommandWith(partner.name))
  }
  if (!canLead(format, card, printings) && !(partner && canJoin(format, partner, card, printings))) {
    return issue('cantLead', ui.rules.cantLead, ui.rules.cantLeadIn(format.label, commanderRule(format)))
  }
  return null
}

/** What a rule problem is about; logic checks this, never the texts. */
export type IssueCode =
  | 'oneCommander'
  | 'cantShareCommand'
  | 'cantLead'
  | 'banned'
  | 'notLegal'
  | 'restricted'
  | 'maxCopies'
  | 'outsideColors'
  | 'notCompanion'
  | 'breaksCompanion'
  | 'companionShort'
  | 'unchecked'

/** Format rule problem. `warning`: allowed but notable (a single restricted copy, a maybeboard Card). */
export interface LegalityIssue {
  code: IssueCode
  severity: 'error' | 'warning'
  /** Short text, for a chip: `Banned`. */
  message: string
  /** Full reason, on hover and in the Card dialog: `Banned in Commander`. */
  detail: string
}

/** @returns A problem; an error unless `severity` says otherwise. */
export const issue = (code: IssueCode, message: string, detail: string, severity: LegalityIssue['severity'] = 'error'): LegalityIssue => ({
  code,
  severity,
  message,
  detail
})

/**
 * @param copies - Total copies of the card in the deck.
 * @param asCommander - In Pauper Commander, ignores `not_legal` (Scryfall's legality covers only the 99).
 * @returns Ban, legality, restriction or copy-limit issue; null if fine.
 */
export function legalityIssue(format: DeckFormat, card: CardInfo, copies: number, asCommander = false): LegalityIssue | null {
  const status = card.legalities[format.id] ?? 'not_legal'
  const { rules } = ui
  if (status === 'banned') return issue('banned', rules.banned, rules.bannedIn(format.label))
  // Scryfall's Pauper Commander legality covers the 99; what leads is checked by rarity instead.
  const byRarity = asCommander && format.commander?.leads === 'uncommonCreature'
  if (status === 'not_legal' && !byRarity) return issue('notLegal', rules.notLegal, rules.notLegalIn(format.label))
  if (status === 'restricted') {
    return copies > 1
      ? issue('restricted', rules.restricted, rules.restrictedOver(format.label))
      : issue('restricted', rules.restricted, rules.restrictedIn(format.label), 'warning')
  }
  const max = copyLimit(format, card, card.name)
  if (copies > max) return issue('maxCopies', rules.maxCopies(max), rules.maxCopiesIn(max, format.label))
  return null
}

/**
 * @param identity - The commanders' color identity.
 * @param partners - Two commanders share it.
 * @returns Error if the card's color identity has a color outside `identity`; colorless cards always pass.
 */
export function colorIdentityIssue(card: CardInfo, identity: string[], partners = false): LegalityIssue | null {
  return card.colorIdentity.some((color) => !identity.includes(color))
    ? issue('outsideColors', ui.rules.outsideColors, ui.rules.outsideColorsOf(partners))
    : null
}

/**
 * @returns Max copies: Infinity for basics and `deckLimit: 'any'`, the card's numeric `deckLimit`,
 * 1 if restricted, else the format limit. Without `card`, only basics are recognized by name.
 */
export function copyLimit(format: DeckFormat, card: CardInfo | null | undefined, name: string): number {
  if (isBasicLand(name) || card?.deckLimit === 'any' || (card && /\bBasic\b/.test(card.typeLine))) return Infinity
  if (typeof card?.deckLimit === 'number') return card.deckLimit
  if (card?.legalities[format.id] === 'restricted') return 1
  return format.maxCopies
}

/**
 * Trims entries to per-card limits.
 * @param limitOf - Max copies per card name.
 * @param existing - Copies already in the list per card name.
 * @returns Kept entries and the number of copies dropped.
 */
export function capEntries<T extends { name: string; qty: number }>(
  entries: T[],
  limitOf: (name: string) => number,
  existing: (name: string) => number
): { entries: T[]; skipped: number } {
  const used = new Map<string, number>()
  const kept: T[] = []
  let skipped = 0
  for (const entry of entries) {
    const key = nameKey(entry.name)
    const have = used.get(key) ?? existing(entry.name)
    const qty = Math.min(entry.qty, Math.max(0, limitOf(entry.name) - have))
    skipped += entry.qty - qty
    used.set(key, have + qty)
    if (qty > 0) kept.push({ ...entry, qty })
  }
  return { entries: kept, skipped }
}
