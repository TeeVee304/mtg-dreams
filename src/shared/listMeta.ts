/**
 * Personal list settings: how you keep a list, not what the deck is. They are written as header lines
 * (`// Color: Blue`, `// Palette: Gruul`, `// Badge: square`, `// Texture: grain`, `// Typeface: Anton`, `// Banner: …`, `// Hold copies: No`, `// Upgrade of: …`, `// Upgrade version: Duel`,
 * `// Preferred Versions: Innistrad`, `// Token Versions: …`) while the
 * app works with a list, but stored apart from its file, in `lists.json`, so the file holds only the
 * deck: copying, sharing or opening it elsewhere gives no personal settings. A file that has such
 * headers (an old file, or text pasted with them) gives them up to `lists.json` when saved. The old
 * `// Unbuilt: Yes` header, and `unbuilt` in `lists.json`, are read as `// Hold copies: No`.
 *
 * @packageDocumentation
 */

/** Personal settings of one list, by field; a missing field is unset. */
export type ListMeta = Partial<Record<MetaField, string>>

/** A personal setting. */
export type MetaField = 'color' | 'palette' | 'badge' | 'texture' | 'typeface' | 'banner' | 'holdsCopies' | 'upgradeOf' | 'upgradeVersion' | 'preferredVersions' | 'tokenVersions' | 'energyCurve'

/** Each setting's header label, as written, and the label pattern read back; in the order written. */
const FIELDS: { field: MetaField; label: string; pattern: string }[] = [
  { field: 'color', label: 'Color', pattern: 'colou?r' },
  { field: 'palette', label: 'Palette', pattern: 'palette' },
  { field: 'badge', label: 'Badge', pattern: 'badge' },
  { field: 'texture', label: 'Texture', pattern: 'texture' },
  { field: 'typeface', label: 'Typeface', pattern: 'typeface' },
  { field: 'banner', label: 'Banner', pattern: 'banner' },
  { field: 'holdsCopies', label: 'Hold copies', pattern: 'holds?\\s+copies' },
  { field: 'upgradeOf', label: 'Upgrade of', pattern: 'upgrade\\s+of' },
  { field: 'upgradeVersion', label: 'Upgrade version', pattern: 'upgrade\\s+version' },
  { field: 'preferredVersions', label: 'Preferred Versions', pattern: 'preferred\\s+versions' },
  { field: 'tokenVersions', label: 'Token Versions', pattern: 'token\\s+versions' },
  { field: 'energyCurve', label: 'Energy curve', pattern: 'energy\\s+curve' }
]

/** Label pattern of the old Unbuilt header, read as Hold copies (see {@link fromUnbuilt}). */
const UNBUILT = 'unbuilt'

/** @returns The Hold copies value an old Unbuilt value stands for: `No` for a yes; unset for a no. */
const fromUnbuilt = (value: string) => (/^(no|false)$/i.test(value.trim()) ? undefined : 'No')

/** Matches a personal header line; group 1 is the label, group 2 the value. */
const HEADER = new RegExp(`^\\s*//\\s*(${[...FIELDS.map((field) => field.pattern), UNBUILT].join('|')})\\s*:\\s*(.*?)\\s*$`, 'i')

/** @returns The setting a label names; `unbuilt` for the old Unbuilt header. */
const fieldOf = (label: string): MetaField | typeof UNBUILT =>
  FIELDS.find((field) => new RegExp(`^${field.pattern}$`, 'i').test(label.trim()))?.field ?? UNBUILT

/**
 * Splits a list's text into its file text, without personal headers, and its personal settings (the
 * first value of each, as {@link listHeader} reads them). Other lines are kept as they are.
 */
export function splitMeta(text: string): { text: string; meta: ListMeta } {
  const meta: ListMeta = {}
  const kept: string[] = []
  for (const line of text.split('\n')) {
    const match = HEADER.exec(line.replace(/\r$/, ''))
    if (!match) {
      kept.push(line)
      continue
    }
    const label = fieldOf(match[1])
    const field = label === UNBUILT ? 'holdsCopies' : label
    const value = label === UNBUILT ? fromUnbuilt(match[2]) : match[2]
    if (value && meta[field] === undefined) meta[field] = value
  }
  return { text: kept.join('\n'), meta }
}

/** @returns A list's text with its personal settings as header lines, first. */
export function joinMeta(text: string, meta: ListMeta): string {
  const headers = FIELDS.filter(({ field }) => meta[field]).map(({ field, label }) => `// ${label}: ${meta[field]}`)
  return headers.length === 0 ? text : `${headers.join('\n')}\n${text}`
}

/** @returns A list's text without personal headers: the deck, to copy or share. */
export function stripMeta(text: string): string {
  return splitMeta(text).text
}

/**
 * @returns Edited text (from {@link stripMeta}, so without personal headers) with the personal
 * settings of the list's previous text back; a header the edited text has wins.
 */
export function withMetaOf(edited: string, previous: string): string {
  const { text, meta } = splitMeta(edited)
  return joinMeta(text, { ...splitMeta(previous).meta, ...meta })
}

/** @returns Whether two sets of personal settings are the same. */
export function sameMeta(a: ListMeta, b: ListMeta): boolean {
  return FIELDS.every(({ field }) => (a[field] ?? '') === (b[field] ?? ''))
}

/** @returns Settings with only known, non-empty string fields, an old `unbuilt` read as `holdsCopies`; for reading `lists.json`. */
export function validMeta(raw: unknown): ListMeta {
  const meta: ListMeta = {}
  if (typeof raw !== 'object' || raw === null) return meta
  for (const { field } of FIELDS) {
    const value = (raw as Record<string, unknown>)[field]
    if (typeof value === 'string' && value.trim()) meta[field] = value.trim()
  }
  const unbuilt = (raw as Record<string, unknown>)[UNBUILT]
  if (meta.holdsCopies === undefined && typeof unbuilt === 'string' && unbuilt.trim()) {
    const holds = fromUnbuilt(unbuilt)
    if (holds) meta.holdsCopies = holds
  }
  return meta
}
