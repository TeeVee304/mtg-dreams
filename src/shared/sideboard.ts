/**
 * Sideboard sections in list files. Card lines after a sideboard header (`Sideboard`, `Sideboard:`,
 * `// Sideboard`, as Arena and Moxfield export) belong to the sideboard until the next section header.
 * Commander formats have no sideboard; callers disable it there.
 *
 * @packageDocumentation
 */

import { nameKey, newLineId } from './decklist'
import type { CardLine, ListLine } from './types'

/** Board of a card line. */
export type Board = 'main' | 'side'

/** Card line fields plus the target board; `side` absent means main. */
export type BoardEntry = Omit<CardLine, 'id' | 'kind'> & { side?: boolean }

/** Max sideboard size in constructed formats. */
export const SIDEBOARD_MAX = 15

/** Sideboard header text written by the app. */
const SIDEBOARD_TEXT = 'Sideboard'

/** Sideboard section header. */
const SIDEBOARD_HEADER = /^(?:\/\/\s*)?side(?:board)?\s*:?$/i

/** Other section headers; each ends a sideboard section. */
const OTHER_HEADER = /^(?:\/\/\s*)?(?:deck|main|mainboard|maindeck|commander|companion|maybeboard|about)\s*:?$/i

/** Text line matching `re`. */
const isHeader = (line: ListLine, re: RegExp) => line.kind === 'text' && re.test(line.text.trim())

/** Blank text line. */
const isBlank = (line: ListLine | undefined) => line?.kind === 'text' && line.text.trim() === ''

/**
 * @param enabled - False (commander formats) treats every line as main.
 * @returns Ids of card lines in a sideboard section.
 */
export function sideboardIds(lines: ListLine[], enabled = true): Set<string> {
  const ids = new Set<string>()
  if (!enabled) return ids
  let inSide = false
  for (const line of lines) {
    if (isHeader(line, SIDEBOARD_HEADER)) inSide = true
    else if (isHeader(line, OTHER_HEADER)) inSide = false
    else if (inSide && line.kind === 'card') ids.add(line.id)
  }
  return ids
}

/** @returns Index after the last line of the board, before trailing blank lines; -1 if the board has no section (sideboard only). */
function boardEnd(lines: ListLine[], board: Board): number {
  const header = lines.findIndex((line) => isHeader(line, SIDEBOARD_HEADER))
  let end: number
  if (board === 'main') {
    end = header < 0 ? lines.length : header
  } else {
    if (header < 0) return -1
    const next = lines.findIndex((line, i) => i > header && isHeader(line, OTHER_HEADER))
    end = next < 0 ? lines.length : next
    while (end > header + 1 && isBlank(lines[end - 1])) end--
    return end
  }
  while (end > 0 && isBlank(lines[end - 1])) end--
  return end
}

/**
 * Adds a card to a board, summing it into an identical line (name, printing, finish) of that board.
 * Creates a `Sideboard` section at the end if needed.
 */
export function addToBoard(lines: ListLine[], entry: BoardEntry, board: Board): ListLine[] {
  const { side: _side, ...card } = entry
  const inSide = sideboardIds(lines)
  const key = nameKey(card.name)
  const index = lines.findIndex(
    (line) =>
      line.kind === 'card' &&
      inSide.has(line.id) === (board === 'side') &&
      nameKey(line.name) === key &&
      line.set === card.set &&
      (line.collector ?? '') === (card.collector ?? '') &&
      line.foil === card.foil
  )
  if (index >= 0) {
    return lines.map((line, i) => (i === index && line.kind === 'card' ? { ...line, qty: line.qty + card.qty } : line))
  }
  const added: CardLine = { kind: 'card', id: newLineId(), ...card }
  const end = boardEnd(lines, board)
  if (end < 0) {
    const spacer: ListLine[] = lines.length > 0 && !isBlank(lines.at(-1)) ? [{ kind: 'text', id: newLineId(), text: '' }] : []
    return [...lines, ...spacer, { kind: 'text', id: newLineId(), text: SIDEBOARD_TEXT }, added]
  }
  return [...lines.slice(0, end), added, ...lines.slice(end)]
}

/** @returns Lines with an empty sideboard section's header (and the blank line before it) removed. */
function withoutEmptySideboard(lines: ListLine[]): ListLine[] {
  const header = lines.findIndex((line) => isHeader(line, SIDEBOARD_HEADER))
  if (header < 0 || sideboardIds(lines).size > 0) return lines
  const from = isBlank(lines[header - 1]) ? header - 1 : header
  return [...lines.slice(0, from), ...lines.slice(header + 1)]
}

/**
 * Moves card lines to a board, merging into identical lines there. Removes the sideboard header
 * once the sideboard is empty.
 */
export function moveToBoard(lines: ListLine[], ids: string[], board: Board): ListLine[] {
  const moving = lines.filter((line): line is CardLine => line.kind === 'card' && ids.includes(line.id))
  let result = lines.filter((line) => !moving.includes(line as CardLine))
  for (const { id: _id, kind: _kind, ...card } of moving) result = addToBoard(result, card, board)
  return withoutEmptySideboard(result)
}

/** @returns List lines from entries, each placed on its board. */
export function entriesToLines(entries: BoardEntry[]): ListLine[] {
  return entries.reduce<ListLine[]>((lines, entry) => addToBoard(lines, entry, entry.side ? 'side' : 'main'), [])
}
