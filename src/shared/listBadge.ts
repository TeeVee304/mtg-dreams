import { listHeader } from './decklist'
import type { BadgeShape } from './temperaments'
import type { ListLine } from './types'

/** Badge shape header of a list file: `// Badge: circle`, `square` or `diamond`. */
const BADGE = listHeader('Badge')

const SHAPES: BadgeShape[] = ['circle', 'square', 'diamond']

/** @returns The Background and Companion badges' shape the list sets; null when it leaves them round. */
export function listBadge(lines: ListLine[]): BadgeShape | null {
  const value = BADGE.read(lines)?.toLowerCase()
  return SHAPES.find((shape) => shape === value) ?? null
}

/** Sets the badges' shape, or removes the header (`null`), leaving them round. */
export function withBadge(lines: ListLine[], shape: BadgeShape | null): ListLine[] {
  // Written with the other list headers, before the first card.
  return BADGE.write(lines, shape, (rest) => {
    const index = rest.findIndex((line) => line.kind === 'card')
    return index < 0 ? rest.length : index
  })
}
