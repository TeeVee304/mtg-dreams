/**
 * Sideboard and Maybeboard sections in list files. Card lines after a sideboard header (`Sideboard`,
 * `Sideboard:`, `// Sideboard`, as Arena and Moxfield export) belong to the sideboard, and those after
 * a maybeboard header (`Maybeboard`, `Maybe`) to the maybeboard, until the next section header.
 * Every format has a maybeboard: Cards considered for the list, which count toward nothing. Commander
 * formats have no sideboard: a sideboard section there (a precon's, an Archidekt export's) is read as
 * part of the maybeboard, and Cards meant for the sideboard go to the maybeboard.
 *
 * @packageDocumentation
 */

import { MAYBEBOARD_TEXT, nameKey, newLineId, SIDEBOARD_TEXT } from './decklist'
import { listFormat } from './formats'
import type { CardLine, ListLine } from './types'

/** Board of a card line. */
export type Board = 'main' | 'side' | 'maybe'

/** Card line fields plus the target board; `board` absent means main. */
export type BoardEntry = Omit<CardLine, 'id' | 'kind'> & { board?: Board }

/** Max sideboard size in constructed formats. */
export const SIDEBOARD_MAX = 15

/** Sideboard section header. */
const SIDEBOARD_HEADER = /^(?:\/\/\s*)?side(?:board)?\s*:?$/i

/** Maybeboard section header. */
const MAYBEBOARD_HEADER = /^(?:\/\/\s*)?maybe(?:board)?\s*:?$/i

/** Other section headers; each ends a sideboard or maybeboard section. */
const OTHER_HEADER = /^(?:\/\/\s*)?(?:deck|main|mainboard|maindeck|commander|companion|about)\s*:?$/i

/** Header naming one of a list's own versions: `// Version: Counters` (see listVersion). */
export const VERSION_HEADER = /^\/\/\s*version\s*:\s*(.+?)\s*$/i

/** Header shape of a version's swap section: `// Duel in`, `// Counters out`… */
const SWAP_SECTION = /^\/\/\s*(.+?)\s+(in|out)\s*:?$/i

/** @returns Names, lower-case, of the versions whose swap sections a list may have: Duel, EDH and its named ones. */
export function versionSectionNames(lines: ListLine[]): Set<string> {
  const names = new Set(['duel', 'edh'])
  for (const line of lines) {
    const named = line.kind === 'text' ? VERSION_HEADER.exec(line.text.trim()) : null
    if (named) names.add(named[1].toLowerCase())
  }
  return names
}

/**
 * @param names - From {@link versionSectionNames}.
 * @returns The version (lower-case) and part a swap section header starts, `// Duel in`, `// Counters
 * out`… (see listVersion); null if the line is none. Its cards are no part of the main deck; the app
 * writes these sections last.
 */
export function swapSection(line: ListLine, names: Set<string>): { name: string; part: 'in' | 'out' } | null {
  const match = line.kind === 'text' ? SWAP_SECTION.exec(line.text.trim()) : null
  if (!match || !names.has(match[1].toLowerCase())) return null
  return { name: match[1].toLowerCase(), part: match[2].toLowerCase() as 'in' | 'out' }
}

/** Text line matching `re`. */
const isHeader = (line: ListLine, re: RegExp) => line.kind === 'text' && re.test(line.text.trim())

/** Blank text line. */
const isBlank = (line: ListLine | undefined) => line?.kind === 'text' && line.text.trim() === ''

/** @returns Whether the list's format has a sideboard: every format but the commander ones. */
export const hasSideboard = (lines: ListLine[]) => !listFormat(lines)?.commander

/**
 * @returns The board of each card line off the main deck, by id; swapped cards (versions) are on none.
 * In commander formats, a sideboard section's cards are on the maybeboard.
 */
export function boardIds(lines: ListLine[]): Map<string, 'side' | 'maybe'> {
  const names = versionSectionNames(lines)
  const side = hasSideboard(lines) ? 'side' : 'maybe'
  const ids = new Map<string, 'side' | 'maybe'>()
  let board: Board = 'main'
  for (const line of lines) {
    if (isHeader(line, MAYBEBOARD_HEADER)) board = 'maybe'
    else if (isHeader(line, SIDEBOARD_HEADER)) board = side
    else if (isHeader(line, OTHER_HEADER) || swapSection(line, names)) board = 'main'
    else if (board !== 'main' && line.kind === 'card') ids.set(line.id, board)
  }
  return ids
}

/** @returns Ids of card lines in a sideboard section; none in commander formats. */
export function sideboardIds(lines: ListLine[]): Set<string> {
  return idsOn(lines, 'side')
}

/** @returns Ids of card lines on the maybeboard. */
export function maybeboardIds(lines: ListLine[]): Set<string> {
  return idsOn(lines, 'maybe')
}

/** @returns Ids of the card lines on `board` ({@link boardIds}). */
function idsOn(lines: ListLine[], board: 'side' | 'maybe'): Set<string> {
  const ids = new Set<string>()
  for (const [id, on] of boardIds(lines)) if (on === board) ids.add(id)
  return ids
}

/** Header of each board's section. */
const HEADERS = { side: SIDEBOARD_HEADER, maybe: MAYBEBOARD_HEADER } as const

/** @returns Whether a line starts a section: a board, a swap section or another header. */
const startsSection = (line: ListLine, names: Set<string>) =>
  isHeader(line, SIDEBOARD_HEADER) || isHeader(line, MAYBEBOARD_HEADER) || isHeader(line, OTHER_HEADER) || swapSection(line, names) !== null

/** @returns Index after the last line before `end`, skipping back over blank lines, but not before `from`. */
function trimmed(lines: ListLine[], end: number, from = 0): number {
  while (end > from && isBlank(lines[end - 1])) end--
  return end
}

/** @returns Index after the last line of the board, before trailing blank lines; -1 if the board has no section. */
function boardEnd(lines: ListLine[], board: Board): number {
  const names = versionSectionNames(lines)
  if (board === 'main') {
    // The main deck ends at the first section after it: a board, or the version swaps.
    const next = lines.findIndex(
      (line) => isHeader(line, SIDEBOARD_HEADER) || isHeader(line, MAYBEBOARD_HEADER) || swapSection(line, names) !== null
    )
    return trimmed(lines, next < 0 ? lines.length : next)
  }
  const header = lines.findIndex((line) => isHeader(line, HEADERS[board]))
  if (header < 0) return -1
  const next = lines.findIndex((line, i) => i > header && startsSection(line, names))
  return trimmed(lines, next < 0 ? lines.length : next, header + 1)
}

/** @returns Index after the main deck's last line: where cards added to it go. */
export const mainDeckEnd = (lines: ListLine[]) => boardEnd(lines, 'main')

/**
 * @returns Where a new section of `board` goes: after the list's other sections, before the version
 * swaps (which the app writes last); a new sideboard also goes before the maybeboard.
 */
function newSectionAt(lines: ListLine[], board: 'side' | 'maybe'): number {
  const names = versionSectionNames(lines)
  const before = lines.findIndex((line) => swapSection(line, names) !== null || (board === 'side' && isHeader(line, MAYBEBOARD_HEADER)))
  return trimmed(lines, before < 0 ? lines.length : before)
}

/**
 * Adds a card to a board, summing it into an identical line (name, printing, finish) of that board.
 * Creates a `Sideboard` or `Maybeboard` section if needed. Commander formats have no sideboard: its
 * Cards go to the maybeboard there.
 */
export function addToBoard(lines: ListLine[], entry: BoardEntry, to: Board): ListLine[] {
  const { board: _board, ...card } = entry
  const board = to === 'side' && !hasSideboard(lines) ? 'maybe' : to
  const boards = boardIds(lines)
  const key = nameKey(card.name)
  const end = boardEnd(lines, board)
  // Only the board's own lines: a version's swap of the card (after the main deck) stays as it is.
  const index = lines.findIndex(
    (line, i) =>
      line.kind === 'card' &&
      (boards.get(line.id) ?? 'main') === board &&
      (board !== 'main' || i < end) &&
      nameKey(line.name) === key &&
      line.set === card.set &&
      (line.collector ?? '') === (card.collector ?? '') &&
      line.foil === card.foil
  )
  if (index >= 0) {
    return lines.map((line, i) => (i === index && line.kind === 'card' ? { ...line, qty: line.qty + card.qty } : line))
  }
  const added: CardLine = { kind: 'card', id: newLineId(), ...card }
  if (board === 'main' || end >= 0) return [...lines.slice(0, end), added, ...lines.slice(end)]
  const at = newSectionAt(lines, board)
  const spacer: ListLine[] = at > 0 ? [{ kind: 'text', id: newLineId(), text: '' }] : []
  const header: ListLine = { kind: 'text', id: newLineId(), text: board === 'side' ? SIDEBOARD_TEXT : MAYBEBOARD_TEXT }
  return [...lines.slice(0, at), ...spacer, header, added, ...lines.slice(at)]
}

/** @returns Lines without the headers (and the blank line before each) of empty sideboard and maybeboard sections. */
function withoutEmptySections(lines: ListLine[]): ListLine[] {
  const names = versionSectionNames(lines)
  const dropped = new Set<number>()
  lines.forEach((line, header) => {
    if (!isHeader(line, SIDEBOARD_HEADER) && !isHeader(line, MAYBEBOARD_HEADER)) return
    const next = lines.findIndex((other, i) => i > header && startsSection(other, names))
    const section = lines.slice(header + 1, next < 0 ? lines.length : next)
    if (section.some((other) => other.kind === 'card')) return
    dropped.add(header)
    if (isBlank(lines[header - 1])) dropped.add(header - 1)
  })
  return dropped.size === 0 ? lines : lines.filter((_, i) => !dropped.has(i))
}

/**
 * Moves card lines to a board, merging into identical lines there. Removes a sideboard or maybeboard
 * header once its section is empty.
 */
export function moveToBoard(lines: ListLine[], ids: string[], board: Board): ListLine[] {
  const moving = lines.filter((line): line is CardLine => line.kind === 'card' && ids.includes(line.id))
  let result = lines.filter((line) => !moving.includes(line as CardLine))
  for (const { id: _id, kind: _kind, ...card } of moving) result = addToBoard(result, card, board)
  return withoutEmptySections(result)
}

/** @returns `lines` with the Cards of `from`'s maybeboard that its own maybeboard lacks (by name). */
export function withMaybeboardOf(lines: ListLine[], from: ListLine[]): ListLine[] {
  const own = maybeboardIds(lines)
  const names = new Set(lines.filter((line): line is CardLine => line.kind === 'card' && own.has(line.id)).map((line) => nameKey(line.name)))
  const theirs = maybeboardIds(from)
  return from
    .filter((line): line is CardLine => line.kind === 'card' && theirs.has(line.id) && !names.has(nameKey(line.name)))
    .reduce((result, { id: _id, kind: _kind, ...card }) => addToBoard(result, card, 'maybe'), lines)
}

/** @returns List lines from entries, each placed on its board. */
export function entriesToLines(entries: BoardEntry[]): ListLine[] {
  return entries.reduce<ListLine[]>((lines, entry) => addToBoard(lines, entry, entry.board ?? 'main'), [])
}
