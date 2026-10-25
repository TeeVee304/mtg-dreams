import { cardLines, listHeader, nameKey, newLineId, parseList, serializeList } from './decklist'
import { findFormat, listCommanders, listFormat, withFormat } from './formats'
import { swapSection, VERSION_HEADER, versionSectionNames } from './sideboard'
import { ui } from './text'
import type { CardLine, ListLine } from './types'

/**
 * A list's other versions, each stored as swaps against the list in the same file. Two kinds:
 *
 * - Its other Commander format: a Commander (EDH) list gets a Duel version, played one on one; a
 *   Duel Commander list gets an EDH version, for a pod. Turned on with `// Duel: On` (`// EDH: On`).
 * - Named versions in the list's own format, for another take on the deck (more counters, more
 *   artifacts): `// Version: Counters`, one header each.
 *
 * Swaps go in sections the app writes last, version by version:
 *
 * ```
 * // Duel in
 * 1 Bloodroot Apothecary
 * // Duel out
 * 1 Galactus, Devourer of Worlds
 * ```
 *
 * A version is the list without its cards out, plus its cards in, so a card added to the list is in
 * every version. All versions keep the same commanders and share their copies: the list needs, of
 * each card, as many copies as its largest version has ({@link unionCardLines}).
 *
 * @packageDocumentation
 */

/** Which version of a list: `base` is the list itself; any other value names one of its versions. */
export type ListVersion = string

/** The list itself, as a {@link ListVersion}. */
export const BASE: ListVersion = 'base'

/** One of a list's versions. */
export interface Variant {
  /** Name in headers, sections and labels: `Duel`, `EDH`, `Counters`. */
  label: string
  /** Format the version follows: the other Commander format (Duel, EDH); null for a named version, in the list's own. */
  format: string | null
}

/** A version for the list's other Commander format, by the list's format. */
export interface FormatVariant extends Variant {
  format: string
  /** Format of the list it is a version of. */
  base: string
  /** That format, named for the version toggle: `Commander`, `Duel`. */
  baseLabel: string
}

/** The other-format versions a list can have, by its format. */
const FORMAT_VARIANTS: FormatVariant[] = [
  { label: 'Duel', base: 'commander', baseLabel: 'Commander', format: 'duel' },
  { label: 'EDH', base: 'duel', baseLabel: 'Duel', format: 'commander' }
]

/** Longest version name. */
export const MAX_VERSION_NAME = 30

/** Words a version name can't be: other versions' and sections' names. */
const RESERVED = new Set(['base', 'main', 'deck', 'side', 'sideboard', 'commander', 'companion', 'maybeboard', 'about', 'version'])

/** Section of a swap line. */
type Swap = 'in' | 'out'

/** @returns A version name's comparison form. */
const keyOf = (label: string) => label.trim().toLowerCase()

/** @returns Whether two version names are the same. */
export const sameVersion = (a: ListVersion, b: ListVersion) => keyOf(a) === keyOf(b)

/** @returns Each swapped card line's version (by {@link keyOf}) and section, by line id. */
function swapsById(lines: ListLine[]): Map<string, { version: string; part: Swap }> {
  const names = versionSectionNames(lines)
  const swaps = new Map<string, { version: string; part: Swap }>()
  let section: { version: string; part: Swap } | null = null
  for (const line of lines) {
    const starts = swapSection(line, names)
    if (starts) section = { version: starts.name, part: starts.part }
    else if (line.kind === 'text' && OTHER_SECTION.test(line.text.trim())) section = null
    else if (section && line.kind === 'card') swaps.set(line.id, section)
  }
  return swaps
}

/** A section header (sideboard, deck, maybeboard…) other than a swap section; it ends one. */
const OTHER_SECTION = /^(?:\/\/\s*)?(?:deck|main|mainboard|maindeck|commander|companion|maybeboard|about|side|sideboard)\s*:?$/i

/** @returns Whether the line is a swap section header. */
const isSection = (line: ListLine, names: Set<string>) => swapSection(line, names) !== null

/** @returns The other-format version a list's format allows (Duel for Commander, EDH for Duel); null for other formats. */
export function variantFor(lines: ListLine[]): FormatVariant | null {
  const format = listFormat(lines)?.id
  return FORMAT_VARIANTS.find((variant) => variant.base === format) ?? null
}

/** @returns The list's other-format version, when it is turned on; null otherwise. */
export function activeVariant(lines: ListLine[]): FormatVariant | null {
  const variant = variantFor(lines)
  if (!variant) return null
  const value = listHeader(variant.label).read(lines)
  return value !== null && !/^(no|off|false)$/i.test(value) ? variant : null
}

/** @returns Names of the list's own versions, from its `// Version:` headers, without repeats. */
function namedVersions(lines: ListLine[]): string[] {
  const names: string[] = []
  for (const line of lines) {
    const name = line.kind === 'text' ? VERSION_HEADER.exec(line.text.trim())?.[1] : undefined
    if (name && !names.some((other) => sameVersion(other, name))) names.push(name)
  }
  return names
}

/** @returns The list's versions, in order: its other-format version, if on, then its named ones. */
export function listVariants(lines: ListLine[]): Variant[] {
  const variant = activeVariant(lines)
  const named = namedVersions(lines).filter((name) => !variant || !sameVersion(name, variant.label))
  return [...(variant ? [variant] : []), ...named.map((label) => ({ label, format: null }))]
}

/** @returns The list's version of that name; null if it has none (or for `base`). */
export function findVariant(lines: ListLine[], version: ListVersion): Variant | null {
  return listVariants(lines).find((variant) => sameVersion(variant.label, version)) ?? null
}

/** @returns Whether the list has any version. */
export function hasVariant(lines: ListLine[]): boolean {
  return listVariants(lines).length > 0
}

/** @returns The list itself, named for the version toggle: its format (`Commander`, `Duel`) when it has an other-format version, else `Main`. */
export function baseLabel(lines: ListLine[]): string {
  return variantFor(lines)?.baseLabel ?? ui.terms.mainVersion
}

/** @returns The format a version follows, by full name: `Duel Commander`; the list's own for a named version; null without a format. */
export function versionFormatLabel(lines: ListLine[], variant: Variant): string | null {
  return (variant.format ? findFormat(variant.format) : listFormat(lines))?.label ?? null
}

/** @returns Copies per card, by nameKey. */
export function copiesByName(lines: CardLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(nameKey(line.name), (counts.get(nameKey(line.name)) ?? 0) + line.qty)
  return counts
}

/**
 * @returns The lines of `lines` with more copies of their card than `other` has, each down to the
 * copies beyond `other`'s, in order: `other`'s copies are taken off a card's first lines first. Kept
 * lines keep their ids and printings, so edits find them.
 */
export function linesBeyond(lines: CardLine[], other: CardLine[]): CardLine[] {
  const left = copiesByName(other)
  const result: CardLine[] = []
  for (const line of lines) {
    const key = nameKey(line.name)
    const covered = Math.min(left.get(key) ?? 0, line.qty)
    left.set(key, (left.get(key) ?? 0) - covered)
    if (line.qty > covered) result.push(covered > 0 ? { ...line, qty: line.qty - covered } : line)
  }
  return result
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

/** @returns A version's swaps; empty if the list has no such version. Outs of cards no longer in the list are left out. */
export function variantSwaps(lines: ListLine[], version: ListVersion): Swaps {
  const variant = findVariant(lines, version)
  if (!variant) return { ins: [], outs: [] }
  const key = keyOf(variant.label)
  const swaps = swapsById(lines)
  const base = copiesByName(baseCardLines(lines))
  const ins: CardLine[] = []
  const outs: CardLine[] = []
  for (const line of cardLines(lines)) {
    const swap = swaps.get(line.id)
    if (swap?.version !== key) continue
    if (swap.part === 'in') {
      ins.push(line)
      continue
    }
    const card = nameKey(line.name)
    const qty = Math.min(line.qty, base.get(card) ?? 0)
    if (qty <= 0) continue
    base.set(card, (base.get(card) ?? 0) - qty)
    outs.push(qty === line.qty ? line : { ...line, qty })
  }
  return { ins, outs }
}

/**
 * @returns The card lines of a version: the list's own for `base`; for a version, the list's lines
 * less its cards out (fewer copies, or gone) plus its cards in. Kept lines keep their ids, so edits
 * find them.
 */
export function versionCardLines(lines: ListLine[], version: ListVersion): CardLine[] {
  const base = baseCardLines(lines)
  if (!findVariant(lines, version)) return base
  const { ins, outs } = variantSwaps(lines, version)
  return [...linesBeyond(base, outs), ...ins]
}

/**
 * @returns A version as a whole list: its headers and card lines, without swap sections; an
 * other-format version follows its own format. Card lines keep the list's order, cards in come last.
 */
export function versionLines(lines: ListLine[], version: ListVersion): ListLine[] {
  const swaps = swapsById(lines)
  const names = versionSectionNames(lines)
  const own = lines.filter((line) => !isSection(line, names) && !(line.kind === 'card' && swaps.has(line.id)))
  const variant = findVariant(lines, version)
  if (!variant) return own
  const cards = versionCardLines(lines, version)
  const kept = new Map(cards.map((line) => [line.id, line]))
  const resolved = own.flatMap((line): ListLine[] => (line.kind !== 'card' ? [line] : kept.has(line.id) ? [kept.get(line.id)!] : []))
  const ins = cards.filter((line) => !own.some((other) => other.id === line.id))
  return variant.format ? withFormat([...resolved, ...ins], variant.format) : [...resolved, ...ins]
}

/**
 * Card lines a list needs copies for, across its versions: the list's own, plus the extra copies of
 * cards a version has more of (as many as the version with most). Copies are shared, since the
 * versions are never played at once.
 */
export function unionCardLines(lines: ListLine[]): CardLine[] {
  const base = baseCardLines(lines)
  const own = copiesByName(base)
  const extra: CardLine[] = []
  for (const variant of listVariants(lines)) {
    const other = copiesByName(versionCardLines(lines, variant.label))
    for (const line of variantSwaps(lines, variant.label).ins) {
      const key = nameKey(line.name)
      const more = Math.min((other.get(key) ?? 0) - (own.get(key) ?? 0), line.qty)
      if (more <= 0) continue
      own.set(key, (own.get(key) ?? 0) + more)
      extra.push({ ...line, qty: more })
    }
  }
  return [...base, ...extra]
}

/**
 * @param swaps - New swaps of some versions, by name; the others keep theirs.
 * @returns Lines with the swap sections rewritten, last, version by version in {@link listVariants}
 * order, without empty sections; swaps of versions the list no longer has are dropped.
 */
function withSwaps(lines: ListLine[], swaps: Map<string, Swaps>): ListLine[] {
  const variants = listVariants(lines)
  const all = variants.map((variant) => ({ label: variant.label, ...(swaps.get(keyOf(variant.label)) ?? variantSwaps(lines, variant.label)) }))
  const ids = swapsById(lines)
  const names = versionSectionNames(lines)
  const rest = lines.filter((line) => !isSection(line, names) && !(line.kind === 'card' && ids.has(line.id)))
  while (rest.length > 0 && rest.at(-1)!.kind === 'text' && (rest.at(-1) as { text: string }).text.trim() === '') rest.pop()
  const section = (label: string, part: Swap, cards: CardLine[]): ListLine[] =>
    cards.length === 0
      ? []
      : [
          { kind: 'text', id: newLineId(), text: '' },
          { kind: 'text', id: newLineId(), text: `// ${label} ${part}` },
          ...cards.map((card) => ({ ...card, id: card.id || newLineId() }))
        ]
  return [...rest, ...all.flatMap(({ label, ins, outs }) => [...section(label, 'in', ins), ...section(label, 'out', outs)])]
}

/** @returns Lines with one version's swaps replaced. */
const withVersionSwaps = (lines: ListLine[], version: ListVersion, swaps: Swaps) =>
  withSwaps(lines, new Map([[keyOf(version), swaps]]))

/** @returns Lines without any version: no version headers, no swap sections. */
function withoutVariants(lines: ListLine[]): ListLine[] {
  const names = versionSectionNames(lines)
  const ids = swapsById(lines)
  const bare = lines.filter(
    (line) =>
      !isSection(line, names) &&
      !(line.kind === 'card' && ids.has(line.id)) &&
      !(line.kind === 'text' && VERSION_HEADER.test(line.text.trim()))
  )
  while (bare.length > 0 && bare.at(-1)!.kind === 'text' && (bare.at(-1) as { text: string }).text.trim() === '') bare.pop()
  return FORMAT_VARIANTS.reduce((result, variant) => listHeader(variant.label).write(result, null), bare)
}

/** @returns Index after the list's leading headers (format, commanders, versions), where a new version header goes. */
function afterHeaders(lines: ListLine[]): number {
  let at = 0
  lines.forEach((line, index) => {
    if (line.kind === 'text' && /^\/\/\s*(format|commander|version|duel|edh)\s*:/i.test(line.text.trim())) at = index + 1
  })
  return at
}

/**
 * Turns the list's other-format version on (as an identical copy of the list) or off, deleting its
 * swaps. Lists whose format has no other-format version are left without any.
 */
export function withVariant(lines: ListLine[], on: boolean): ListLine[] {
  const possible = variantFor(lines)
  const current = activeVariant(lines)
  const kept = (lines: ListLine[]) => FORMAT_VARIANTS.reduce((result, variant) => listHeader(variant.label).write(result, null), lines)
  // Duel and EDH sections are always swaps, so dropping the header drops them too.
  if (!on || !possible) return withSwaps(kept(lines), new Map())
  if (current) return lines
  const header: ListLine = { kind: 'text', id: newLineId(), text: `// ${possible.label}: On` }
  const clean = kept(lines)
  const at = afterHeaders(clean)
  return [...clean.slice(0, at), header, ...clean.slice(at)]
}

/**
 * @returns Why a name can't name a new version of the list (empty, too long, odd characters, taken, or
 * reserved); null if it can.
 * @param except - A version being renamed, whose own name is fine.
 */
export function versionNameIssue(lines: ListLine[], name: string, except: ListVersion | null = null): string | null {
  const trimmed = name.trim()
  if (!trimmed) return ui.names.version.empty
  if (trimmed.length > MAX_VERSION_NAME) return ui.names.version.tooLong(MAX_VERSION_NAME)
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &'+-]*$/u.test(trimmed)) return ui.names.version.characters
  if (/\s(in|out)$/i.test(trimmed)) return ui.names.version.endsInOut
  const taken = [...FORMAT_VARIANTS.map((variant) => variant.label), ...listVariants(lines).map((variant) => variant.label)]
  if (taken.some((label) => sameVersion(label, trimmed) && !(except && sameVersion(except, trimmed)))) return ui.names.version.taken
  if (RESERVED.has(keyOf(trimmed))) return ui.names.version.taken
  return null
}

/** @returns Lines with a new named version, identical to the list until changed. */
export function withNamedVersion(lines: ListLine[], name: string): ListLine[] {
  const header: ListLine = { kind: 'text', id: newLineId(), text: `// Version: ${name.trim()}` }
  const at = afterHeaders(lines)
  return [...lines.slice(0, at), header, ...lines.slice(at)]
}

/** @returns Lines without one version: its header and its swaps. */
export function withoutVersion(lines: ListLine[], version: ListVersion): ListLine[] {
  const variant = findVariant(lines, version)
  if (!variant) return lines
  if (variant.format) return withVariant(lines, false)
  // Its swaps go while its header still marks their sections as swaps.
  const cleared = withVersionSwaps(lines, variant.label, { ins: [], outs: [] })
  return cleared.filter((line) => !(line.kind === 'text' && sameVersion(VERSION_HEADER.exec(line.text.trim())?.[1] ?? '', variant.label)))
}

/** @returns Lines with a named version renamed, its swaps kept. */
export function withVersionName(lines: ListLine[], version: ListVersion, name: string): ListLine[] {
  const variant = findVariant(lines, version)
  if (!variant || variant.format) return lines
  const swaps = variantSwaps(lines, variant.label)
  const renamed = withoutVersion(lines, variant.label)
  const at = lines.findIndex((line) => line.kind === 'text' && sameVersion(VERSION_HEADER.exec(line.text.trim())?.[1] ?? '', variant.label))
  const header: ListLine = { kind: 'text', id: newLineId(), text: `// Version: ${name.trim()}` }
  const placed = [...renamed.slice(0, Math.max(0, at)), header, ...renamed.slice(Math.max(0, at))]
  return withVersionSwaps(placed, name, swaps)
}

/** Card fields that identify a printing; quantity and id aside. */
export type CardPick = Omit<CardLine, 'id' | 'kind' | 'qty'>

/**
 * Sets how many copies of a card a version has, as swaps against the list: copies beyond the list's
 * are in, copies short of them out. Other swaps are kept, in place, so the file changes little; a
 * new swap goes last. Outs of cards no longer in the list are dropped.
 * @param card - The card; a new card in keeps this printing.
 */
export function withVariantCount(lines: ListLine[], version: ListVersion, card: CardPick, target: number): ListLine[] {
  const key = nameKey(card.name)
  const { ins, outs } = variantSwaps(lines, version)
  const own = copiesByName(baseCardLines(lines)).get(key) ?? 0
  const previous = ins.find((line) => nameKey(line.name) === key)
  const added: CardLine | null = target > own ? { ...(previous ?? { kind: 'card', id: '', ...card }), qty: target - own } : null
  const cut: CardLine | null = target < own ? { kind: 'card', id: '', name: card.name, foil: false, qty: own - target } : null
  return withVersionSwaps(lines, version, { ins: placed(ins, key, added), outs: placed(outs, key, cut) })
}

/**
 * @returns `after` (the list with cards added) where a version that already swapped one of them in
 * plays no more copies than before or than the list now has: the list's new copies take the place of
 * its swap, rather than adding to it.
 */
export function withAbsorbedIns(before: ListLine[], after: ListLine[]): ListLine[] {
  let lines = after
  for (const { label } of listVariants(before)) {
    const had = copiesByName(versionCardLines(before, label))
    for (const line of variantSwaps(before, label).ins) {
      const key = nameKey(line.name)
      const own = copiesByName(baseCardLines(lines)).get(key) ?? 0
      lines = withVariantCount(lines, label, line, Math.max(had.get(key) ?? 0, own))
    }
  }
  return lines
}

/** @returns `list` with a card's lines replaced by `line` where the first stood (last for a new card), or dropped for null. */
function placed(list: CardLine[], key: string, line: CardLine | null): CardLine[] {
  const at = list.findIndex((other) => nameKey(other.name) === key)
  const rest = list.filter((other) => nameKey(other.name) !== key)
  if (!line) return rest
  const index = at < 0 ? rest.length : at
  return [...rest.slice(0, index), line, ...rest.slice(index)]
}

/**
 * Makes a version a given list, as swaps against this list's cards (applying an upgrade of that version).
 * @param target - Card lines the version should have.
 */
export function withVariantCards(lines: ListLine[], version: ListVersion, target: CardLine[]): ListLine[] {
  const own = copiesByName(baseCardLines(lines))
  const wanted = copiesByName(target)
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
  // Swaps the version already had keep their order, so the file changes little; new ones go last.
  const before = variantSwaps(lines, version)
  return withVersionSwaps(lines, version, { ins: inOrderOf(ins, before.ins), outs: inOrderOf(outs, before.outs) })
}

/** @returns `list` with the cards of `previous` first, in its order, then the rest. */
function inOrderOf(list: CardLine[], previous: CardLine[]): CardLine[] {
  const rank = new Map(previous.map((line, index) => [nameKey(line.name), index]))
  const at = (line: CardLine) => rank.get(nameKey(line.name)) ?? Infinity
  return [...list].sort((a, b) => at(a) - at(b))
}

/** @returns The list itself as text, to edit as text: its headers and cards, without its versions. */
export function baseText(lines: ListLine[]): string {
  return serializeList(withoutVariants(versionLines(lines, BASE)))
}

/**
 * @returns Lines of the list edited as text ({@link baseText}), keeping its versions: their headers
 * and swaps come back, but for an other-format version the edited list's format no longer allows.
 */
export function withBaseText(lines: ListLine[], text: string): ListLine[] {
  return withVariantOf(parseList(text), lines)
}

/** @returns A version's cards as decklist text, to edit as text; the list's own without such a version. */
export function variantText(lines: ListLine[], version: ListVersion): string {
  return serializeList(versionCardLines(lines, version))
}

/**
 * Makes a version the cards of a decklist (the version edited as text), as swaps against the list.
 * Headers and other text are ignored; the commanders stay, as they lead every version.
 */
export function withVariantText(lines: ListLine[], version: ListVersion, text: string): ListLine[] {
  const target = cardLines(parseList(text))
  const kept = new Set(target.map((line) => nameKey(line.name)))
  const missing = listCommanders(lines).map(nameKey).filter((key) => !kept.has(key))
  const leaders = baseCardLines(lines).filter((line) => missing.includes(nameKey(line.name)))
  return withVariantCards(lines, version, [...leaders, ...target])
}

/**
 * @returns The list's versions (headers and swaps) moved onto `lines`, which replace its cards
 * (applying an upgrade of the list itself); an other-format version only if `lines` are in a format
 * that allows it.
 */
export function withVariantOf(lines: ListLine[], from: ListLine[]): ListLine[] {
  let result = withoutVariants(lines)
  const swaps = new Map<string, Swaps>()
  for (const variant of listVariants(from)) {
    if (variant.format) {
      if (variantFor(result)?.label !== variant.label) continue
      result = withVariant(result, true)
    } else {
      result = withNamedVersion(result, variant.label)
    }
    swaps.set(keyOf(variant.label), variantSwaps(from, variant.label))
  }
  return swaps.size > 0 ? withSwaps(result, swaps) : result
}
