import { listHeader } from './decklist'
import { TEMPERAMENTS, type Temperament } from './temperaments'
import type { ListLine } from './types'

/** Typeface header of a list file: `// Typeface: Anton`, a temperament's display face by name. */
const TYPEFACE = listHeader('Typeface')

/**
 * @returns The temperament whose display face the list sets (its size, weight and case come along);
 * null when it leaves the face to its commanders' themes.
 */
export function listTypeface(lines: ListLine[]): Temperament | null {
  const value = TYPEFACE.read(lines)?.trim().toLowerCase()
  const found = Object.entries(TEMPERAMENTS).find(([, style]) => style.name.toLowerCase() === value)
  return found ? (found[0] as Temperament) : null
}

/** Sets the display face, by its temperament, or removes the header (`null`), going back to the app's face. */
export function withTypeface(lines: ListLine[], temperament: Temperament | null): ListLine[] {
  // Written with the other list headers, before the first card.
  return TYPEFACE.write(lines, temperament ? TEMPERAMENTS[temperament].name : null, (rest) => {
    const index = rest.findIndex((line) => line.kind === 'card')
    return index < 0 ? rest.length : index
  })
}
