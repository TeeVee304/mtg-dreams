import { ui } from '@shared/text'
import { languageOf } from '@shared/languages'
import type { CardQuery, LocalizedQuery } from '@shared/types'

/**
 * Checks for values sent by the renderer over IPC, shared by every IPC handler: anything that
 * arrives is untrusted until checked here.
 *
 * @packageDocumentation
 */

/**
 * Validates an array from the renderer.
 * @throws Error if not an array, longer than `max`, or with an item failing `valid`.
 */
export function arrayOf<T>(value: unknown, valid: (item: unknown) => boolean, what: string, max: number): T[] {
  if (!Array.isArray(value) || value.length > max || !value.every((item) => valid(item))) throw new Error(ui.errors.invalid(what))
  return value as T[]
}

/** Validates an array of safe integers from the renderer. @throws Error if invalid or longer than `max`. */
export const numbers = (value: unknown, what: string, max = 50_000) => arrayOf<number>(value, Number.isSafeInteger, what, max)

/** A Scryfall id: a UUID. */
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validates Scryfall ids from the renderer. @throws Error if invalid or more than `max`. */
export const scryfallIds = (value: unknown, max: number) =>
  arrayOf<string>(value, (id) => typeof id === 'string' && SCRYFALL_ID.test(id), 'Scryfall ids', max)

/** Validates card names from the renderer. @throws Error if invalid, more than `max`, or one is longer than `maxLength`. */
export const cardNames = (value: unknown, max: number, maxLength = Infinity) =>
  arrayOf<string>(value, (name) => typeof name === 'string' && name.length <= maxLength, 'card names', max)

/** Longest name, set code or collector number a card query takes. */
const MAX_QUERY_TEXT = 200

/** @returns Whether `value` is a non-empty string short enough for a card query. */
const queryText = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_QUERY_TEXT

/** @returns Whether `value` is a {@link CardQuery}: a name, or a set code and collector number. */
function isCardQuery(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const query = value as Record<string, unknown>
  return 'name' in query ? queryText(query.name) : queryText(query.set) && queryText(query.collector)
}

/**
 * Validates a localized image query from the renderer: a card name, a language, and optionally the
 * printing's set code and collector number.
 * @throws Error if invalid.
 */
export function localizedQuery(value: unknown): LocalizedQuery {
  const query = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const lang = typeof query.lang === 'string' ? languageOf(query.lang) : undefined
  const optional = (field: unknown) => field === undefined || queryText(field)
  if (!queryText(query.name) || !lang || lang !== query.lang || !optional(query.set) || !optional(query.collector)) {
    throw new Error(ui.errors.invalid('localized image query'))
  }
  return {
    name: query.name as string,
    lang,
    ...(query.set !== undefined && { set: query.set as string }),
    ...(query.collector !== undefined && { collector: query.collector as string })
  }
}

/** Validates card resolver queries from the renderer. @throws Error if invalid or more than `max`. */
export const cardQueries = (value: unknown, max: number) => arrayOf<CardQuery>(value, isCardQuery, 'card queries', max)

/** @throws Error if `value` is not a string. */
export function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(ui.errors.invalid(what))
  return value
}
