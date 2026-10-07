/** @returns Sum of `value` over `items`. */
export function sumOf<T>(items: Iterable<T>, value: (item: T) => number): number {
  let total = 0
  for (const item of items) total += value(item)
  return total
}

/** @returns Total copies of `cards`. */
export const totalCopies = (cards: Iterable<{ qty: number }>) => sumOf(cards, (card) => card.qty)
