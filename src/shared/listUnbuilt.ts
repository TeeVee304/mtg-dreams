import { listHeader } from './decklist'
import { holdsNoCopies, listFormat } from './formats'
import type { ListLine } from './types'

/** Unbuilt header line stored in a deck file: `// Unbuilt: Yes`. */
const UNBUILT = listHeader('Unbuilt')

/**
 * @param lines - Lines of a deck; wishlists are never unbuilt, whatever their headers.
 * @returns Whether the deck is unbuilt: put together from your cards when played, it uses every
 * owned copy without reserving any. Decks of Arena formats always are.
 */
export function isUnbuilt(lines: ListLine[]): boolean {
  if (holdsNoCopies(listFormat(lines))) return true
  const value = UNBUILT.read(lines)
  return value !== null && !/^(no|false)$/i.test(value)
}

/** Sets the unbuilt header, placing it first, or removes it. */
export function withUnbuilt(lines: ListLine[], unbuilt: boolean): ListLine[] {
  return UNBUILT.write(lines, unbuilt ? 'Yes' : null)
}
