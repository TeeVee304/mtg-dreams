import { COLOR_NAMES, type ColorFilter } from './cards'

/**
 * Featured tokens: tokens, emblems and game helpers (The Monarch, The Initiative, dungeons) that a
 * list's cards create, from Scryfall's `all_parts` links.
 *
 * @packageDocumentation
 */

/** Part category: creature or noncreature token, emblem, or game helper card. */
export type TokenKind = 'token' | 'emblem' | 'helper'

/** Token card data (front face for double-faced tokens). */
export interface TokenInfo {
  /** Scryfall id. */
  id: string
  name: string
  typeLine: string
  power?: string
  toughness?: string
  /** Color letters, WUBRG order; empty for colorless. */
  colors: string[]
  /** Rules text. */
  text: string
  imageSmall: string | null
  imageNormal: string | null
  /** Back face image of a double-faced token; null otherwise. */
  imageBack: string | null
}

/** Link from a card to a part it creates. */
export interface TokenRef {
  id: string
  kind: TokenKind
}

/** Token data of a list. */
export interface DeckTokenData {
  /** Parts created per card name, as requested. */
  makers: Record<string, TokenRef[]>
  /** Token cards by id. */
  tokens: Record<string, TokenInfo>
  /** False if Scryfall was unreachable and nothing was cached. */
  available: boolean
}

/** One distinct token of a list and the cards that create it. */
export interface FeaturedToken {
  /** Identity key: reprints of the same token share it. */
  key: string
  kind: TokenKind
  /** Representative printing. */
  token: TokenInfo
  /** Creating card names, sorted. */
  makers: string[]
}

/** Display order of kinds. */
const KIND_ORDER: TokenKind[] = ['token', 'emblem', 'helper']

/**
 * Classifies a Scryfall `all_parts` entry. Tokens are `token` parts; emblems and helper cards come
 * as `combo_piece` parts typed `Emblem …`, `Card` or `Dungeon`.
 * @returns Kind; null for parts that are not created objects (the card itself, meld parts).
 */
export function partKind(component: string, typeLine: string): TokenKind | null {
  if (/^Emblem\b/.test(typeLine)) return 'emblem'
  if (component === 'token') return 'token'
  if (component === 'combo_piece' && (typeLine === 'Card' || /^Dungeon\b/.test(typeLine))) return 'helper'
  return null
}

/** @returns Identity key: name, type, power/toughness, colors and rules text. */
const identity = (token: TokenInfo) =>
  [token.name, token.typeLine, token.power ?? '', token.toughness ?? '', token.colors.join(''), token.text].join('|')

/** Creature tokens first, then other tokens. */
const isCreature = (token: TokenInfo) => /\bCreature\b/.test(token.typeLine)

/**
 * Groups a list's created parts into distinct tokens, merging reprints.
 * @param names - Card names of the list (main deck).
 * @returns Tokens ordered by kind (creature tokens first), then name.
 */
export function featuredTokens(data: DeckTokenData, names: string[]): FeaturedToken[] {
  const found = new Map<string, FeaturedToken>()
  for (const name of new Set(names)) {
    for (const ref of data.makers[name] ?? []) {
      const token = data.tokens[ref.id]
      if (!token) continue
      const key = `${ref.kind}|${identity(token)}`
      const entry = found.get(key) ?? { key, kind: ref.kind, token, makers: [] }
      if (!entry.makers.includes(name)) entry.makers.push(name)
      found.set(key, entry)
    }
  }
  return [...found.values()]
    .map((entry) => ({ ...entry, makers: entry.makers.sort((a, b) => a.localeCompare(b)) }))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        Number(isCreature(b.token)) - Number(isCreature(a.token)) ||
        a.token.name.localeCompare(b.token.name)
    )
}

/** @returns Short description, e.g. `1/1 white Soldier`, `Treasure`, `Elspeth emblem`. */
export function tokenLabel({ kind, token }: Pick<FeaturedToken, 'kind' | 'token'>): string {
  if (kind === 'emblem') return `${token.name.replace(/\s*Emblem$/i, '')} emblem`
  if (kind === 'helper' || !isCreature(token)) return token.name
  const colors = token.colors.map((c) => COLOR_NAMES[c as ColorFilter]?.toLowerCase()).filter(Boolean)
  const stats = token.power !== undefined && token.toughness !== undefined ? `${token.power}/${token.toughness} ` : ''
  return `${stats}${colors.length > 0 ? `${colors.join(' and ')} ` : 'colorless '}${token.name}`
}
