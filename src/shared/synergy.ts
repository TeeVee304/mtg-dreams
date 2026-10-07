import { MECHANICS, type CardProfile, type MechanicId, type Signal } from './mechanics'

/**
 * Connects cards to the cards a deck is built around (its commander and pinned key cards): which
 * candidates feed them or are fed by them, and which turn them off. Ranking counts only these
 * connections, read from rules text, never how popular a card is.
 *
 * @packageDocumentation
 */

/** A card the deck is built around: the commander or a pinned key card. */
export interface FocusCard {
  name: string
  profile: CardProfile
}

/** How a candidate connects to a focus card through one mechanic. */
export interface Link {
  focus: string
  mechanic: MechanicId
  /** `feeds`: the candidate provides what the focus card uses; `fed-by`: the focus card provides what the candidate uses. */
  direction: 'feeds' | 'fed-by'
  /** Strength: the weaker of the two sides, 0 to 1, times 1.5 when it acts on all your lands at once. */
  weight: number
  /** The providing side, with its rules text. */
  provider: Signal
  /** The using side, with its rules text. */
  user: Signal
}

/** A candidate that turns off something a focus card does or needs. */
export interface Conflict {
  focus: string
  mechanic: MechanicId
  weight: number
  /** The candidate's rules text that does it. */
  stopper: Signal
  /** What the focus card does or needs, with its rules text. */
  target: Signal
  /** Whether the focus card uses or provides it. */
  side: 'uses' | 'provides'
}

/** A candidate with its connections to the focus cards. */
export interface Candidate<C> {
  card: C
  profile: CardProfile
  /** Connection strength: see {@link scoreLinks}. */
  score: number
  links: Link[]
  conflicts: Conflict[]
}

/** Card facts needed to rank candidates. */
export interface RankableCard {
  name: string
  colorIdentity: string[]
  legalities: Record<string, string>
}

/** Extra weight of a link whose provider acts on all your lands at once. */
const MASS_FACTOR = 1.5

/** Strength of a provider-user pair. */
const pairWeight = (provider: Signal, user: Signal) => Math.min(provider.weight, user.weight) * (provider.mass ? MASS_FACTOR : 1)

/** @returns Every way the candidate feeds, or is fed by, each focus card. */
export function linksTo(profile: CardProfile, focus: FocusCard[]): Link[] {
  const links: Link[] = []
  for (const target of focus) {
    for (const provider of profile.provides) {
      const user = target.profile.uses.find((s) => s.id === provider.id)
      if (user) links.push({ focus: target.name, mechanic: provider.id, direction: 'feeds', weight: pairWeight(provider, user), provider, user })
    }
    for (const user of profile.uses) {
      const provider = target.profile.provides.find((s) => s.id === user.id)
      if (provider) links.push({ focus: target.name, mechanic: user.id, direction: 'fed-by', weight: pairWeight(provider, user), provider, user })
    }
  }
  return links.sort((a, b) => b.weight - a.weight)
}

/** @returns Everything the candidate turns off that a focus card does or needs. */
export function conflictsWith(profile: CardProfile, focus: FocusCard[]): Conflict[] {
  const conflicts: Conflict[] = []
  for (const target of focus) {
    for (const stopper of profile.stops) {
      const used = target.profile.uses.find((s) => s.id === stopper.id)
      // Only what the focus card does itself; implied effects are covered by their source.
      const provided = target.profile.provides.find((s) => s.id === stopper.id && !s.via)
      const hit = used ?? provided
      if (!hit) continue
      const weight = Math.min(stopper.weight, hit.weight)
      conflicts.push({ focus: target.name, mechanic: stopper.id, weight, stopper, target: hit, side: used ? 'uses' : 'provides' })
    }
  }
  return conflicts.sort((a, b) => b.weight - a.weight)
}

/** @returns What a provided signal does, e.g. "makes you discard, which puts land cards into your graveyard" for an implied one. */
export function providePhrase(signal: Signal): string {
  const own = MECHANICS[signal.id].provide
  return signal.via ? `${MECHANICS[signal.via].provide}, which ${own.replace(/^is /, 'means ')}` : own
}

/**
 * @param card - Candidate name.
 * @returns The link in plain words, e.g. "Crucible of Worlds gives you more lands to play — Flubs,
 * the Fool triggers when you play a land."
 */
export function explainLink(card: string, link: Link): string {
  const [provider, user] = link.direction === 'feeds' ? [card, link.focus] : [link.focus, card]
  return `${provider} ${providePhrase(link.provider)} — ${user} ${MECHANICS[link.user.id].use}.`
}

/**
 * @param card - Candidate name.
 * @returns The conflict in plain words, e.g. "Blood Moon turns off the abilities of nonbasic lands —
 * Valakut, the Molten Pinnacle is a land with a special ability."
 */
export function explainConflict(card: string, conflict: Conflict): string {
  const mechanic = MECHANICS[conflict.mechanic]
  const stop = mechanic.stop ?? `works against ${mechanic.label.toLowerCase()}`
  return `${card} ${stop} — ${conflict.focus} ${conflict.side === 'uses' ? mechanic.use : mechanic.provide}.`
}

/**
 * Connection strength. Per focus card, links count in full, then half, a quarter…, strongest
 * first: one strong link to each of two focus cards beats several weak links to one.
 */
export function scoreLinks(links: Link[]): number {
  const byFocus = new Map<string, number[]>()
  for (const link of links) byFocus.set(link.focus, [...(byFocus.get(link.focus) ?? []), link.weight])
  let score = 0
  for (const weights of byFocus.values()) {
    weights.sort((a, b) => b - a).forEach((weight, i) => (score += weight / 2 ** i))
  }
  return score
}

/** Ranking options. */
export interface RankOptions {
  /** Color identity the deck may use, e.g. `['G', 'R', 'U']`. */
  identity: string[]
  /** Format id whose legality is required, e.g. `commander`. */
  format: string
}

/**
 * Cards that connect to the focus cards, strongest first. Cards outside the color identity, not
 * legal in the format, or focus cards themselves are left out; so are cards without a link.
 */
export function rankCandidates<C extends RankableCard>(
  cards: Iterable<{ card: C; profile: CardProfile }>,
  focus: FocusCard[],
  options: RankOptions
): Array<Candidate<C>> {
  const identity = new Set(options.identity)
  const focusNames = new Set(focus.map((f) => f.name))
  const ranked: Array<Candidate<C>> = []
  for (const { card, profile } of cards) {
    if (focusNames.has(card.name)) continue
    if (card.legalities[options.format] !== 'legal') continue
    if (!card.colorIdentity.every((color) => identity.has(color))) continue
    const links = linksTo(profile, focus)
    if (links.length === 0) continue
    ranked.push({ card, profile, score: scoreLinks(links), links, conflicts: conflictsWith(profile, focus) })
  }
  return ranked.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
}
