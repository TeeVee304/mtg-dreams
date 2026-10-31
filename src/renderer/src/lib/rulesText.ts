/**
 * Rules text as the card dialog draws it: symbols in braces (`{T}`, `{W/U}`) apart from the words,
 * reminder text in parentheses marked, and card types read from a type line.
 *
 * @packageDocumentation
 */

/** A run of rules text: words, or one symbol (`W/U` for `{W/U}`); `reminder` inside parentheses. */
export interface RulesPiece {
  kind: 'text' | 'symbol'
  value: string
  reminder?: true
}

/** A symbol in braces. */
const SYMBOL_RE = /\{([^{}]+)\}/g

/** @returns A line of text split into words and symbols. */
export function piecesOf(text: string, reminder = false): RulesPiece[] {
  const pieces: RulesPiece[] = []
  let at = 0
  for (const match of text.matchAll(SYMBOL_RE)) {
    if (match.index > at) pieces.push({ kind: 'text', value: text.slice(at, match.index), ...(reminder && { reminder: true as const }) })
    pieces.push({ kind: 'symbol', value: match[1], ...(reminder && { reminder: true as const }) })
    at = match.index + match[0].length
  }
  if (at < text.length) pieces.push({ kind: 'text', value: text.slice(at), ...(reminder && { reminder: true as const }) })
  return pieces
}

/** @returns Rules text as paragraphs (one per line), each split into words and symbols, reminder text marked. */
export function rulesParagraphs(text: string): RulesPiece[][] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.split(/(\([^()]*\))/).flatMap((part, i) => (part ? piecesOf(part, i % 2 === 1) : [])))
}

/** Card types with an icon, in the order a type line lists them. */
export const ICON_TYPES = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'instant', 'sorcery'] as const

/** A card type with an icon. */
export type IconType = (typeof ICON_TYPES)[number]

/** @returns The card types with an icon on a type line, before its subtypes (`Artifact Creature — Golem`: artifact, creature). */
export function iconTypesOf(typeLine: string): IconType[] {
  const words = typeLine.split('—')[0].toLowerCase().split(/\s+/)
  return words.filter((word): word is IconType => (ICON_TYPES as readonly string[]).includes(word))
}
