import { frontTypeWords, isBasicLand } from './cards'
import { cardLines, nameKey, newLineId } from './decklist'
import type { CardInfo, ListLine, Printing } from './types'

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
const FORMAT_LINE = /^\/\/\s*format\s*:\s*(.*?)\s*$/i
/** Lower-case, whitespace-stripped comparison form. */
const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '')

/** @returns Format named by the first format header (matched by id or label); null if none or unknown. */
export function listFormat(lines: ListLine[]): DeckFormat | null {
  for (const line of lines) {
    if (line.kind !== 'text') continue
    const match = FORMAT_LINE.exec(line.text.trim())
    if (match) {
      const value = squash(match[1])
      return FORMATS.find((format) => format.id === value || squash(format.label) === value) ?? null
    }
  }
  return null
}

/**
 * Replaces the format header, placing it first.
 * @param formatId - Format id; null removes the header.
 * @returns New lines; the commander header is removed unless the format is a commander format.
 */
export function withFormat(lines: ListLine[], formatId: string | null): ListLine[] {
  const rest = lines.filter((line) => !(line.kind === 'text' && FORMAT_LINE.test(line.text.trim())))
  const format = findFormat(formatId)
  const kept = format?.commander ? rest : withCommander(rest, null)
  return format ? [{ kind: 'text', id: newLineId(), text: `// Format: ${format.label}` }, ...kept] : kept
}

/** Commander header line: `// Commander: <name>`. */
const COMMANDER_LINE = /^\/\/\s*commander\s*:\s*(.*?)\s*$/i
/** Arena/Moxfield `Commander` section heading; the following card line is the commander. */
const COMMANDER_HEADING = /^(?:\/\/\s*)?commander\s*:?$/i

/** Text line whose trimmed text matches `re`. */
const isText = (line: ListLine, re: RegExp) => line.kind === 'text' && re.test(line.text.trim())

/** @returns Commander name from the commander header, else the card after a `Commander` heading; null if none. */
export function listCommander(lines: ListLine[]): string | null {
  for (const line of lines) {
    if (line.kind !== 'text') continue
    const match = COMMANDER_LINE.exec(line.text.trim())
    if (match?.[1]) return match[1]
  }
  const heading = lines.findIndex((line) => isText(line, COMMANDER_HEADING))
  if (heading < 0) return null
  const next = lines.slice(heading + 1).find((line) => line.kind === 'card' || line.text.trim() !== '')
  return next?.kind === 'card' ? next.name : null
}

/**
 * Replaces the commander, inserting the header right after the format header (or first).
 * @param name - Commander name; null removes it.
 */
export function withCommander(lines: ListLine[], name: string | null): ListLine[] {
  const rest = lines.filter((line) => !isText(line, COMMANDER_LINE) && !isText(line, COMMANDER_HEADING))
  if (!name) return rest
  const at = rest.findIndex((line) => isText(line, FORMAT_LINE)) + 1
  return [...rest.slice(0, at), { kind: 'text', id: newLineId(), text: `// Commander: ${name}` }, ...rest.slice(at)]
}

/** @returns Lines without the commander header if no card line matches the commander. */
export function withoutMissingCommander(lines: ListLine[]): ListLine[] {
  const commander = listCommander(lines)
  if (!commander) return lines
  const key = nameKey(commander)
  return cardLines(lines).some((line) => nameKey(line.name) === key) ? lines : withCommander(lines, null)
}

/** @returns Commander eligibility rule phrase for messages, e.g. `a planeswalker`. */
export function commanderRule(format: DeckFormat): string {
  if (format.id === 'oathbreaker') return 'a planeswalker'
  if (format.id === 'paupercommander') return 'a creature printed at uncommon'
  return 'a legendary creature or Vehicle'
}

/**
 * Whether the card can be a sole commander. Oathbreaker: planeswalker. Pauper Commander: creature
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

/** @returns Commander eligibility error, else the card's {@link legalityIssue} as commander; null if fine. */
export function commanderIssue(
  format: DeckFormat,
  card: CardInfo,
  printings: Printing[],
  copies: number
): LegalityIssue | null {
  if (!canLead(format, card, printings)) {
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
  if (copies > max) return { severity: 'error', message: `Max ${max} ${max === 1 ? 'copy' : 'copies'} in ${format.label}` }
  return null
}

/**
 * @param identity - The commander's color identity.
 * @returns Error if the card's color identity has a color outside `identity`; colorless cards always pass.
 */
export function colorIdentityIssue(card: CardInfo, identity: string[]): LegalityIssue | null {
  return card.colorIdentity.some((color) => !identity.includes(color))
    ? { severity: 'error', message: "Outside your commander's colors" }
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
