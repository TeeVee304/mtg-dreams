/**
 * Mana base helpers for deckbuilding: which colors a land makes, how many colored symbols the
 * spells need, and how to split basic lands between colors.
 *
 * @packageDocumentation
 */

/** The five colors, WUBRG order. */
const COLORS = ['W', 'U', 'B', 'R', 'G'] as const

/** Basic land of each color; Wastes for colorless decks. */
export const BASIC_LANDS: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' }
/** Color of each basic land type. */
const TYPE_COLORS: Record<string, string> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' }

/** Mana abilities: "Add" up to the end of the sentence. */
const ADD_RE = /\bAdd\b[^.]*/g
/** Mana of any color, chosen or within the commander's colors. */
const ANY_COLOR_RE = /\bAdd\b[^.]*\b(?:any color|any one color|mana of any type|the chosen color|that color)\b/i
/** A land search: up to where the land goes. */
const SEARCH_RE = /\bsearch your library for (?:an?|up to \w+) ([^.]*?) cards?\b/i

/**
 * @param land - A land's type line and rules text.
 * @returns Colors the land makes, or finds by searching for a land (fetch lands).
 */
export function landColors(land: { typeLine: string; text: string }): Set<string> {
  const colors = new Set<string>()
  const subtypes = land.typeLine.split(' // ')[0].split(' — ')[1]?.split(/\s+/) ?? []
  for (const type of subtypes) if (TYPE_COLORS[type]) colors.add(TYPE_COLORS[type])
  const text = land.text.replace(/\([^()]*\)/g, (reminder) => (/\{T\}: Add/.test(reminder) ? reminder : ''))
  if (ANY_COLOR_RE.test(text)) return new Set(COLORS)
  for (const ability of text.match(ADD_RE) ?? []) {
    for (const color of COLORS) if (ability.includes(`{${color}}`)) colors.add(color)
  }
  const search = SEARCH_RE.exec(text)?.[1] ?? ''
  if (/\bbasic land\b/i.test(search)) return new Set(COLORS)
  for (const [type, color] of Object.entries(TYPE_COLORS)) if (new RegExp(`\\b${type}\\b`).test(search)) colors.add(color)
  return colors
}

/**
 * Colored mana symbols in a mana cost: hybrid symbols count half for each color; Phyrexian and
 * `{2/R}` symbols count fully.
 * @returns Symbols per color letter; colors without symbols are absent.
 */
export function colorPips(manaCost: string): Record<string, number> {
  const pips: Record<string, number> = {}
  for (const symbol of manaCost.match(/\{[^}]+\}/g) ?? []) {
    const colors = COLORS.filter((color) => symbol.includes(color))
    for (const color of colors) pips[color] = (pips[color] ?? 0) + 1 / colors.length
  }
  return pips
}

/** Share of all colored symbols each counted land type adds to its color's weight. */
const COUNTED_TYPE_SHARE = 0.75

/**
 * Splits basic lands between the deck's colors: by the colored symbols of its spells, with an
 * extra share for land types a key card counts (Valakut counting Mountains). Each color gets at
 * least one while there are enough lands.
 * @param identity - The commander's color identity; colorless decks get Wastes.
 * @param pips - Colored symbols of the deck's spells per color, from {@link colorPips}.
 * @param counted - How strongly key cards count each basic land type, 0 to 1, by color.
 * @returns Basic lands with their copies, most first; none with no lands to split.
 */
export function basicSplit(
  count: number,
  identity: string[],
  pips: Record<string, number>,
  counted: Record<string, number> = {}
): Array<{ name: string; qty: number }> {
  const colors = COLORS.filter((color) => identity.includes(color))
  if (count <= 0) return []
  if (colors.length === 0) return [{ name: BASIC_LANDS.C, qty: count }]
  const totalPips = colors.reduce((sum, color) => sum + (pips[color] ?? 0), 0)
  const weights = colors.map((color) => 1 + (pips[color] ?? 0) + (counted[color] ?? 0) * totalPips * COUNTED_TYPE_SHARE)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  const floor = count >= colors.length ? 1 : 0
  const spare = count - floor * colors.length
  const exact = weights.map((weight) => (spare * weight) / totalWeight)
  const qty = exact.map((share) => floor + Math.floor(share))
  // Largest remainders get the lands rounding left over.
  const order = exact.map((share, i) => [share - Math.floor(share), i] as const).sort((a, b) => b[0] - a[0])
  for (let left = count - qty.reduce((sum, n) => sum + n, 0), k = 0; left > 0; left--, k++) qty[order[k % order.length][1]]++
  return colors
    .map((color, i) => ({ name: BASIC_LANDS[color], qty: qty[i] }))
    .filter((basic) => basic.qty > 0)
    .sort((a, b) => b.qty - a.qty)
}
