import type { DeckPlanSummary } from '@shared/deckWizard/api'
import { cardStrength } from '@shared/deckWizard/cardStrength'
import { commandersKey, communityStats, readDecks, type CommunityStats, type ReadDeck } from '@shared/deckWizard/community'
import { normalizeBrief, type DeckBrief } from '@shared/deckWizard/deckBrief'
import { checkDeck, type CheckContext, type DeckCheck } from '@shared/deckWizard/deckCheck'
import { draftDeck, type Draft } from '@shared/deckWizard/deckDraft'
import { optimizeDeck } from '@shared/deckWizard/deckOptimizer'
import { buildPool, isLand, type CandidatePool } from '@shared/deckWizard/deckPool'
import { deckTemplate, type DeckTemplate } from '@shared/deckWizard/deckTemplate'
import type { LibraryCard } from '@shared/deckWizard/libraryCard'
import { promiseCache } from '@shared/promiseCache'
import { priceGuideDate } from '../priceGuide'
import { cardLibraryStatus, cheapestPrice, libraryCard, libraryProfiles } from './cardLibrary'
import { MAX_SPELLBOOK_CARDS } from './combos'
import { communityDecks } from './community'
import { deckFocus, known, type KnownCard } from './focus'
import { ensurePrices } from './status'

/**
 * Planning a deck from a brief: the jobs of the 99, the cards that may fill each, what the
 * official precons play, and a first draft. Plans are cached: the last few, and any being made,
 * so asking twice at once plans once.
 *
 * @packageDocumentation
 */

/** Everything built from a brief. */
export interface DeckPlan {
  brief: DeckBrief
  template: DeckTemplate
  pool: CandidatePool
  draft: Draft
  check: DeckCheck
  /** For checking any 99 against the brief: only cards the deck may play count as offered. */
  context: CheckContext
}

/** Precons read for statistics, for the card library and decks they were read with. */
let readPrecons: { key: string; decks: ReadDeck[]; lookup: (name: string) => KnownCard | undefined } | null = null

/** @returns The precons loaded so far, read for statistics, and a fast card lookup; null before any are loaded. */
async function precons(): Promise<Omit<NonNullable<typeof readPrecons>, 'key'> | null> {
  const decks = communityDecks()
  const status = cardLibraryStatus()
  if (!decks?.length || status.state !== 'ready') return null
  const key = `${status.updatedAt}|${decks.length}`
  if (readPrecons?.key !== key) {
    const profiles = new Map((await libraryProfiles()).map(({ card, profile }) => [card, profile]))
    const lookup = (name: string) => {
      const card = libraryCard(name)
      const profile = card && profiles.get(card)
      return card && profile ? { card, profile } : undefined
    }
    readPrecons = { key, decks: readDecks(decks, lookup), lookup }
  }
  return readPrecons
}

/** Options of {@link planDeck}, for benchmarks. */
export interface PlanOptions {
  /** Plan without the precons' statistics. */
  noCommunity?: boolean
  /** Leaves a precon out of the statistics, by id, with any other led by its commanders: a deck can't learn from itself. */
  leaveOut?: string
}

/** What the precons play, for a brief's commander and themes; null without them. */
async function communityFor(brief: DeckBrief, commander: LibraryCard, options: PlanOptions): Promise<CommunityStats | null> {
  if (options.noCommunity) return null
  const read = await precons()
  const left = communityDecks()?.find((deck) => deck.id === options.leaveOut)
  const decks = read?.decks.filter((deck) => !left || commandersKey(deck.deck) !== commandersKey(left))
  if (!read || !decks?.length) return null
  return communityStats(decks, commander.name, commander.colorIdentity, brief.engines, read.lookup)
}

/**
 * Builds a deck's plan from a brief: the plan, the cards to choose from per slot, a first draft
 * by code alone, and its check.
 * @param raw - Brief from the renderer; checked with {@link normalizeBrief}.
 * @throws Error in plain words for a missing or invalid commander or key card, or when the card
 * library or prices can't be downloaded.
 */
export async function planDeck(raw: unknown, options: PlanOptions = {}): Promise<DeckPlan> {
  const brief = normalizeBrief(raw)
  if (!brief) throw new Error('Choose a commander first.')
  const [focusCards] = await Promise.all([deckFocus(brief), ensurePrices()])
  const commander = focusCards[0].card
  const focus = focusCards.map(({ card, profile }) => ({ name: card.name, profile }))
  const template = deckTemplate(brief, focus, commander.colorIdentity)
  const price = (card: LibraryCard) => cheapestPrice(card, brief.budget.basis)
  const community = await communityFor(brief, commander, options)
  const pool = buildPool({ brief, template, focus: focusCards, library: await libraryProfiles(), price, community })
  const draft = optimizeDeck(pool, draftDeck(pool))
  const context: CheckContext = { brief, template, commander, focus, lookup: known, price, offered: new Set(pool.eligible.keys()) }
  return { brief, template, pool, draft, check: checkDeck(draft.picks, context), context }
}

/** Plans made or being made, by {@link planKey}: switching between a few briefs, or commanders, doesn't plan again. */
const plans = promiseCache<DeckPlan>(3)

/** Identifies a brief with the card data it's planned on. */
function planKey(raw: unknown): string {
  const status = cardLibraryStatus()
  return JSON.stringify([normalizeBrief(raw), status.state === 'ready' ? status.updatedAt : null, priceGuideDate(), communityDecks()?.length ?? 0])
}

/** @returns {@link planDeck}, shared with any request for the same brief and data, made or being made. */
export function cachedPlan(raw: unknown): Promise<DeckPlan> {
  return plans.get(planKey(raw), () => planDeck(raw))
}

/** @returns The plan for a brief, with its draft, for the wizard to show. */
export async function deckPlanSummary(raw: unknown): Promise<DeckPlanSummary> {
  const { brief, template, pool, draft, check } = await cachedPlan(raw)
  return { brief, template, draft, check, eligible: pool.eligible.size, excluded: pool.excluded }
}

/** Names of the strongest nonland cards the deck may play, as many as Commander Spellbook takes. */
export function strongest(pool: CandidatePool): string[] {
  return [...pool.eligible.values()]
    .filter((entry) => !isLand(entry.card))
    .sort((a, b) => cardStrength(b.card) - cardStrength(a.card) || a.card.name.localeCompare(b.card.name))
    .slice(0, MAX_SPELLBOOK_CARDS)
    .map((entry) => entry.card.name)
}
