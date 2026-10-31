import { listHeader } from './decklist'
import type { ListLine } from './types'

/** Energy curve setting of a list: `// Energy curve: Yes`, kept in `lists.json`. */
const ENERGY_CURVE = listHeader('Energy curve', 'energy\\s+curve')

/** @returns Whether a list shows its energy curve in Statistics. */
export function showsEnergyCurve(lines: ListLine[]): boolean {
  const value = ENERGY_CURVE.read(lines)
  return value !== null && !/^(no|false)$/i.test(value)
}

/** Turns a list's energy curve on, or off (removing the header). */
export function withEnergyCurve(lines: ListLine[], on: boolean): ListLine[] {
  return ENERGY_CURVE.write(lines, on ? 'Yes' : null)
}
