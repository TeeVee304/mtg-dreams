import { listHeader } from './decklist'
import { holdsNoCopies, listFormat } from './formats'
import type { ListLine } from './types'

/**
 * Hold Copies header of a deck that sets its own: `// Hold copies: Yes` or `No`. A deck without it
 * follows the Decks hold Copies setting.
 */
const HOLDS = listHeader('Hold copies', 'holds?\\s+copies')

/** Header from before Hold Copies: `// Unbuilt: Yes` meant the deck holds no copies. */
const UNBUILT = listHeader('Unbuilt')

/** @returns Whether a header value says no. */
const isNo = (value: string) => /^(no|false)$/i.test(value)

/**
 * @param lines - Lines of a deck.
 * @returns Whether the deck sets its own Hold Copies (an old `// Unbuilt: Yes` counts as holding
 * none); null if it follows the setting.
 */
export function ownHoldsCopies(lines: ListLine[]): boolean | null {
  const holds = HOLDS.read(lines)
  if (holds !== null) return !isNo(holds)
  const unbuilt = UNBUILT.read(lines)
  return unbuilt !== null && !isNo(unbuilt) ? false : null
}

/**
 * @param lines - Lines of a deck; wishlists hold no copies of their own (see `copyPool`), whatever their headers.
 * @param byDefault - The Decks hold Copies setting, for a deck that does not set its own.
 * @returns Whether the deck holds its copies, so no other deck uses them. One that holds none, put
 * together from your cards when played, uses every owned copy without reserving any. Decks of Arena
 * formats never hold copies.
 */
export function holdsCopies(lines: ListLine[], byDefault = true): boolean {
  if (holdsNoCopies(listFormat(lines))) return false
  return ownHoldsCopies(lines) ?? byDefault
}

/**
 * Sets whether a deck holds its copies, placing the header first, whatever the setting says; `null`
 * makes it follow the setting again. The old Unbuilt header goes.
 */
export function withHoldsCopies(lines: ListLine[], holds: boolean | null): ListLine[] {
  return HOLDS.write(UNBUILT.write(lines, null), holds === null ? null : holds ? 'Yes' : 'No')
}
