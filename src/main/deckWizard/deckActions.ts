import type { DeckEdit, DeckSnapshot } from '@shared/deckWizard/api'
import { checkDeck } from '@shared/deckWizard/deckCheck'
import { draftDeck, draftNotes, draftSummary, nextBest } from '@shared/deckWizard/deckDraft'
import { optimizeDeck } from '@shared/deckWizard/deckOptimizer'
import { slotScore } from '@shared/deckWizard/deckPool'
import { changeDeck, deckPrices, type BuiltDeck, type SubmittedPick } from '@shared/deckWizard/deckSession'
import { nameKey } from '@shared/decklist'
import { libraryCard } from './cardLibrary'
import { bracketFacts } from './combos'
import { known } from './focus'
import { cachedPlan, strongest } from './planning'

/**
 * Building a deck from its plan, and changing it as the player asks: swapping a card for the next
 * best, taking cards out, putting the player's own picks in.
 *
 * @packageDocumentation
 */

/** @returns The deck for a brief. */
export async function draftedDeck(raw: unknown): Promise<BuiltDeck> {
  const plan = await cachedPlan(raw)
  const { pool, context } = plan
  let { draft, check } = plan
  // Commander Spellbook knows combos the rules text doesn't show; the brackets below 4 limit them.
  if (pool.brief.bracket < 4) {
    const facts = await bracketFacts([pool.brief.commander, ...pool.brief.anchors], strongest(pool))
    if (facts && facts.combos.length > 0) {
      draft = optimizeDeck(pool, draftDeck(pool), { facts })
      check = checkDeck(draft.picks, context)
    }
  }
  return {
    picks: draft.picks,
    summary: draftSummary(pool),
    notes: draftNotes(draft),
    check,
    prices: deckPrices(draft.picks, known, context.price)
  }
}

/**
 * Swaps a card for the next-best one for its job, keeping within the budget.
 * @param skip - Cards swapped out before, so swapping again doesn't bring them back.
 * @throws Error in plain words when the card isn't in the deck or nothing else fits.
 */
export async function swapDeckCard(raw: unknown, deck: DeckSnapshot, name: string, skip: string[]): Promise<DeckEdit> {
  const { pool, context } = await cachedPlan(raw)
  const pick = deck.picks.find((p) => nameKey(p.name) === nameKey(name))
  if (!pick) throw new Error(`${name} isn't in the deck.`)
  const { total } = pool.brief.budget
  const price = (n: string) => {
    const card = libraryCard(n)
    return card ? (context.price(card) ?? 0) : 0
  }
  const spent = deck.picks.reduce((sum, p) => sum + price(p.name) * p.qty, price(pool.brief.commander))
  const maxPrice = total === null ? null : Math.max(price(pick.name), total - spent + price(pick.name))
  const next = nextBest(pool, pick, deck.picks.map((p) => p.name), skip, maxPrice)
  if (!next) throw new Error(`No other card for this job fits your budget.`)
  const changed = changeDeck(deck.picks, [pick.name], [{ name: next.name, slot: next.slot, reason: next.reason }], pool)
  if (changed.problems.length > 0) throw new Error(changed.problems.join(' '))
  return { picks: changed.deck, check: checkDeck(changed.deck, context), prices: deckPrices(changed.deck, known, context.price) }
}

/**
 * Changes a deck as the player asks: takes cards out, and puts the player's own picks in, each in the
 * first slot of the plan it fits. Basic lands keep the deck at 99.
 * @throws Error in plain words when a card can't be removed or added.
 */
export async function editDeck(raw: unknown, deck: DeckSnapshot, remove: string[], add: string[]): Promise<DeckEdit> {
  const { pool, context } = await cachedPlan(raw)
  const added = add.map((name): SubmittedPick => {
    const entry = pool.eligible.get(nameKey(libraryCard(name)?.name ?? name))
    if (!entry) throw new Error(`${name} can't be added to this deck.`)
    const slot = pool.template.slots.find((s) => s.id !== 'wildcard' && slotScore(s, entry, pool) !== null) ?? pool.template.slots.find((s) => s.id === 'theme')!
    return { name: entry.card.name, slot: slot.id, reason: 'Added by you.' }
  })
  const changed = changeDeck(deck.picks, remove, added, pool)
  if (changed.problems.length > 0) throw new Error(changed.problems.join(' '))
  return { picks: changed.deck, check: checkDeck(changed.deck, context), prices: deckPrices(changed.deck, known, context.price) }
}
