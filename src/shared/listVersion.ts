import { cardLines, listHeader, nameKey, newLineId, parseList, serializeList } from './decklist'
import { listCommander, listFormat, withFormat } from './formats'
import { VERSION_SECTION } from './sideboard'
import type { CardLine, ListLine } from './types'

/**
 * A list's second version, for the other way of playing Commander: a Commander (EDH) list gets a
 * Duel version, played one on one; a Duel Commander list gets an EDH version, for a pod. It is turned
 * on with a header (`// Duel: On`, `// EDH: On`) and stored as swaps against the list, in sections
 * the app writes last:
 *
 * ```
 * // Duel in
 * 1 Bloodroot Apothecary
 * // Duel out
 * 1 Galactus, Devourer of Worlds
 * ```
 *
 * The version is the list without the cards out, plus the cards in, so a card added to the list is
 * in both. Both versions keep the same commander and share their copies: the list needs, of each
 * card, as many copies as the larger version has ({@link unionCardLines}).
 *
 * @packageDocumentation
 */

/** Which version of a list: `base` is the list itself, `variant` its other version. */
export type ListVersion = 'base' | 'variant'

/** A list's other version, by the list's format. */
export interface Variant {
  /** Name in headers, sections and labels: `Duel`, `EDH`. */
  label: string
  /** Format of the list it is a version of. */
  base: string
  /** That format, named for the version toggle: `Commander`, `Duel`. */
  baseLabel: string
  /** Format the version follows. */
  format: string
  /** That format's full name. */
  formatLabel: string
}

/** The versions a list can have, by its format. */
const VARIANTS: Variant[] = [
  { label: 'Duel', base: 'commander', baseLabel: 'Commander', format: 'duel', formatLabel: 'Duel Commander' },
  { label: 'EDH', base: 'duel', baseLabel: 'Duel', format: 'commander', formatLabel: 'Commander' }
]

/** Section of a swap line. */
type Swap = 'in' | 'out'

/** @returns The swap section a text line starts, if it is a swap section header. */
function sectionOf(line: ListLine): Swap | null {
  if (line.kind !== 'text') return null
  const match = VERSION_SECTION.exec(line.text.trim())
  return match ? (match[2].toLowerCase() as Swap) : null
}

/** A section header (sideboard, deck, maybeboard…) other than a swap section; it ends one. */
const OTHER_SECTION = /^(?:\/\/\s*)?(?:deck|main|mainboard|maindeck|commander|companion|maybeboard|about|side|sideboard)\s*:?$/i

/** @returns Swap section of each card line in one, by line id. */
function swapsById(lines: ListLine[]): Map<string, Swap> {
  const swaps = new Map<string, Swap>()
  let section: Swap | null = null
  for (const line of lines) {
    const starts = sectionOf(line)
    if (starts) section = starts
    else if (line.kind === 'text' && OTHER_SECTION.test(line.text.trim())) section = null
    else if (section && line.kind === 'card') swaps.set(line.id, section)
  }
  return swaps
}

/** @returns The other version a list's format allows (Duel for Commander, EDH for Duel); null for other formats. */
export function variantFor(lines: ListLine[]): Variant | null {
  const format = listFormat(lines)?.id
  return VARIANTS.find((variant) => variant.base === format) ?? null
}

/** @returns The list's other version, when it is turned on; null otherwise. */
export function activeVariant(lines: ListLine[]): Variant | null {
  const variant = variantFor(lines)
  if (!variant) return null
  const value = listHeader(variant.label).read(lines)
  return value !== null && !/^(no|off|false)$/i.test(value) ? variant : null
}

/** @returns Whether the list has its other version turned on. */
export function hasVariant(lines: ListLine[]): boolean {
  return activeVariant(lines) !== null
}

/** @returns Copies per card, by nameKey. */
function totals(lines: CardLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(nameKey(line.name), (counts.get(nameKey(line.name)) ?? 0) + line.qty)
  return counts
}

/** @returns The list's own card lines: every card line outside the swap sections. */
export function baseCardLines(lines: ListLine[]): CardLine[] {
  const swaps = swapsById(lines)
  return cardLines(lines).filter((line) => !swaps.has(line.id))
}

/** Cards a version adds and cuts, against the list. */
export interface Swaps {
  /** Cards only the version plays (or more copies of). */
  ins: CardLine[]
  /** List cards the version cuts, each at most as many copies as the list has. */
  outs: CardLine[]
}

/** @returns The other version's swaps; empty without one. Outs of cards no longer in the list are left out. */
export function variantSwaps(lines: ListLine[]): Swaps {
  if (!hasVariant(lines)) return { ins: [], outs: [] }
  const swaps = swapsById(lines)
  const base = totals(baseCardLines(lines))
  const outs: CardLine[] = []
  for (const line of cardLines(lines)) {
    if (swaps.get(line.id) !== 'out') continue
    const key = nameKey(line.name)
    const qty = Math.min(line.qty, base.get(key) ?? 0)
    if (qty <= 0) continue
    base.set(key, (base.get(key) ?? 0) - qty)
    outs.push(qty === line.qty ? line : { ...line, qty })
  }
  return { ins: cardLines(lines).filter((line) => swaps.get(line.id) === 'in'), outs }
}

/**
 * @returns The card lines of a version: the list's own for `base`; for `variant`, the list's lines
 * less the cards out (fewer copies, or gone) plus the cards in. Kept lines keep their ids, so edits
 * find them.
 */
export function versionCardLines(lines: ListLine[], version: ListVersion): CardLine[] {
  const base = baseCardLines(lines)
  if (version === 'base' || !hasVariant(lines)) return base
  const { ins, outs } = variantSwaps(lines)
  const cut = totals(outs)
  const result: CardLine[] = []
  for (const line of base) {
    const key = nameKey(line.name)
    const less = Math.min(cut.get(key) ?? 0, line.qty)
    if (less > 0) cut.set(key, (cut.get(key) ?? 0) - less)
    if (line.qty > less) result.push(less > 0 ? { ...line, qty: line.qty - less } : line)
  }
  return [...result, ...ins]
}

/**
 * @returns A version as a whole list: its headers and card lines, without swap sections; the other
 * version follows its own format. Card lines keep the list's order, cards in come last.
 */
export function versionLines(lines: ListLine[], version: ListVersion): ListLine[] {
  const swaps = swapsById(lines)
  const own = lines.filter((line) => !sectionOf(line) && !(line.kind === 'card' && swaps.has(line.id)))
  const variant = activeVariant(lines)
  if (version === 'base' || !variant) return own
  const cards = versionCardLines(lines, 'variant')
  const kept = new Map(cards.map((line) => [line.id, line]))
  const resolved = own.flatMap((line): ListLine[] => (line.kind !== 'card' ? [line] : kept.has(line.id) ? [kept.get(line.id)!] : []))
  const ins = cards.filter((line) => !own.some((other) => other.id === line.id))
  return withFormat([...resolved, ...ins], variant.format)
}

/**
 * Card lines a list needs copies for, across its versions: the list's own, plus the extra copies of
 * cards its other version has more of. Copies are shared, since the versions are never played at once.
 */
export function unionCardLines(lines: ListLine[]): CardLine[] {
  const base = baseCardLines(lines)
  if (!hasVariant(lines)) return base
  const own = totals(base)
  const other = totals(versionCardLines(lines, 'variant'))
  const extra: CardLine[] = []
  for (const line of variantSwaps(lines).ins) {
    const key = nameKey(line.name)
    const more = (other.get(key) ?? 0) - (own.get(key) ?? 0)
    if (more <= 0) continue
    own.set(key, (own.get(key) ?? 0) + Math.min(more, line.qty))
    extra.push({ ...line, qty: Math.min(more, line.qty) })
  }
  return [...base, ...extra]
}

/** @returns Lines with the swap sections rewritten from `ins` and `outs`, last, without empty sections. */
function withSwaps(lines: ListLine[], ins: CardLine[], outs: CardLine[]): ListLine[] {
  const swaps = swapsById(lines)
  const rest = lines.filter((line) => !sectionOf(line) && !(line.kind === 'card' && swaps.has(line.id)))
  while (rest.length > 0 && rest.at(-1)!.kind === 'text' && (rest.at(-1) as { text: string }).text.trim() === '') rest.pop()
  const label = (activeVariant(lines) ?? variantFor(lines))?.label ?? 'Duel'
  const section = (part: Swap, cards: CardLine[]): ListLine[] =>
    cards.length === 0
      ? []
      : [
          { kind: 'text', id: newLineId(), text: '' },
          { kind: 'text', id: newLineId(), text: `// ${label} ${part}` },
          ...cards.map((card) => ({ ...card, id: card.id || newLineId() }))
        ]
  return [...rest, ...section('in', ins), ...section('out', outs)]
}

/** @returns Lines without any version: no version headers, no swap sections. */
function withoutVariants(lines: ListLine[]): ListLine[] {
  const bare = withSwaps(lines, [], [])
  return VARIANTS.reduce((result, variant) => listHeader(variant.label).write(result, null), bare)
}

/**
 * Turns the list's other version on (as an identical copy of the list) or off, deleting its swaps.
 * Lists whose format has no other version are left without any.
 */
export function withVariant(lines: ListLine[], on: boolean): ListLine[] {
  const variant = variantFor(lines)
  const bare = withoutVariants(lines)
  return on && variant ? listHeader(variant.label).write(bare, 'On') : bare
}

/** Card fields that identify a printing; quantity and id aside. */
export type CardPick = Omit<CardLine, 'id' | 'kind' | 'qty'>

/**
 * Sets how many copies of a card the other version has, as swaps against the list: copies beyond the
 * list's are in, copies short of them out. Other swaps are kept, in place, so their pairs stay
 * ({@link swapPairs}); a new swap goes last. Outs of cards no longer in the list are dropped.
 * @param card - The card; a new card in keeps this printing.
 */
export function withVariantCount(lines: ListLine[], card: CardPick, target: number): ListLine[] {
  const key = nameKey(card.name)
  const { ins, outs } = variantSwaps(lines)
  const own = totals(baseCardLines(lines)).get(key) ?? 0
  const previous = ins.find((line) => nameKey(line.name) === key)
  const added: CardLine | null = target > own ? { ...(previous ?? { kind: 'card', id: '', ...card }), qty: target - own } : null
  const cut: CardLine | null = target < own ? { kind: 'card', id: '', name: card.name, foil: false, qty: own - target } : null
  return withSwaps(lines, placed(ins, key, added), placed(outs, key, cut))
}

/** @returns `list` with a card's lines replaced by `line` where the first stood (last for a new card), or dropped for null. */
function placed(list: CardLine[], key: string, line: CardLine | null): CardLine[] {
  const at = list.findIndex((other) => nameKey(other.name) === key)
  const rest = list.filter((other) => nameKey(other.name) !== key)
  if (!line) return rest
  const index = at < 0 ? rest.length : at
  return [...rest.slice(0, index), line, ...rest.slice(index)]
}

/** A card the other version cuts and the card it plays instead; either is null when the other side has more swaps. */
export interface SwapPair {
  out: CardLine | null
  in: CardLine | null
}

/** @returns The other version's swaps as pairs, in order: the first card out with the first card in, and so on. */
export function swapPairs({ ins, outs }: Swaps): SwapPair[] {
  return Array.from({ length: Math.max(ins.length, outs.length) }, (_, index) => ({
    out: outs[index] ?? null,
    in: ins[index] ?? null
  }))
}

/** @returns Lines without one pair of swaps ({@link swapPairs}): its card is back in the version, the card instead gone. */
export function withoutSwapPair(lines: ListLine[], index: number): ListLine[] {
  const { ins, outs } = variantSwaps(lines)
  return withSwaps(
    lines,
    ins.filter((_, at) => at !== index),
    outs.filter((_, at) => at !== index)
  )
}

/**
 * Makes the other version a given list, as swaps against this list's cards (applying an upgrade of
 * that version).
 * @param target - Card lines the other version should have.
 */
export function withVariantCards(lines: ListLine[], target: CardLine[]): ListLine[] {
  const own = totals(baseCardLines(lines))
  const wanted = totals(target)
  const ins: CardLine[] = []
  const seen = new Set<string>()
  for (const line of target) {
    const key = nameKey(line.name)
    if (seen.has(key)) continue
    seen.add(key)
    const more = (wanted.get(key) ?? 0) - (own.get(key) ?? 0)
    if (more > 0) ins.push({ ...line, id: '', qty: more })
  }
  const outs: CardLine[] = []
  for (const line of baseCardLines(lines)) {
    const key = nameKey(line.name)
    if (seen.has(`out:${key}`)) continue
    seen.add(`out:${key}`)
    const less = (own.get(key) ?? 0) - (wanted.get(key) ?? 0)
    if (less > 0) outs.push({ kind: 'card', id: '', name: line.name, foil: false, qty: less })
  }
  // Swaps the version already had keep their order, so their pairs stay; new ones go last.
  const before = variantSwaps(lines)
  return withSwaps(lines, inOrderOf(ins, before.ins), inOrderOf(outs, before.outs))
}

/** @returns `list` with the cards of `previous` first, in its order, then the rest. */
function inOrderOf(list: CardLine[], previous: CardLine[]): CardLine[] {
  const rank = new Map(previous.map((line, index) => [nameKey(line.name), index]))
  const at = (line: CardLine) => rank.get(nameKey(line.name)) ?? Infinity
  return [...list].sort((a, b) => at(a) - at(b))
}

/** @returns The list itself as text, to edit as text: its headers and cards, without its other version. */
export function baseText(lines: ListLine[]): string {
  return serializeList(withVariant(versionLines(lines, 'base'), false))
}

/**
 * @returns Lines of the list edited as text ({@link baseText}), keeping its other version: its header
 * and swaps come back, unless the edited list is in a format without that version.
 */
export function withBaseText(lines: ListLine[], text: string): ListLine[] {
  return withVariantOf(parseList(text), lines)
}

/** @returns The other version's cards as decklist text, to edit as text; the list's own without one. */
export function variantText(lines: ListLine[]): string {
  return serializeList(versionCardLines(lines, 'variant'))
}

/**
 * Makes the other version the cards of a decklist (the version edited as text), as swaps against
 * the list. Headers and other text are ignored; the commander stays, as it leads both versions.
 */
export function withVariantText(lines: ListLine[], text: string): ListLine[] {
  const target = cardLines(parseList(text))
  const commander = listCommander(lines)
  const missing = commander !== null && !target.some((line) => nameKey(line.name) === nameKey(commander))
  const leader = missing ? baseCardLines(lines).find((line) => nameKey(line.name) === nameKey(commander)) : undefined
  return withVariantCards(lines, leader ? [leader, ...target] : target)
}

/**
 * @returns The list's other version (header and swaps) moved onto `lines`, which replace its cards
 * (applying an upgrade of the list itself); `lines` without any version if the list has none, or if
 * `lines` are in a format that allows no such version.
 */
export function withVariantOf(lines: ListLine[], from: ListLine[]): ListLine[] {
  const clean = withoutVariants(lines)
  const variant = activeVariant(from)
  if (!variant || variantFor(clean)?.label !== variant.label) return clean
  const { ins, outs } = variantSwaps(from)
  return withSwaps(listHeader(variant.label).write(clean, 'On'), ins, outs)
}
