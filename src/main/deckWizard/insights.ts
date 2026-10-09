import { isBasicLand } from '@shared/cards'
import type { DeckSnapshot } from '@shared/deckWizard/api'
import { deckIdeas, type DeckIdea } from '@shared/deckWizard/deckIdeas'
import { deckReport, stapleReport, type DeckReport } from '@shared/deckWizard/deckReport'
import { bracketFacts, findCombos } from './combos'
import { known } from './focus'
import { cachedPlan, strongest } from './planning'

/**
 * What the wizard tells the player around the build: deck ideas before it, and the report on the
 * deck after.
 *
 * @packageDocumentation
 */

/**
 * Deck ideas for the brief's commander and key cards, within its bracket and budget. From
 * Bracket 3 up, Commander Spellbook's combos with the commander or a key card can lead; without a
 * connection the ideas come from rules text alone.
 * @throws Error in plain words as `planDeck`.
 */
export async function deckIdeasFor(raw: unknown): Promise<DeckIdea[]> {
  const { brief, pool, context } = await cachedPlan(raw)
  let combos: Awaited<ReturnType<typeof findCombos>> = null
  if (brief.bracket >= 3) {
    // The strongest cards the deck may play: combos worth building around are among them.
    combos = await findCombos([brief.commander, ...brief.anchors], strongest(pool))
  }
  return deckIdeas(context.focus, pool, combos?.included ?? [])
}

/**
 * The report for a built deck: curve, color odds, jobs, power level, staples and solo games.
 * Commander Spellbook adds Game Changers, combos and its own estimate when it can be reached.
 * @throws Error in plain words as `planDeck`.
 */
export async function deckReportFor(raw: unknown, deck: DeckSnapshot): Promise<DeckReport> {
  const { brief, template, pool, context } = await cachedPlan(raw)
  const commander = known(brief.commander)!
  const cards = deck.picks.flatMap((pick) => {
    const card = known(pick.name)
    return card ? [{ ...card, qty: pick.qty }] : []
  })
  const names = cards.filter((c) => !isBasicLand(c.card.name)).map((c) => c.card.name)
  const [facts, combos] = await Promise.all([bracketFacts([commander.card.name], names), findCombos([commander.card.name], names)])
  const staples = stapleReport(pool, deck.picks.map((pick) => pick.name), known, context.price)
  return deckReport(cards, commander, template, brief.bracket, { facts, combos: combos?.included ?? [] }, staples)
}
