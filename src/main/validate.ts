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
  if (!Array.isArray(value) || value.length > max || !value.every((item) => valid(item))) throw new Error(`Invalid ${what}.`)
  return value as T[]
}

/** Validates an array of safe integers from the renderer. @throws Error if invalid or longer than `max`. */
export const numbers = (value: unknown, what: string, max = 50_000) => arrayOf<number>(value, Number.isSafeInteger, what, max)

/** Validates card names from the renderer. @throws Error if invalid, more than `max`, or one is longer than `maxLength`. */
export const cardNames = (value: unknown, max: number, maxLength = Infinity) =>
  arrayOf<string>(value, (name) => typeof name === 'string' && name.length <= maxLength, 'card names', max)

/** @throws Error if `value` is not a string. */
export function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${what}.`)
  return value
}
