import { parseList, serializeList } from '../decklist'
import { withCommanders, withFormat } from '../formats'
import { ui } from '../text'

/**
 * EDHREC's average decks: for a commander (or two partners), the cards most of its decks on EDHREC
 * play, optionally narrowed to a theme (`infect`), a power bracket (`core`) and a budget (`budget`). EDHREC serves
 * them as JSON at `json.edhrec.com/pages/average-decks/<commanders>[/<bracket>][/<theme>][/<budget>].json`;
 * a mix with too few decks has none (403).
 *
 * @packageDocumentation
 */

/** EDHREC's JSON pages. */
export const EDHREC_JSON = 'https://json.edhrec.com/pages/average-decks'
/** EDHREC's site, for "Open on EDHREC". */
export const EDHREC_SITE = 'https://edhrec.com/average-decks'

/** Power brackets, 1 to 5, by EDHREC's path name and the bracket's own name. */
export const BRACKETS = [
  { id: 'exhibition', label: 'Exhibition' },
  { id: 'core', label: 'Core' },
  { id: 'upgraded', label: 'Upgraded' },
  { id: 'optimized', label: 'Optimized' },
  { id: 'cedh', label: 'cEDH' }
] as const

/** A power bracket, by EDHREC's path name. */
export type Bracket = (typeof BRACKETS)[number]['id']

/** Budget of an average deck: its cheaper or pricier decks. */
export type Budget = 'budget' | 'expensive'

/** Which average deck of a commander: null filters take every deck. */
export interface AverageDeckFilters {
  /** Theme slug, e.g. `infect`. */
  theme: string | null
  bracket: Bracket | null
  budget: Budget | null
}

/** No filter: the commander's average deck over all its decks. */
export const NO_FILTERS: AverageDeckFilters = { theme: null, bracket: null, budget: null }

/** A theme EDHREC has decks for. */
export interface DeckTheme {
  slug: string
  name: string
  /** Decks with the theme. */
  decks: number
}

/** A card of an average deck. */
export interface AverageCard {
  name: string
  qty: number
  /** EDHREC's card type: `Creature`, `Land`… */
  type: string
}

/** A commander's average deck. */
export interface AverageDeck {
  /** The commander, or two partners. */
  commanders: string[]
  /** The other cards, by type. */
  cards: AverageCard[]
  /** Decks averaged. */
  decks: number
  /** The commander's themes, most decks first. */
  themes: DeckTheme[]
}

/** What EDHREC answered: the deck, or none for this commander and mix. */
export type AverageDeckResult = { status: 'ok'; deck: AverageDeck } | { status: 'missing' }

/**
 * @returns A commander's EDHREC slug: `Atraxa, Praetors' Voice` → `atraxa-praetors-voice`. A
 * double-faced card goes by its front face.
 */
export function commanderSlug(name: string): string {
  return name
    .split('//')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * @param commanders - The commander, or two partners: EDHREC names a pair by both slugs, in
 * alphabetical order (`kraum-ludevics-opus-tymna-the-weaver`).
 * @returns The path of an average deck under {@link EDHREC_JSON} or {@link EDHREC_SITE}, without extension.
 */
export function averageDeckPath(commanders: string[], { theme, bracket, budget }: AverageDeckFilters): string {
  const slug = commanders.map(commanderSlug).filter(Boolean).sort().join('-')
  return slug ? [slug, bracket, theme, budget].filter(Boolean).join('/') : ''
}

/** @returns Whether `value` is valid filters, as sent by the renderer. */
export function isFilters(value: unknown): value is AverageDeckFilters {
  if (typeof value !== 'object' || value === null) return false
  const { theme, bracket, budget } = value as Record<string, unknown>
  return (
    (theme === null || (typeof theme === 'string' && /^[a-z0-9-]{1,80}$/.test(theme))) &&
    (bracket === null || BRACKETS.some((option) => option.id === bracket)) &&
    (budget === null || budget === 'budget' || budget === 'expensive')
  )
}

/** @returns Sum of a count map's values, as EDHREC sends them; 0 if it isn't one. */
function total(counts: unknown): number {
  if (typeof counts !== 'object' || counts === null) return 0
  return Object.values(counts).reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
}

/**
 * Reads an average deck page.
 * @param filters - The mix asked for: the decks averaged are counted within it.
 * @throws Error if the page has no deck.
 */
export function parseAverageDeck(json: unknown, filters: AverageDeckFilters): AverageDeck {
  const page = (json ?? {}) as {
    deck?: { commander?: unknown; commander_v2?: unknown; cards?: unknown }
    tag_counts?: unknown
    budget_counts?: Record<string, unknown>
    bracket_counts?: Record<string, unknown>
  }
  // `commander_v2` is `[name, copies]` per commander; `commander`, just the names.
  const v2: unknown[] = Array.isArray(page.deck?.commander_v2)
    ? page.deck.commander_v2.map((entry: unknown) => (Array.isArray(entry) ? entry[0] : null))
    : []
  const named: unknown[] = v2.length > 0 ? v2 : Array.isArray(page.deck?.commander) ? page.deck.commander : []
  const commanders = named.filter((name): name is string => typeof name === 'string' && name !== '').slice(0, 2)
  const groups = page.deck?.cards
  if (commanders.length === 0 || typeof groups !== 'object' || groups === null) throw new Error(ui.errors.edhrecNoDeck)
  const cards: AverageCard[] = []
  for (const [type, entries] of Object.entries(groups)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && Number.isSafeInteger(entry[1]) && entry[1] > 0) {
        cards.push({ name: entry[0], qty: entry[1], type })
      }
    }
  }
  const themes: DeckTheme[] = (Array.isArray(page.tag_counts) ? page.tag_counts : [])
    .filter((tag): tag is { slug: string; value: string; count: number } =>
      typeof tag?.slug === 'string' && typeof tag?.value === 'string' && typeof tag?.count === 'number'
    )
    .map((tag) => ({ slug: tag.slug, name: tag.value, decks: tag.count }))
    .sort((a, b) => b.decks - a.decks)
  // Decks in the mix: the fewest of the counts it narrows to.
  const counts = [total(page.budget_counts)]
  if (filters.budget) counts.push(Number(page.budget_counts?.[filters.budget]) || 0)
  if (filters.bracket) counts.push(Number(page.bracket_counts?.[BRACKETS.findIndex((b) => b.id === filters.bracket) + 1]) || 0)
  return { commanders, cards, decks: Math.min(...counts), themes }
}

/** @returns An average deck as list text: Commander format, its commanders, then the other cards. */
export function averageDeckText(deck: AverageDeck): string {
  const leaders = deck.commanders.map((name) => ({ name, qty: 1 }))
  const cards = [...leaders, ...deck.cards].map((card) => `${card.qty} ${card.name}`).join('\n')
  return serializeList(withCommanders(withFormat(parseList(cards), 'commander'), deck.commanders))
}

/**
 * @returns A list name for an average deck: the commanders' short names, then the theme: `Atraxa
 * Infect`, `Tymna & Kraum`.
 */
export function averageDeckName(commanders: string[], theme: string | null): string {
  const short = commanders.map((name) => name.split('//')[0].split(',')[0].trim()).join(' & ')
  return theme ? `${short} ${theme}` : short
}
