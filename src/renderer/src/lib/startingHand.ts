/** Cards in an opening hand. */
export const HAND_SIZE = 7

/** @returns Each copy of the rows as its own card: a row of 4 copies, four times. */
export function libraryOf<T extends { line: { qty: number } }>(rows: T[]): T[] {
  return rows.flatMap((row) => Array.from({ length: row.line.qty }, () => row))
}

/** @returns The items in a random order (Fisher–Yates); `random` returns [0, 1), as Math.random. */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** How far below a held hand's cards they all turn around (px), as if held by their corners. */
const FAN_PIVOT = 1000
/** The most a card turns from its neighbour (degrees), and the most the fan spreads to each side. */
const FAN_STEP = 6
const FAN_SPREAD = 18

/**
 * @returns Where the card at `index` of a held hand of `count` sits, from the middle card's place:
 * turned around one point far below, so the cards' tops trace one smooth arc. Across and down (px)
 * and turned (degrees); the fan opens with the hand, up to a limit.
 */
export function fanPlace(index: number, count: number): { x: number; y: number; rotate: number } {
  const step = count > 1 ? Math.min(FAN_STEP, (2 * FAN_SPREAD) / (count - 1)) : 0
  const rotate = (index - (count - 1) / 2) * step
  const angle = (rotate * Math.PI) / 180
  return {
    x: Math.round(FAN_PIVOT * Math.sin(angle)),
    y: Math.round(FAN_PIVOT * (1 - Math.cos(angle))),
    rotate: Math.round(rotate * 10) / 10
  }
}

/** @returns The library with its card at `index` (one in hand) moved to the bottom. */
export function putOnBottom<T>(library: T[], index: number): T[] {
  return [...library.slice(0, index), ...library.slice(index + 1), library[index]]
}

/** @returns Cards to put on the bottom after `mulligans`: Commander's first mulligan is free, then one per mulligan (London). */
export const toBottom = (mulligans: number) => Math.max(0, mulligans - 1)
