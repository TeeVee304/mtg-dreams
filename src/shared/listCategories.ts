import { cleanCategory, listHeader } from './decklist'
import type { CardLine, ListLine } from './types'

/**
 * A list's own Card categories (`1 Sol Ring [Ramp]`) and its Group by setting: by Card type, as
 * always, or by category (`// Group by: Category`, kept in `lists.json`). Grouped by category, the
 * main deck shows one section per first category, alphabetically, then Uncategorized; the
 * Commander, Companion, Sideboard and Maybeboard sections stay as they are.
 *
 * @packageDocumentation
 */

/** Group by setting of a list grouped by category. */
const GROUP_BY = listHeader('Group by', 'group\\s+by')

/** @returns Whether a list is grouped by category rather than by Card type. */
export function groupsByCategory(lines: ListLine[]): boolean {
  return /^categor(y|ies)$/i.test(GROUP_BY.read(lines) ?? '')
}

/** Groups a list by category, or by Card type again (removing the header). */
export function withGroupByCategory(lines: ListLine[], on: boolean): ListLine[] {
  return GROUP_BY.write(lines, on ? 'Category' : null)
}

/** @returns Whether two category names are the same, case aside. */
export const sameCategory = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** @returns The category whose section a Card goes in: its first; null for none. */
export const categoryOf = (line: Pick<CardLine, 'categories'>): string | null => line.categories?.[0] ?? null

/** @returns Every category a list's Cards have, each once (first spelling), alphabetically. */
export function listCategories(lines: ListLine[]): string[] {
  const names = new Map<string, string>()
  for (const line of lines) {
    if (line.kind !== 'card') continue
    for (const name of line.categories ?? []) if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name)
  }
  return sortCategories([...names.values()])
}

/** @returns Category names alphabetically, case aside. */
export const sortCategories = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

/** @returns The spelling the list already uses for a category, else the name as given. */
function spelling(lines: ListLine[], name: string): string {
  return listCategories(lines).find((other) => sameCategory(other, name)) ?? name
}

/** @returns A line with these categories; none removes the field. */
function withCategories(line: CardLine, categories: string[]): CardLine {
  const { categories: _old, ...rest } = line
  return categories.length > 0 ? { ...rest, categories } : rest
}

/**
 * Puts Cards in a category: it becomes their first, replacing the one they had; their other categories
 * stay. A name the list already uses, in another case, keeps the list's spelling.
 * @param category - Null, or a name with nothing left once cleaned, leaves the Cards with no category.
 */
export function withCategory(lines: ListLine[], ids: string[], category: string | null): ListLine[] {
  const cleaned = category ? cleanCategory(category) : ''
  const name = cleaned ? spelling(lines, cleaned) : ''
  return lines.map((line) => {
    if (line.kind !== 'card' || !ids.includes(line.id)) return line
    if (!name) return withCategories(line, [])
    const others = (line.categories ?? []).slice(1).filter((other) => !sameCategory(other, name))
    return withCategories(line, [name, ...others])
  })
}

/** Renames a category on every Card; one renamed to a category it also has is listed once. */
export function withRenamedCategory(lines: ListLine[], from: string, to: string): ListLine[] {
  const cleaned = cleanCategory(to)
  if (!cleaned) return lines
  const name = sameCategory(cleaned, from) ? cleaned : spelling(lines, cleaned)
  return lines.map((line) => {
    if (line.kind !== 'card' || !line.categories?.some((other) => sameCategory(other, from))) return line
    const renamed = line.categories.map((other) => (sameCategory(other, from) ? name : other))
    return withCategories(line, renamed.filter((other, i) => renamed.findIndex((first) => sameCategory(first, other)) === i))
  })
}

/** Takes a category off every Card: those it came first for go to their next category, or to none. */
export function withoutCategory(lines: ListLine[], name: string): ListLine[] {
  return lines.map((line) =>
    line.kind === 'card' && line.categories?.some((other) => sameCategory(other, name))
      ? withCategories(line, line.categories.filter((other) => !sameCategory(other, name)))
      : line
  )
}
