import { frontTypeWords, isBasicLand } from './cards'
import { cardLines, listHeader, nameKey, newLineId } from './decklist'
import { counted } from './plural'
import type { CardInfo, ListLine, PartnerAbility, Printing } from './types'

/** Constructed format definition. */
export interface DeckFormat {
  /** Scryfall legality key. */
  id: string
  label: string
  /** Per-card copy limit; basics and `deckLimit` cards are exempt. */
  maxCopies: number
  /** Main deck size: the minimum, or in commander formats the exact size, commander included. */
  deckSize: number
  /** Commander format. */
  commander?: true
}

/** Supported paper formats (Scryfall legality keys). */
export const FORMATS: DeckFormat[] = [
  { id: 'standard', label: 'Standard', maxCopies: 4, deckSize: 60 },
  { id: 'pioneer', label: 'Pioneer', maxCopies: 4, deckSize: 60 },
  { id: 'modern', label: 'Modern', maxCopies: 4, deckSize: 60 },
  { id: 'premodern', label: 'Premodern', maxCopies: 4, deckSize: 60 },
  { id: 'legacy', label: 'Legacy', maxCopies: 4, deckSize: 60 },
  { id: 'vintage', label: 'Vintage', maxCopies: 4, deckSize: 60 },
  { id: 'pauper', label: 'Pauper', maxCopies: 4, deckSize: 60 },
  { id: 'oldschool', label: 'Old School', maxCopies: 4, deckSize: 60 },
  { id: 'commander', label: 'Commander', maxCopies: 1, deckSize: 100, commander: true },
  { id: 'duel', label: 'Duel Commander', maxCopies: 1, deckSize: 100, commander: true },
  { id: 'paupercommander', label: 'Pauper Commander', maxCopies: 1, deckSize: 100, commander: true },
  { id: 'oathbreaker', label: 'Oathbreaker', maxCopies: 1, deckSize: 60, commander: true },
  { id: 'predh', label: 'PreDH', maxCopies: 1, deckSize: 100, commander: true }
]

/** Main deck size against its format, from {@link deckSizeCheck}. */
export interface DeckSizeCheck {
  /** `short` below the size; `over` above an exact (commander) size. */
  status: 'ok' | 'short' | 'over'
  /** Count to show: `56/60` while off size or in commander formats, else just the count. */
  label: string
  /** What is off, e.g. `4 short of 60`; null when the size is right. */
  note: string | null
}

/** @param cards - Main deck copies (sideboard aside). */
export function deckSizeCheck(format: DeckFormat, cards: number): DeckSizeCheck {
  const size = format.deckSize
  const status = cards < size ? 'short' : format.commander && cards > size ? 'over' : 'ok'
  return {
    status,
    label: status === 'ok' && !format.commander ? String(cards) : `${cards}/${size}`,
    note: status === 'short' ? `${size - cards} short of ${size}` : status === 'over' ? `${cards - size} over ${size}` : null
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
  if (format.id === 'oathbreaker') return 'a planeswalker'
  if (format.id === 'paupercommander') return 'a creature printed at uncommon'
  return 'a legendary creature or Vehicle'
}

/**
 * Whether the card can be a commander on its own. Oathbreaker: planeswalker. Pauper Commander: creature
 * printed at uncommon. Others: legendary creature, Vehicle or Spacecraft, or `canBeCommander`.
 * Backgrounds are excluded.
 * @param printings - Required for Pauper Commander to check uncommon printings.
 */
export function canLead(format: DeckFormat, card: CardInfo, printings: Printing[] = []): boolean {
  const words = frontTypeWords(card.typeLine)
  if (format.id === 'oathbreaker') return words.includes('Planeswalker')
  if (format.id === 'paupercommander') {
    return words.includes('Creature') && (card.rarity === 'uncommon' || printings.some((p) => p.rarity === 'uncommon'))
  }
  const front = card.typeLine.split('//')[0].split(/[\s—]+/)
  const body = ['Creature', 'Vehicle', 'Spacecraft'].some((type) => front.includes(type))
  return (words.includes('Legendary') && body) || card.canBeCommander === true
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

/** @returns Whether the format lets two commanders share command: all commander formats but Oathbreaker. */
export function allowsPartners(format: DeckFormat): boolean {
  return !!format.commander && format.id !== 'oathbreaker'
}

/** @returns The front face's subtypes, e.g. `Time`, `Lord`, `Doctor`. */
const subtypesOf = (card: CardInfo) => card.typeLine.split('//')[0].split('—')[1]?.trim().split(/\s+/) ?? []

/** @returns Whether the card is a Background. */
const isBackground = (card: CardInfo) => subtypesOf(card).includes('Background')

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
      return ['Time', 'Lord', 'Doctor'].every((word) => subtypesOf(b).includes(word))
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
  const uncommon = card.rarity === 'uncommon' || printings.some((p) => p.rarity === 'uncommon')
  return leader.partner?.kind === 'background' && isBackground(card) && (format.id !== 'paupercommander' || uncommon)
}

/**
 * @param partner - The other commander, when two share command.
 * @returns Commander eligibility error (as partner of `partner`, if given), else the card's
 * {@link legalityIssue} as commander; null if fine.
 */
export function commanderIssue(
  format: DeckFormat,
  card: CardInfo,
  printings: Printing[],
  copies: number,
  partner: CardInfo | null = null
): LegalityIssue | null {
  if (partner && !allowsPartners(format)) return { severity: 'error', message: `${format.label} has one commander` }
  if (partner && !canPartner(card, partner)) return { severity: 'error', message: `Can't share command with ${partner.name}` }
  if (!canLead(format, card, printings) && !(partner && canJoin(format, partner, card, printings))) {
    return { severity: 'error', message: `Can't be your commander in ${format.label}` }
  }
  return legalityIssue(format, card, copies, true)
}

/** Format rule violation. `warning`: allowed but notable (single restricted copy). */
export interface LegalityIssue {
  severity: 'error' | 'warning'
  message: string
}

/**
 * @param copies - Total copies of the card in the deck.
 * @param asCommander - In Pauper Commander, ignores `not_legal` (Scryfall's legality covers only the 99).
 * @returns Ban, legality, restriction or copy-limit issue; null if fine.
 */
export function legalityIssue(format: DeckFormat, card: CardInfo, copies: number, asCommander = false): LegalityIssue | null {
  const status = card.legalities[format.id] ?? 'not_legal'
  if (status === 'banned') return { severity: 'error', message: `Banned in ${format.label}` }
  const commandsPauper = asCommander && format.id === 'paupercommander'
  if (status === 'not_legal' && !commandsPauper) return { severity: 'error', message: `Not legal in ${format.label}` }
  if (status === 'restricted') {
    return copies > 1
      ? { severity: 'error', message: `Restricted in ${format.label} (max 1)` }
      : { severity: 'warning', message: `Restricted in ${format.label}` }
  }
  const max = copyLimit(format, card, card.name)
  if (copies > max) return { severity: 'error', message: `Max ${counted(max, 'copy', 'copies')} in ${format.label}` }
  return null
}

/**
 * @param identity - The commanders' color identity.
 * @param partners - Two commanders share it.
 * @returns Error if the card's color identity has a color outside `identity`; colorless cards always pass.
 */
export function colorIdentityIssue(card: CardInfo, identity: string[], partners = false): LegalityIssue | null {
  return card.colorIdentity.some((color) => !identity.includes(color))
    ? { severity: 'error', message: partners ? "Outside your commanders' colors" : "Outside your commander's colors" }
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
