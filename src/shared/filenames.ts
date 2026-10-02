/**
 * Windows file-name rules for list and trade names, shared by main-process validation
 * and renderer sanitization.
 *
 * @packageDocumentation
 */

/** Max name length, in characters. */
export const MAX_NAME_LENGTH = 100

/** Characters invalid in Windows file names. */
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/
/** Reserved Windows device names. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** @returns User-facing reason `name` is an invalid file name; null if valid. */
export function fileNameProblem(name: string): string | null {
  if (!name) return 'Name cannot be empty.'
  if (name.length > MAX_NAME_LENGTH) return `Name is too long (max ${MAX_NAME_LENGTH} characters).`
  if (FORBIDDEN.test(name)) return 'Name cannot contain < > : " / \\ | ? *'
  if (/[. ]$/.test(name)) return 'Name cannot end with a dot or space.'
  if (RESERVED.test(name)) return `"${name}" is a reserved name on Windows.`
  return null
}

/**
 * Sanitizes text into a valid file name (`A: B` → `A - B`), truncated to leave room for a
 * ` (n)` suffix; reserved names get a `_` suffix.
 * @returns Sanitized name; `''` if nothing remains.
 */
export function safeFileName(text: string): string {
  const name = text
    .replace(/:/g, ' -')
    .replace(new RegExp(FORBIDDEN.source, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH - 10)
    .replace(/[. ]+$/, '')
  return RESERVED.test(name) ? `${name}_` : name
}
