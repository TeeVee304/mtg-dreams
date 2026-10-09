import { isBasicLand } from '../cards'
import { nameKey } from '../decklist'
import type { LibraryCard } from './libraryCard'
import { isEngine } from './deckBrief'
import type { CardProfile, MechanicId } from './vocabulary'

/**
 * What decks built by people play, from the official Commander precons: Wizards of the Coast's own
 * decklists, free from MTGJSON. A card's staple rate is the share of precons that could play it
 * (its colors fit) that do; its theme rate is the same among precons built around a theme. Rates
 * are smoothed, so a card in one of two decks doesn't count as a staple. The data source is
 * pluggable: any list of decks with commanders works.
 *
 * @packageDocumentation
 */

/** A deck built by people: its commanders and the rest of its cards, by name. */
export interface CommunityDeck {
  /** Stable id, e.g. the MTGJSON file name. */
  id: string
  name: string
  commanders: string[]
  cards: string[]
}

/** A deck read for statistics. */
export interface ReadDeck {
  deck: CommunityDeck
  /** Colors of its commanders. */
  identity: Set<string>
  /** Mechanics the deck is built around. */
  themes: Set<MechanicId>
  /** Name keys of its cards, commanders included. */
  keys: Set<string>
}

/** How decks built by people use a card. */
export interface CommunityScore {
  /** Smoothed share of decks that could play the card that do, 0 to 1. */
  staple: number
  /** How much more decks on the brief's themes play it than decks overall, 0 to 1. */
  theme: number
  /** The theme whose decks play it most; absent without one. */
  themeId?: MechanicId
  /** The commander's own precon plays it. */
  own: boolean
}

/** The statistics for one deck being built. */
export interface CommunityStats {
  /** Decks the statistics come from. */
  decks: number
  /** The commander's own precon, when it leads one. */
  own: CommunityDeck | null
  /** Themes of the commander's own precon, most played first. */
  ownThemes: MechanicId[]
  /** Scores by card name key; cards no deck plays are absent. */
  scores: Map<string, CommunityScore>
  /** The most played cards for these colors, most played first, with their staple rate. */
  staples: Array<{ name: string; rate: number }>
}

/** Decks added to the count before taking a share, so few decks can't make a staple. */
const SMOOTHING = 3
/** Share of a deck's nonland cards that must carry a mechanic for it to be a theme of the deck. */
const THEME_SHARE = 0.15
/** Most themes per deck. */
const MAX_THEMES = 4
/** Least strength for a card to carry a mechanic. */
const CARRIES = 0.5
/** Least strength for a commander's mechanic to make a theme. */
const COMMANDER_THEME = 0.8
/** Fewest decks on a theme for its rates to count. */
const MIN_THEMED = 2
/** Staples listed for the report. */
const STAPLE_COUNT = 20

/** A card and what it does, from the card library. */
type Known = { card: LibraryCard; profile: CardProfile }

/** Mechanics a card carries strongly enough to count toward a theme. */
function carried(profile: CardProfile, min: number): Set<MechanicId> {
  return new Set([...profile.provides, ...profile.uses].filter((s) => s.weight >= min && !s.via && isEngine(s.id)).map((s) => s.id))
}

/**
 * Reads decks for statistics: their colors, from the commanders, and their themes, from the
 * mechanics the commanders and many of the cards carry. Decks whose commanders are unknown are
 * left out, and so are decks led by the same commanders as one before, such as a collector's
 * edition of a precon, so no list counts twice.
 */
export function readDecks(decks: CommunityDeck[], lookup: (name: string) => Known | undefined): ReadDeck[] {
  const led = new Set<string>()
  return decks.flatMap((deck) => {
    const commanders = deck.commanders.map(lookup)
    if (commanders.length === 0 || commanders.some((c) => !c)) return []
    const leaders = commandersKey(deck)
    if (led.has(leaders)) return []
    led.add(leaders)
    const identity = new Set(commanders.flatMap((c) => c!.card.colorIdentity))
    const counts = new Map<MechanicId, number>()
    let nonland = 0
    for (const name of deck.cards) {
      const known = lookup(name)
      if (!known || /\bLand\b/.test(known.card.typeLine)) continue
      nonland++
      for (const id of carried(known.profile, CARRIES)) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const themes = [...counts]
      .filter(([, count]) => nonland > 0 && count / nonland >= THEME_SHARE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_THEMES)
      .map(([id]) => id)
    for (const commander of commanders) for (const id of carried(commander!.profile, COMMANDER_THEME)) if (!themes.includes(id)) themes.push(id)
    const keys = new Set([...deck.commanders, ...deck.cards].map(nameKey))
    return [{ deck, identity, themes: new Set(themes), keys }]
  })
}

/** Identifies a deck's commanders, in any order. */
export const commandersKey = (deck: CommunityDeck) => deck.commanders.map(nameKey).sort().join('|')

/** Whether a deck of these colors may play the card. */
const fits = (card: LibraryCard, identity: Set<string>) => card.colorIdentity.every((color) => identity.has(color))

/**
 * The statistics for a deck: for every card any deck plays, its staple rate, how much more decks
 * on the brief's themes play it, and whether the commander's own precon plays it.
 * @param themes - The brief's themes; a theme too few decks share is skipped.
 */
export function communityStats(
  decks: ReadDeck[],
  commander: string,
  identity: string[],
  themes: MechanicId[],
  lookup: (name: string) => Known | undefined
): CommunityStats {
  const leader = nameKey(commander)
  const ownDeck = decks.find((d) => d.deck.commanders.some((name) => nameKey(name) === leader)) ?? null
  const deckColors = new Set(identity)
  const counted = new Map<string, Known>()
  for (const read of decks) {
    for (const name of read.deck.cards) {
      const key = nameKey(name)
      if (counted.has(key) || isBasicLand(name)) continue
      const known = lookup(name)
      if (known && fits(known.card, deckColors)) counted.set(key, known)
    }
  }
  const scores = new Map<string, CommunityScore>()
  const staples: CommunityStats['staples'] = []
  for (const [key, { card }] of counted) {
    const could = decks.filter((d) => fits(card, d.identity))
    const playing = could.filter((d) => d.keys.has(key)).length
    const staple = playing / (could.length + SMOOTHING)
    let theme = 0
    let themeId: MechanicId | undefined
    for (const id of themes) {
      const themed = could.filter((d) => d.themes.has(id))
      if (themed.length < MIN_THEMED) continue
      const rate = themed.filter((d) => d.keys.has(key)).length / (themed.length + SMOOTHING)
      if (rate - staple > theme) [theme, themeId] = [rate - staple, id]
    }
    scores.set(key, { staple, theme, ...(themeId && { themeId }), own: ownDeck?.keys.has(key) ?? false })
    staples.push({ name: card.name, rate: staple })
  }
  staples.sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))
  return {
    decks: decks.length,
    own: ownDeck?.deck ?? null,
    ownThemes: ownDeck ? [...ownDeck.themes] : [],
    scores,
    staples: staples.slice(0, STAPLE_COUNT)
  }
}
