import type { DeckHelperStatus, DeckPlanSummary, DeckSnapshot } from '@shared/api'
import { normalizeBrief, routeOptions, type DeckBrief, type RouteOption } from '@shared/deckBrief'
import { checkDeck, type CheckContext, type DeckCheck } from '@shared/deckCheck'
import { draftDeck, type DeckPick, type Draft } from '@shared/deckDraft'
import { buildPool, type CandidatePool } from '@shared/deckPool'
import type { BuiltDeck, DeckProgress } from '@shared/deckSession'
import { deckTemplate, type DeckTemplate } from '@shared/deckTemplate'
import { canLead, commanderRule, findFormat } from '@shared/formats'
import { readCard, type CardProfile } from '@shared/mechanics'
import type { LibraryCard } from '@shared/types'
import { createMessage } from './anthropic'
import { apiKeyStatus, readApiKey } from './apiKey'
import { cardLibraryStatus, cheapestPrice, ensureCardLibrary, libraryCard, libraryProfiles } from './cardLibrary'
import { buildWithClaude, changeWithClaude, type SessionOptions } from './deckBuilder'
import { loadPriceGuide, priceGuideDate, refreshPriceGuide } from './priceGuide'

/**
 * Deckbuilding helper, main-process side: finds a brief's commander and key cards in the card
 * library, builds the deck's plan, candidate pool and the app's own draft, and builds or changes
 * the deck with Claude using the player's API key.
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

/** A library card with what it does. */
interface KnownCard {
  card: LibraryCard
  profile: CardProfile
}

const COMMANDER = findFormat('commander')!

/** @returns The library card and what it does; undefined if unknown. */
function known(name: string): KnownCard | undefined {
  const card = libraryCard(name)
  return card && { card, profile: readCard(card) }
}

/**
 * The commander and key cards of a brief, from the card library (downloaded on first use).
 * @returns The commander, then the key cards.
 * @throws Error in plain words when a card is unknown, can't lead, isn't allowed in Commander, or
 * is outside the commander's colors.
 */
export async function deckFocus(brief: Pick<DeckBrief, 'commander' | 'anchors'>): Promise<KnownCard[]> {
  await ensureCardLibrary()
  const commander = known(brief.commander)
  if (!commander) throw new Error(`“${brief.commander}” isn't a card MTG Dreams knows.`)
  const lead = commander.card
  if (!canLead(COMMANDER, lead)) throw new Error(`${lead.name} can't be your commander: it must be ${commanderRule(COMMANDER)}.`)
  if (lead.legalities.commander !== 'legal') throw new Error(`${lead.name} isn't allowed in Commander.`)
  const anchors = brief.anchors.map((name) => {
    const anchor = known(name)
    if (!anchor) throw new Error(`“${name}” isn't a card MTG Dreams knows.`)
    if (anchor.card.legalities.commander !== 'legal') throw new Error(`${anchor.card.name} isn't allowed in Commander.`)
    if (!anchor.card.colorIdentity.every((color) => lead.colorIdentity.includes(color))) {
      throw new Error(`${anchor.card.name} is outside ${lead.name}'s colors.`)
    }
    return anchor
  })
  return [commander, ...anchors]
}

/** @returns Ways to win for the brief's commander and key cards, those they point to first. */
export async function deckRoutes(brief: Pick<DeckBrief, 'commander' | 'anchors'>): Promise<RouteOption[]> {
  const focus = await deckFocus(brief)
  return routeOptions(focus.map(({ card, profile }) => ({ name: card.name, profile })))
}

/** Loads Cardmarket prices, downloading them if none are saved: budgets need them. */
async function ensurePrices(): Promise<void> {
  await loadPriceGuide()
  if (priceGuideDate() === null) await refreshPriceGuide()
}

/**
 * Builds a deck's plan from a brief: the plan, the cards to choose from per slot, a first draft
 * by code alone, and its check.
 * @param raw - Brief from the renderer; checked with {@link normalizeBrief}.
 * @throws Error in plain words for a missing or invalid commander or key card, or when the card
 * library or prices can't be downloaded.
 */
export async function planDeck(raw: unknown): Promise<DeckPlan> {
  const brief = normalizeBrief(raw)
  if (!brief) throw new Error('Choose a commander first.')
  const [focusCards] = await Promise.all([deckFocus(brief), ensurePrices()])
  const commander = focusCards[0].card
  const focus = focusCards.map(({ card, profile }) => ({ name: card.name, profile }))
  const template = deckTemplate(brief, focus, commander.colorIdentity)
  const price = (card: LibraryCard) => cheapestPrice(card, brief.budget.basis)
  const pool = buildPool({ brief, template, focus: focusCards, library: await libraryProfiles(), price })
  const draft = draftDeck(pool)
  const context: CheckContext = { brief, template, commander, focus, lookup: known, price, offered: new Set(pool.eligible.keys()) }
  return { brief, template, pool, draft, check: checkDeck(draft.picks, context), context }
}

/** The last plan, reused while the brief, card library and prices stay the same. */
let cached: { key: string; plan: DeckPlan } | null = null

/** Identifies a brief with the card data it was planned on. */
function planKey(raw: unknown): string {
  const status = cardLibraryStatus()
  return JSON.stringify([normalizeBrief(raw), status.state === 'ready' ? status.updatedAt : null, priceGuideDate()])
}

/** @returns {@link planDeck}, reusing the last plan for the same brief and data. */
async function cachedPlan(raw: unknown): Promise<DeckPlan> {
  if (cached?.key === planKey(raw)) return cached.plan
  const plan = await planDeck(raw)
  cached = { key: planKey(raw), plan }
  return plan
}

/** @returns Whether the helper has an API key and the card library. */
export async function deckHelperStatus(): Promise<DeckHelperStatus> {
  return { apiKey: await apiKeyStatus(), library: cardLibraryStatus() }
}

/** @returns The plan for a brief, with the app's own draft, for the wizard to show. */
export async function deckPlanSummary(raw: unknown): Promise<DeckPlanSummary> {
  const { brief, template, pool, draft, check } = await cachedPlan(raw)
  return { brief, template, draft, check, eligible: pool.eligible.size, excluded: pool.excluded }
}

/** Plans the deck and sets up a session with Claude. */
async function session(raw: unknown, onProgress: (progress: DeckProgress) => void, signal: AbortSignal): Promise<SessionOptions> {
  const apiKey = await readApiKey()
  if (!apiKey) throw new Error('Add your Anthropic API key first: the deckbuilding helper uses Claude with your own key.')
  const downloading = cardLibraryStatus().state !== 'ready'
  onProgress({
    step: 'preparing',
    message: downloading ? 'Downloading every card’s rules text and price. This happens once and takes a minute…' : 'Reading every card that fits your brief…'
  })
  const { pool, draft, context } = await cachedPlan(raw)
  return {
    pool,
    draft,
    check: (deck: DeckPick[]) => checkDeck(deck, context),
    find: known,
    price: context.price,
    send: (request) => createMessage(apiKey, request, { signal }),
    onProgress,
    signal
  }
}

/**
 * Builds the 99 with Claude.
 * @throws Error in plain words on failure; `CancelledError` when `signal` aborts.
 */
export async function buildDeck(raw: unknown, onProgress: (progress: DeckProgress) => void, signal: AbortSignal): Promise<BuiltDeck> {
  return buildWithClaude(await session(raw, onProgress, signal))
}

/**
 * Changes a deck with Claude as the player asks, or answers their question about it.
 * @throws Error in plain words on failure; `CancelledError` when `signal` aborts.
 */
export async function changeDeck(
  raw: unknown,
  deck: DeckSnapshot,
  request: string,
  onProgress: (progress: DeckProgress) => void,
  signal: AbortSignal
): Promise<BuiltDeck> {
  return changeWithClaude(await session(raw, onProgress, signal), deck, request)
}
