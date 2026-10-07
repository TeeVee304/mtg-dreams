import { isBasicLand } from './cards'
import type { DeckCheck } from './deckCheck'
import { basicPicks, pickReason, type DeckPick, type Draft } from './deckDraft'
import { nameKey } from './decklist'
import { isLand, type CandidatePool } from './deckPool'
import { DECK_CARDS, type SlotId } from './deckTemplate'

/**
 * A deck built with Claude, and the rules for turning what Claude hands in into a full 99: key
 * cards and basic lands are added by the app, changes swap cards in and out, and as a last resort
 * the app's own draft fills the gaps Claude couldn't.
 *
 * @packageDocumentation
 */

/** Tokens Claude used, for showing the player what a build cost. */
export interface DeckUsage {
  /** Requests sent. */
  calls: number
  inputTokens: number
  outputTokens: number
  /** Input tokens read from the prompt cache, at a fraction of the price. */
  cacheReadTokens: number
  /** Input tokens written to the prompt cache. */
  cacheWriteTokens: number
}

/** A finished deck. */
export interface BuiltDeck {
  /** The 99, basic lands last. */
  picks: DeckPick[]
  /** How the deck plays and wins, in plain words. */
  summary: string
  /** For the player: Claude's notes (warnings it kept, answers) and the app's (cards it replaced). */
  notes: string[]
  check: DeckCheck
  usage: DeckUsage
}

/** What a build is doing, in plain words. */
export interface DeckProgress {
  step: 'preparing' | 'choosing' | 'searching' | 'checking' | 'fixing'
  message: string
}

/** A card handed in by Claude: everything but key cards and basic lands. */
export interface SubmittedPick {
  name: string
  slot: SlotId
  reason: string
}

/** Most cards in a deck sent to change, counting basic land lines once. */
const MAX_DECK_LINES = 150

/**
 * Checks a deck from the renderer before changing it.
 * @throws Error if it isn't a list of cards with their slots and reasons.
 */
export function readDeckSnapshot(raw: unknown): { picks: DeckPick[]; summary: string } {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const picks = input.picks
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
  const valid =
    Array.isArray(picks) &&
    picks.length <= MAX_DECK_LINES &&
    picks.every(
      (p) => text(p?.name, 200) && p.name.trim() && Number.isInteger(p?.qty) && p.qty >= 1 && p.qty <= DECK_CARDS && text(p?.slot, 60) && text(p?.reason, 1000)
    ) &&
    text(input.summary ?? '', 5000)
  if (!valid) throw new Error('Invalid deck.')
  return {
    picks: (picks as DeckPick[]).map(({ name, qty, slot, reason }) => ({ name: name.trim(), qty, slot, reason })),
    summary: (input.summary as string | undefined) ?? ''
  }
}

/** No tokens used yet. */
export const NO_USAGE: DeckUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

/**
 * Cards to pick besides key cards and basic lands: the plan's spells, and its nonbasic lands
 * up to their share, less the key cards that already fill some.
 */
export function plannedPicks(pool: CandidatePool): { spells: number; nonbasicLands: number } {
  const land = pool.template.slots.find((slot) => slot.id === 'land')
  const lands = land?.count ?? 0
  const keyLands = pool.anchors.filter((a) => isLand(a.card)).length
  return {
    spells: DECK_CARDS - lands - (pool.anchors.length - keyLands),
    nonbasicLands: Math.max(0, Math.min(lands, land?.nonbasic ?? 0) - keyLands)
  }
}

/**
 * The full 99 from handed-in picks: key cards first (with their reason, or Claude's if it listed
 * them), then the picks, then basic lands to fill the rest. Basic lands Claude picked are
 * dropped, as the app adds them.
 * @returns The deck, and what's wrong with the picks: a card twice, or more than 99 cards.
 */
export function completeDeck(picks: SubmittedPick[], pool: CandidatePool): { deck: DeckPick[]; problems: string[] } {
  const problems: string[] = []
  const anchors = new Map(pool.anchors.map((a) => [nameKey(a.card.name), a]))
  const deck: DeckPick[] = pool.anchors.map((anchor) => {
    const slot = pool.template.slots.find((s) => s.id === (isLand(anchor.card) ? 'land' : 'theme'))!
    return { name: anchor.card.name, qty: 1, slot: slot.id, reason: `Your key card. ${pickReason(anchor, slot, pool)}` }
  })
  const seen = new Set(anchors.keys())
  for (const pick of picks) {
    const key = nameKey(pick.name)
    if (isBasicLand(pick.name)) continue
    if (anchors.has(key)) {
      const anchor = deck.find((p) => nameKey(p.name) === key)!
      Object.assign(anchor, { slot: pick.slot, reason: `Your key card. ${pick.reason}` })
      continue
    }
    if (seen.has(key)) {
      problems.push(`${pick.name} is picked twice; Commander allows one copy.`)
      continue
    }
    seen.add(key)
    deck.push({ name: pick.name, qty: 1, slot: pick.slot, reason: pick.reason })
  }
  if (deck.length > DECK_CARDS) problems.push(`That's ${deck.length} cards before basic lands; the deck holds ${DECK_CARDS}.`)
  const entryOf = (name: string) => anchors.get(nameKey(name)) ?? pool.eligible.get(nameKey(name))
  const spells = [pool.commander, ...deck.flatMap((pick) => entryOf(pick.name) ?? [])].filter((entry) => !isLand(entry.card))
  return { deck: [...deck, ...basicPicks(DECK_CARDS - deck.length, spells, pool)], problems }
}

/** The picks of a deck besides key cards and basic lands. */
export function handedIn(deck: DeckPick[], pool: CandidatePool): SubmittedPick[] {
  const anchors = new Set(pool.anchors.map((a) => nameKey(a.card.name)))
  return deck.filter((p) => !isBasicLand(p.name) && !anchors.has(nameKey(p.name))).map(({ name, slot, reason }) => ({ name, slot, reason }))
}

/**
 * Takes cards out of a deck and puts others in; basic lands adjust to keep 99.
 * @returns The deck, and what's wrong with the change: removing a card that isn't there or a key
 * card, or adding one that already is.
 */
export function changeDeck(deck: DeckPick[], remove: string[], add: SubmittedPick[], pool: CandidatePool): { deck: DeckPick[]; problems: string[] } {
  const problems: string[] = []
  const anchors = new Set(pool.anchors.map((a) => nameKey(a.card.name)))
  let picks = handedIn(deck, pool)
  for (const name of remove) {
    const key = nameKey(name)
    if (isBasicLand(name)) continue
    if (anchors.has(key)) problems.push(`${name} is one of the player's key cards and stays in the deck.`)
    else if (!picks.some((p) => nameKey(p.name) === key)) problems.push(`${name} isn't in the deck.`)
    else picks = picks.filter((p) => nameKey(p.name) !== key)
  }
  const added = add.filter((pick) => {
    const already = picks.some((p) => nameKey(p.name) === nameKey(pick.name)) || anchors.has(nameKey(pick.name))
    if (already) problems.push(`${pick.name} is already in the deck.`)
    return !already
  })
  const completed = completeDeck([...picks, ...added], pool)
  return { deck: completed.deck, problems: [...problems, ...completed.problems] }
}

/**
 * Repairs a deck Claude couldn't get right: drops the cards with errors and fills their places
 * from the app's own draft, keeping the plan's number of picks.
 * @returns The deck, and the cards dropped and added.
 */
export function repairDeck(
  picks: SubmittedPick[],
  check: DeckCheck,
  draft: Draft,
  pool: CandidatePool
): { deck: DeckPick[]; dropped: string[]; added: string[] } {
  const bad = new Set(check.issues.filter((i) => i.severity === 'error' && i.card).map((i) => nameKey(i.card!)))
  const seen = new Set<string>()
  const kept = picks.filter((p) => {
    const key = nameKey(p.name)
    if (bad.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const { spells, nonbasicLands } = plannedPicks(pool)
  const added: string[] = []
  const fill = handedIn(draft.picks, pool).filter((p) => !seen.has(nameKey(p.name)) && !bad.has(nameKey(p.name)))
  for (const pick of fill) {
    if (kept.length >= spells + nonbasicLands) break
    kept.push(pick)
    added.push(pick.name)
  }
  return { deck: completeDeck(kept, pool).deck, dropped: picks.filter((p) => bad.has(nameKey(p.name))).map((p) => p.name), added }
}
