/** @returns `word`, or its plural unless `n` is 1: `card`/`cards`, `copy`/`copies` (irregular plurals passed). */
export function plural(n: number, word: string, many = `${word}s`): string {
  return n === 1 ? word : many
}

/** @returns `n` and {@link plural} `word`: `1 card`, `2 cards`, `3 copies`. */
export function counted(n: number, word: string, many?: string): string {
  return `${n} ${plural(n, word, many)}`
}

/** @returns `n` as an English ordinal: `1st`, `2nd`, `3rd`, `4th`, `11th`, `22nd`. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
}
