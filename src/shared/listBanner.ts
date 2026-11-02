import { listHeader } from './decklist'
import type { ListLine } from './types'

/** Banner header of a list file: `// Banner: <card name>`, the Card whose art heads a deck without a commander. */
const BANNER = listHeader('Banner')

/** @returns The Card the list names for its banner; null when it leaves it to the deck. */
export function listBanner(lines: ListLine[]): string | null {
  return BANNER.read(lines)?.trim() || null
}

/** Sets the banner's Card, or removes the header (`null`), leaving it to the deck. */
export function withBanner(lines: ListLine[], name: string | null): ListLine[] {
  // Written with the other list headers, before the first card.
  return BANNER.write(lines, name, (rest) => {
    const index = rest.findIndex((line) => line.kind === 'card')
    return index < 0 ? rest.length : index
  })
}
