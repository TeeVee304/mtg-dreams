// Deck, wishlist and friend names double as Windows file names, so they follow
// Windows' rules. Kept in one place: the main process validates names with them,
// and the app uses them to turn any text (a precon's name, a friend's) into a valid name.

export const MAX_NAME_LENGTH = 100

const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** Why a name can't be used as a file name, or null if it can. */
export function fileNameProblem(name: string): string | null {
  if (!name) return 'Name cannot be empty.'
  if (name.length > MAX_NAME_LENGTH) return `Name is too long (max ${MAX_NAME_LENGTH} characters).`
  if (FORBIDDEN.test(name)) return 'Name cannot contain < > : " / \\ | ? *'
  if (/[. ]$/.test(name)) return 'Name cannot end with a dot or space.'
  if (RESERVED.test(name)) return `"${name}" is a reserved name on Windows.`
  return null
}

/**
 * Makes text safe to use as a file name ("A: B" becomes "A - B"); '' if nothing is
 * left. Leaves room for a " (2)" suffix when the name is already taken.
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
