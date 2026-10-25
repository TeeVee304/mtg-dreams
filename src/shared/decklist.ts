import { itemFromCopies } from './inventory'
import { languageOf, type Language } from './languages'
import type { CardLine, InventoryItem, ListLine, OwnedCopy } from './types'

/** Source of {@link newLineId}. */
let idCounter = 0

/** @returns Session-unique line id. */
export function newLineId(): string {
  idCounter += 1
  return `l${idCounter}`
}

/** {@link nameKey} results by name: the same names are keyed over and over by lists, rows and lookups. */
const nameKeys = new Map<string, string>()
/** Cache size at which {@link nameKeys} starts over. */
const MAX_NAME_KEYS = 20_000

/** Card identity key: front face only, whitespace-collapsed, lower-case. */
export function nameKey(name: string): string {
  let key = nameKeys.get(name)
  if (key === undefined) {
    key = name.split('//')[0].replace(/\s+/g, ' ').trim().toLowerCase()
    if (nameKeys.size >= MAX_NAME_KEYS) nameKeys.clear()
    nameKeys.set(name, key)
  }
  return key
}

/** `N[x] rest` card line. */
const LINE_RE = /^(\d+)\s*[xX]?\s+(.+)$/
/** Foil suffix: `(F)` or `*F*`. */
const FOIL_RE = /\s*(?:\(F\)|\*F\*)$/i
/** Goldfish set suffix: `[SET]`. */
const GOLDFISH_SET_RE = /\s*\[([A-Za-z0-9]{2,8})\]$/
/** Goldfish tag suffix: `<tag>`. */
const GOLDFISH_TAG_RE = /\s*<([^<>]+)>$/
/** Arena/Moxfield suffix: `Lightning Bolt (2XM) 141`. */
const ARENA_SET_RE = /\s+\(([A-Za-z0-9]{2,8})\)(?:\s+(\S+))?$/
/** Archidekt category suffix: `[Maybeboard{noDeck}{noPrice}]`, `[Ramp,Removal]`, `[Ramp]`. */
const ARCHIDEKT_CATEGORY_RE = /\s+\[([^[\]]+)\]$/
/** Archidekt label suffix: `^Have,#37d67a^`. */
const ARCHIDEKT_LABEL_RE = /\s+\^[^^]*\^$/
/** Language suffix: `{DE}`. */
const LANGUAGE_RE = /\s*\{([A-Za-z]{2,3})\}$/
/** Worthless suffix: `{Worthless}` (or `{No value}`, as it was first called). */
const WORTHLESS_RE = /\s*\{(?:worthless|no value)\}$/i

/**
 * @param inner - A bracketed suffix's text.
 * @param before - The line before it.
 * @returns Whether it is an Archidekt category rather than a Goldfish `[SET]`: it has braces, commas
 * or spaces, or follows an Arena-style `(SET) num` (Goldfish lines never have one).
 */
function isArchidektCategory(inner: string, before: string): boolean {
  return /[{},\s]/.test(inner) || ARENA_SET_RE.test(before.replace(FOIL_RE, ''))
}

/** Sideboard section header the app writes. */
export const SIDEBOARD_TEXT = 'Sideboard'
/** Maybeboard section header the app writes. */
export const MAYBEBOARD_TEXT = 'Maybeboard'

/**
 * Parses `N[x] Name` with optional suffixes in any order: `<tag>`, `[SET]`, `(F)`/`*F*`, `(SET) num`,
 * `{DE}` (a language besides English), `{Worthless}`. Archidekt's `[Category]` and `^Label^` are
 * dropped.
 * @returns Card fields; null if not a card line.
 */
export function parseCardLine(line: string): Omit<CardLine, 'id' | 'kind'> | null {
  return parseTaggedLine(line)?.card ?? null
}

/**
 * {@link parseCardLine}, with the board an Archidekt category puts the card on: a `{noDeck}` category
 * keeps it out of the deck, on the sideboard (`[Sideboard{noDeck}]`) or else the maybeboard.
 */
function parseTaggedLine(line: string): { card: Omit<CardLine, 'id' | 'kind'>; board: 'main' | 'side' | 'maybe' } | null {
  const match = LINE_RE.exec(line.trim())
  if (!match) return null
  const qty = Number.parseInt(match[1], 10)
  if (!Number.isSafeInteger(qty) || qty <= 0) return null

  let rest = match[2].trim()
  let foil = false
  let set: string | undefined
  let collector: string | undefined
  let lang: Language | undefined
  let worthless = false
  let labelled = false
  let category: string | null = null

  for (;;) {
    let m: RegExpExecArray | null
    if (!labelled && (m = ARCHIDEKT_LABEL_RE.exec(rest))) {
      labelled = true
    } else if (category === null && (m = ARCHIDEKT_CATEGORY_RE.exec(rest)) && isArchidektCategory(m[1], rest.slice(0, m.index))) {
      category = m[1]
    } else if ((m = FOIL_RE.exec(rest))) {
      foil = true
    } else if (!worthless && (m = WORTHLESS_RE.exec(rest))) {
      worthless = true
    } else if (!lang && (m = LANGUAGE_RE.exec(rest)) && (languageOf(m[1]) || m[1].toLowerCase() === 'en')) {
      lang = languageOf(m[1])
    } else if (!set && (m = GOLDFISH_SET_RE.exec(rest))) {
      set = m[1].toLowerCase()
    } else if (!collector && (m = GOLDFISH_TAG_RE.exec(rest))) {
      collector = m[1].trim()
    } else if (!set && (m = ARENA_SET_RE.exec(rest))) {
      set = m[1].toLowerCase()
      collector ??= m[2]
    } else {
      break
    }
    rest = rest.slice(0, m.index)
  }

  const name = rest.replace(/\s+/g, ' ').trim()
  if (!name) return null
  const card = { qty, name, set, collector: collector || undefined, foil, ...(lang && { lang }), ...(worthless && { worthless: true as const }) }
  const board = !category || !/\{nodeck\}/i.test(category) ? 'main' : /^sideboard(?![a-z])/i.test(category) ? 'side' : 'maybe'
  return { card, board }
}

/**
 * Parses a list file (BOM-tolerant, trailing blank lines dropped); non-card lines become {@link TextLine}s.
 * Cards an Archidekt category keeps out of the deck (`{noDeck}`) move to a Sideboard or Maybeboard
 * section at the end.
 */
export function parseList(text: string): ListLine[] {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  while (rows.length > 0 && rows[rows.length - 1].trim() === '') rows.pop()
  const aside = { side: [] as ListLine[], maybe: [] as ListLine[] }
  const lines = rows.flatMap((row): ListLine[] => {
    const tagged = parseTaggedLine(row)
    if (!tagged) return [{ kind: 'text', id: newLineId(), text: row.trimEnd() }]
    const line: ListLine = { kind: 'card', id: newLineId(), ...tagged.card }
    if (tagged.board === 'main') return [line]
    aside[tagged.board].push(line)
    return []
  })
  for (const [header, cards] of [[SIDEBOARD_TEXT, aside.side], [MAYBEBOARD_TEXT, aside.maybe]] as const) {
    if (cards.length === 0) continue
    if (lines.length > 0) lines.push({ kind: 'text', id: newLineId(), text: '' })
    lines.push({ kind: 'text', id: newLineId(), text: header }, ...cards)
  }
  return lines
}

/** @returns Canonical line: `N Name <collector> [SET] (F) {DE} {Worthless}`. */
export function serializeCard(card: Omit<CardLine, 'id' | 'kind'>): string {
  let line = `${card.qty} ${card.name}`
  if (card.collector) line += ` <${card.collector}>`
  if (card.set) line += ` [${card.set.toUpperCase()}]`
  if (card.foil) line += ' (F)'
  if (card.lang) line += ` {${card.lang.toUpperCase()}}`
  if (card.worthless) line += ' {Worthless}'
  return line
}

/** @returns File text, newline-terminated; `''` for no lines. */
export function serializeList(lines: ListLine[]): string {
  const out = lines.map((line) => (line.kind === 'card' ? serializeCard(line) : line.text))
  return out.length ? `${out.join('\n')}\n` : ''
}

/** @returns Card lines only. */
export function cardLines(lines: ListLine[]): CardLine[] {
  return lines.filter((line): line is CardLine => line.kind === 'card')
}

/** List setting stored in the list file as a `// Label: value` comment line, from {@link listHeader}. */
export interface ListHeader {
  /** Whether the line is this header. */
  is(line: ListLine): boolean
  /** @returns Value of the first such header with one; null if none. */
  read(lines: ListLine[]): string | null
  /**
   * Replaces the header.
   * @param value - Null removes it.
   * @param at - Index among the other lines to insert it at; first by default.
   */
  write(lines: ListLine[], value: string | null, at?: (rest: ListLine[]) => number): ListLine[]
}

/**
 * @param label - Name written into the file, e.g. `Format`.
 * @param pattern - Regex source matching the names read back (case-insensitive); `label` by default.
 */
export function listHeader(label: string, pattern = label): ListHeader {
  const re = new RegExp(`^//\\s*${pattern}\\s*:\\s*(.*?)\\s*$`, 'i')
  const is = (line: ListLine) => line.kind === 'text' && re.test(line.text.trim())
  return {
    is,
    read(lines) {
      for (const line of lines) {
        const value = line.kind === 'text' ? re.exec(line.text.trim())?.[1] : undefined
        if (value) return value
      }
      return null
    },
    write(lines, value, at = () => 0) {
      const rest = lines.filter((line) => !is(line))
      if (!value) return rest
      const index = at(rest)
      return [...rest.slice(0, index), { kind: 'text', id: newLineId(), text: `// ${label}: ${value}` }, ...rest.slice(index)]
    }
  }
}

/** Known section header words (Arena, Moxfield, Goldfish), lower-case, without trailing colon. */
const SECTION_HEADERS = new Set([
  'deck', 'main', 'mainboard', 'maindeck', 'sideboard', 'side', 'commander', 'companion', 'maybeboard', 'about'
])

/** @returns Trimmed text lines that are not blank, `//`/`#` comments or section headers (likely typos). */
export function unrecognizedLines(lines: ListLine[]): string[] {
  return lines
    .filter((line): line is Extract<ListLine, { kind: 'text' }> => line.kind === 'text')
    .map((line) => line.text.trim())
    .filter((text) => {
      if (!text || text.startsWith('//') || text.startsWith('#')) return false
      return !SECTION_HEADERS.has(text.toLowerCase().replace(/:$/, ''))
    })
}

/** Inventory coverage of one list line. */
export interface Allocation {
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card claimed ahead of this line: by lists ahead (`held`), then earlier lines. */
  before: number
  /** Copies of the same card claimed by lists ahead of this one. */
  held: number
}

/**
 * Allocates owned copies to the lines of one list in order, after the copies lists ahead hold.
 * @param inventory - Items by nameKey.
 * @param held - Copies of a card (by nameKey) that lists ahead take first (`CopyPool.held`); none by default.
 */
export function allocateOwned(
  lines: CardLine[],
  inventory: Map<string, InventoryItem>,
  held: (key: string) => number = () => 0
): Allocation[] {
  const claimedSoFar = new Map<string, number>()
  return lines.map((line) => {
    const key = nameKey(line.name)
    const ahead = claimedSoFar.get(key) ?? held(key)
    claimedSoFar.set(key, ahead + line.qty)
    const available = Math.max(0, (inventory.get(key)?.qty ?? 0) - ahead)
    return { owned: Math.min(line.qty, available), before: ahead, held: held(key) }
  })
}

/** @returns Inventory items by nameKey; lines of the same card merge into one item's copies. */
export function parseInventory(text: string): Map<string, InventoryItem> {
  const cards = new Map<string, { name: string; copies: OwnedCopy[] }>()
  for (const card of cardLines(parseList(text))) {
    const key = nameKey(card.name)
    const copy: OwnedCopy = { qty: card.qty, set: card.set, collector: card.collector, foil: card.foil, lang: card.lang, worthless: card.worthless }
    const existing = cards.get(key)
    if (existing) existing.copies.push(copy)
    else cards.set(key, { name: card.name, copies: [copy] })
  }
  const items = new Map<string, InventoryItem>()
  for (const [key, { name, copies }] of cards) {
    const item = itemFromCopies(name, copies)
    if (item) items.set(key, item)
  }
  return items
}

/**
 * @param plain - Leaves out languages and worthless marks, merging the copies they told apart: for
 * copying to other apps, which don't know them.
 * @returns Inventory file text: one line per copy group, sorted by name; empty items omitted.
 */
export function serializeInventory(items: Map<string, InventoryItem>, plain = false): string {
  const sorted = [...items.values()]
    .filter((item) => item.qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  const copiesOf = (item: InventoryItem) =>
    plain ? (itemFromCopies(item.name, item.copies.map(({ lang: _lang, worthless: _worthless, ...copy }) => copy))?.copies ?? []) : item.copies
  return sorted
    .flatMap((item) => copiesOf(item).map((copy) => `${serializeCard({ ...copy, name: item.name })}\n`))
    .join('')
}

/** @returns Plain `N Name` lines. */
export function countLines(cards: Array<{ qty: number; name: string }>): string[] {
  return cards.map((card) => `${card.qty} ${card.name}`)
}
