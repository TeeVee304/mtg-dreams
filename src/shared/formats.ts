import { frontTypeWords, isBasicLand } from './cards'
import { cardLines, nameKey, newLineId } from './decklist'
import type { CardInfo, ListLine, Printing } from './types'

export interface DeckFormat {
  /** Scryfall legality key. */
  id: string
  label: string
  /** Copies of a card allowed (basic lands and "any number" cards excepted). */
  maxCopies: number
  /** Decks are led by a commander, shown in its own section. */
  commander?: true
}

/** Paper formats Scryfall tracks legality for. */
export const FORMATS: DeckFormat[] = [
  { id: 'standard', label: 'Standard', maxCopies: 4 },
  { id: 'pioneer', label: 'Pioneer', maxCopies: 4 },
  { id: 'modern', label: 'Modern', maxCopies: 4 },
  { id: 'premodern', label: 'Premodern', maxCopies: 4 },
  { id: 'legacy', label: 'Legacy', maxCopies: 4 },
  { id: 'vintage', label: 'Vintage', maxCopies: 4 },
  { id: 'pauper', label: 'Pauper', maxCopies: 4 },
  { id: 'oldschool', label: 'Old School', maxCopies: 4 },
  { id: 'commander', label: 'Commander', maxCopies: 1, commander: true },
  { id: 'duel', label: 'Duel Commander', maxCopies: 1, commander: true },
  { id: 'paupercommander', label: 'Pauper Commander', maxCopies: 1, commander: true },
  { id: 'oathbreaker', label: 'Oathbreaker', maxCopies: 1, commander: true },
  { id: 'predh', label: 'PreDH', maxCopies: 1, commander: true }
]

export function findFormat(id: string | null | undefined): DeckFormat | null {
  return FORMATS.find((format) => format.id === id) ?? null
}

// The format is stored in the list file itself as a comment, e.g. "// Format: Commander",
// so it survives renames, syncing and hand edits.
const FORMAT_LINE = /^\/\/\s*format\s*:\s*(.*?)\s*$/i
const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '')

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
 * Sets the format header at the top of the list; null ("no format") removes it.
 * A format without commanders also drops the commander.
 */
export function withFormat(lines: ListLine[], formatId: string | null): ListLine[] {
  const rest = lines.filter((line) => !(line.kind === 'text' && FORMAT_LINE.test(line.text.trim())))
  const format = findFormat(formatId)
  const kept = format?.commander ? rest : withCommander(rest, null)
  return format ? [{ kind: 'text', id: newLineId(), text: `// Format: ${format.label}` }, ...kept] : kept
}

// ---------------------------------------------------------------------------
// Commander
// ---------------------------------------------------------------------------

// The commander is stored as a comment too, "// Commander: Atraxa, Praetors' Voice".
// Arena and Moxfield exports put it under a "Commander" heading instead, which is read as well.
const COMMANDER_LINE = /^\/\/\s*commander\s*:\s*(.*?)\s*$/i
const COMMANDER_HEADING = /^(?:\/\/\s*)?commander\s*:?$/i

const isText = (line: ListLine, re: RegExp) => line.kind === 'text' && re.test(line.text.trim())

/** The name of the list's commander, or null. */
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

/** Sets the commander (one at a time) just below the format header; null removes it. */
export function withCommander(lines: ListLine[], name: string | null): ListLine[] {
  const rest = lines.filter((line) => !isText(line, COMMANDER_LINE) && !isText(line, COMMANDER_HEADING))
  if (!name) return rest
  const at = rest.findIndex((line) => isText(line, FORMAT_LINE)) + 1
  return [...rest.slice(0, at), { kind: 'text', id: newLineId(), text: `// Commander: ${name}` }, ...rest.slice(at)]
}

/** Drops the commander once no line holds that card any more (e.g. after removing it). */
export function withoutMissingCommander(lines: ListLine[]): ListLine[] {
  const commander = listCommander(lines)
  if (!commander) return lines
  const key = nameKey(commander)
  return cardLines(lines).some((line) => nameKey(line.name) === key) ? lines : withCommander(lines, null)
}

/** What a commander must be in this format, for messages. */
export function commanderRule(format: DeckFormat): string {
  if (format.id === 'oathbreaker') return 'a planeswalker'
  if (format.id === 'paupercommander') return 'a creature printed at uncommon'
  return 'a legendary creature or Vehicle'
}

/**
 * Whether a card can lead a deck of this format on its own (Backgrounds only join
 * another commander). Pauper Commander needs the card's printings to know whether
 * it was ever printed at uncommon.
 */
export function canLead(format: DeckFormat, card: CardInfo, printings: Printing[] = []): boolean {
  const words = frontTypeWords(card.typeLine)
  if (format.id === 'oathbreaker') return words.includes('Planeswalker')
  if (format.id === 'paupercommander') {
    return words.includes('Creature') && (card.rarity === 'uncommon' || printings.some((p) => p.rarity === 'uncommon'))
  }
  // Legendary Vehicles and Spacecraft (subtypes, after the dash) may lead too.
  const front = card.typeLine.split('//')[0].split(/[\s—]+/)
  const body = ['Creature', 'Vehicle', 'Spacecraft'].some((type) => front.includes(type))
  return (words.includes('Legendary') && body) || card.canBeCommander === true
}

/** Problems with a deck's commander: it must be able to lead, and be allowed in the format. */
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

export interface LegalityIssue {
  severity: 'error' | 'warning'
  message: string
}

/**
 * Why a card can't (or might not) be played in a deck of this format, or null if it's fine.
 * `copies` is the total number of copies of the card in the deck.
 */
export function legalityIssue(format: DeckFormat, card: CardInfo, copies: number, asCommander = false): LegalityIssue | null {
  const status = card.legalities[format.id] ?? 'not_legal'
  if (status === 'banned') return { severity: 'error', message: `Banned in ${format.label}` }
  // Scryfall's Pauper Commander legality is about the 99 (cards printed at common);
  // an uncommon-only creature is "not legal" there but may still lead the deck.
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
 * Most copies of a card a deck in this format may hold: the format's limit, 1 for
 * restricted cards, or the card's own rule (basic lands and "any number" cards are
 * unlimited, Seven Dwarves 7). Without card data only basic lands are recognised.
 */
export function copyLimit(format: DeckFormat, card: CardInfo | null | undefined, name: string): number {
  if (isBasicLand(name) || card?.deckLimit === 'any' || (card && /\bBasic\b/.test(card.typeLine))) return Infinity
  if (typeof card?.deckLimit === 'number') return card.deckLimit
  if (card?.legalities[format.id] === 'restricted') return 1
  return format.maxCopies
}

/** Drops copies beyond each card's limit, counting what the list already holds. */
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
