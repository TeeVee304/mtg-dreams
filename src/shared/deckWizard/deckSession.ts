import { isBasicLand } from '../cards'
import type { DeckCheck } from './deckCheck'
import { basicPicks, pickReason, type DeckPick } from './deckDraft'
import { nameKey } from '../decklist'
import { isLand, type CandidatePool } from './deckPool'
import { DECK_CARDS, type SlotId } from './deckTemplate'
import type { LibraryCard } from './libraryCard'

/**
 * A built deck, and the rules for changing it: key cards stay, changes swap cards in and out,
 * and basic lands keep it at 99.
 *
 * @packageDocumentation
 */

/** A finished deck. */
export interface BuiltDeck {
  /** The 99, basic lands last. */
  picks: DeckPick[]
  /** How the deck plays and wins, in plain words. */
  summary: string
  /** For the player: the app's notes, such as jobs left short. */
  notes: string[]
  check: DeckCheck
  /** EUR per card name on the brief's price basis; null if unknown. */
  prices: Record<string, number | null>
}

/** @returns EUR per card of a deck, by name. */
export function deckPrices(
  picks: DeckPick[],
  find: (name: string) => { card: LibraryCard } | undefined,
  price: (card: LibraryCard) => number | null
): Record<string, number | null> {
  return Object.fromEntries(picks.map((pick) => {
    const card = find(pick.name)?.card
    return [pick.name, card ? price(card) : null]
  }))
}

/** A card put in a deck: anything but key cards and basic lands. */
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

/**
 * The full 99 from picks: key cards first (with their reason, or the pick's if it lists them),
 * then the picks, then basic lands to fill the rest. Basic lands among the picks are dropped, as
 * the app adds them.
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
    if (anchors.has(key)) problems.push(`${name} is one of your key cards and stays in the deck.`)
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
