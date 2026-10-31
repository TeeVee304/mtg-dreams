import { COLOR_NAMES, type ColorFilter } from './cards'
import { listHeader } from './decklist'
import type { ListLine } from './types'
import { ui } from './text'

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
  /** Scryfall oracle id, shared by all Versions of the token. */
  oracleId?: string
  /** Lower-case set code, e.g. `tltr`. */
  set?: string
  setName?: string
  collector?: string
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
  /** The Version the cards link to: shown unless the list chose another. */
  linked: TokenInfo
  /** `token` is the Version the list chose ({@link tokenVersions}), not the one the cards link to. */
  chosen?: true
}

/** Display order of kinds. */
const KIND_ORDER: TokenKind[] = ['token', 'emblem', 'helper']

/**
 * Classifies a Scryfall `all_parts` entry. Tokens are `token` parts; emblems and helper cards come
 * as `combo_piece` parts typed `Emblem …`, `Card` or `Dungeon`, and the face-down helpers (`A
 * Mysterious Creature` for Disguise and Cloak, `Morph`, `Manifest`) as ones typed just `Creature`.
 * @returns Kind; null for parts that are not created objects (the card itself, meld parts).
 */
export function partKind(component: string, typeLine: string): TokenKind | null {
  if (/^Emblem\b/.test(typeLine)) return 'emblem'
  if (component === 'token') return 'token'
  const helper = typeLine === 'Card' || typeLine === 'Creature' || /^Dungeon\b/.test(typeLine)
  if (component === 'combo_piece' && helper) return 'helper'
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
 * @param chosen - The Versions the list chose, by oracle id ({@link tokenVersions}); shown when loaded.
 * @returns Tokens ordered by kind (creature tokens first), then name.
 */
export function featuredTokens(data: DeckTokenData, names: string[], chosen: Map<string, string> = new Map()): FeaturedToken[] {
  const found = new Map<string, FeaturedToken>()
  for (const name of new Set(names)) {
    for (const ref of data.makers[name] ?? []) {
      const token = data.tokens[ref.id]
      if (!token) continue
      const key = `${ref.kind}|${identity(token)}`
      const entry = found.get(key) ?? { key, kind: ref.kind, token, linked: token, makers: [] }
      if (!entry.makers.includes(name)) entry.makers.push(name)
      found.set(key, entry)
    }
  }
  return [...found.values()]
    .map((entry) => {
      const pick = entry.token.oracleId && data.tokens[chosen.get(entry.token.oracleId) ?? '']
      return { ...entry, makers: entry.makers.sort((a, b) => a.localeCompare(b)), ...(pick && { token: pick, chosen: true as const }) }
    })
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        Number(isCreature(b.token)) - Number(isCreature(a.token)) ||
        a.token.name.localeCompare(b.token.name)
    )
}

/** @returns The token's name, as a list shows it: `Soldier`, `Treasure`, `Elspeth emblem`. */
export function tokenName({ kind, token }: Pick<FeaturedToken, 'kind' | 'token'>): string {
  return kind === 'emblem' ? ui.deckTokens.emblem(token.name.replace(/\s*Emblem$/i, '')) : token.name
}

/** @returns The token's title, its colors aside: `1/1 Soldier Token`, `Treasure Token`, `Elspeth emblem`, `The Monarch`. */
export function tokenTitle({ kind, token }: Pick<FeaturedToken, 'kind' | 'token'>): string {
  if (kind !== 'token') return tokenName({ kind, token })
  const stats = isCreature(token) && token.power !== undefined && token.toughness !== undefined ? `${token.power}/${token.toughness}` : null
  return ui.deckTokens.tokenTitle(stats, token.name)
}

/** @returns Short description, e.g. `1/1 white Soldier`, `Treasure`, `Elspeth emblem`. */
export function tokenLabel({ kind, token }: Pick<FeaturedToken, 'kind' | 'token'>): string {
  if (kind === 'emblem') return ui.deckTokens.emblem(token.name.replace(/\s*Emblem$/i, ''))
  if (kind === 'helper' || !isCreature(token)) return token.name
  const colors = token.colors.map((c) => COLOR_NAMES[c as ColorFilter]?.toLowerCase()).filter(Boolean)
  const stats = token.power !== undefined && token.toughness !== undefined ? `${token.power}/${token.toughness}` : null
  return ui.deckTokens.creature(stats, colors, token.name)
}

/** A list's chosen token Versions: `// Token Versions: <oracle id>=<token id> …`, kept in `lists.json`. */
const TOKEN_VERSIONS = listHeader('Token Versions', 'token\\s+versions')

/** @returns The token Versions a list chose: Scryfall token ids by oracle id. */
export function tokenVersions(lines: ListLine[]): Map<string, string> {
  const pairs = (TOKEN_VERSIONS.read(lines) ?? '').split(/\s+/).map((pair) => pair.split('='))
  return new Map(pairs.filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1]))
}

/** Chooses a token's Version, or goes back to the one its cards link to (`null`). */
export function withTokenVersion(lines: ListLine[], oracleId: string, id: string | null): ListLine[] {
  const chosen = tokenVersions(lines)
  if (id) chosen.set(oracleId, id)
  else chosen.delete(oracleId)
  return TOKEN_VERSIONS.write(lines, [...chosen].map(([oracle, token]) => `${oracle}=${token}`).join(' ') || null)
}

/** @returns Whether a token Version comes from one of `sets`: its set, or a token set named after one (`tltr` for `ltr`). */
export const tokenInSets = (token: TokenInfo, sets: string[]) =>
  !!token.set && (sets.includes(token.set) || (token.set.startsWith('t') && sets.includes(token.set.slice(1))))
