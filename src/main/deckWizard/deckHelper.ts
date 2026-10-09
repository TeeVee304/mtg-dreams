import type {
  CardHit,
  CardTrait,
  DeckEdit,
  DeckFocusInfo,
  DeckHelperStatus,
  DeckPlanSummary,
  DeckSnapshot,
  FocusCardInfo
} from '@shared/deckWizard/api'
import type { LibraryCard } from '@shared/deckWizard/libraryCard'
import { isBasicLand } from '@shared/cards'
import { cardStrength } from '@shared/deckWizard/cardStrength'
import { commandersKey, communityStats, readDecks, type CommunityStats, type ReadDeck } from '@shared/deckWizard/community'
import { engineOptions, normalizeBrief, winconOptions, type DeckBrief, type WinconOption } from '@shared/deckWizard/deckBrief'
import { deckIdeas, type DeckIdea } from '@shared/deckWizard/deckIdeas'
import { checkDeck, type CheckContext, type DeckCheck } from '@shared/deckWizard/deckCheck'
import { nameKey } from '@shared/decklist'
import { draftDeck, draftNotes, draftSummary, nextBest, type Draft } from '@shared/deckWizard/deckDraft'
import { optimizeDeck } from '@shared/deckWizard/deckOptimizer'
import { deckReport, stapleReport, type DeckReport } from '@shared/deckWizard/deckReport'
import { buildPool, isLand, slotScore, type CandidatePool } from '@shared/deckWizard/deckPool'
import { changeDeck as swapCards, deckPrices, type BuiltDeck, type SubmittedPick } from '@shared/deckWizard/deckSession'
import { deckTemplate, type DeckTemplate } from '@shared/deckWizard/deckTemplate'
import { canLead, commanderRule, findFormat } from '@shared/formats'
import { mechanicName, MECHANICS, readCard, ROLES, type CardProfile, type MechanicId, type RoleId, type Signal } from '@shared/deckWizard/mechanics'
import { conflictsWith, explainConflict, explainLink, linksTo, type FocusCard } from '@shared/deckWizard/synergy'
import type { PriceBasis } from '@shared/types'
import {
  cardLibraryStatus,
  cheapestPrice,
  ensureCardLibrary,
  libraryCard,
  libraryCards,
  libraryProfiles,
  loadCardLibrary
} from './cardLibrary'
import { bracketFacts, findCombos, MAX_SPELLBOOK_CARDS } from './combos'
import { communityDecks, communityLoading, loadCommunityDecks } from './community'
import { loadPriceGuide, priceGuideDate, refreshPriceGuide } from '../priceGuide'

/**
 * Deckbuilding helper, main-process side: finds a brief's commander and key cards in the card
 * library, builds the deck's plan, candidate pool and draft, and changes the deck as the player
 * asks. The official precons steer the picks once their decklists are in (see `community.ts`).
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
export async function deckWincons(brief: Pick<DeckBrief, 'commander' | 'anchors'>): Promise<WinconOption[]> {
  const focus = await deckFocus(brief)
  return winconOptions(focus.map(({ card, profile }) => ({ name: card.name, profile })))
}

/** A mechanic as a trait: its community name, with the plain label alongside. */
const mechanicTrait = (id: MechanicId): CardTrait => {
  const { label, explain } = MECHANICS[id]
  const name = mechanicName(id)
  return { label: name, ...(name !== label && { plain: label }), explain }
}
/** A role as a trait. */
const roleTrait = (id: RoleId): CardTrait => {
  const { label, plain, explain } = ROLES[id]
  return { label, ...(plain && { plain }), explain }
}

/** Strongest signals of one side of a profile, as traits. */
function traits<T extends string>(signals: Array<Signal<T>>, trait: (id: T) => CardTrait, min: number, skip: T[] = []): CardTrait[] {
  return signals
    .filter((s) => s.weight >= min && !s.via && !skip.includes(s.id))
    .sort((a, b) => b.weight - a.weight)
    .map((s) => trait(s.id))
}

/** A card found by search, priced on `basis`. */
const hit = (card: LibraryCard, basis: PriceBasis): CardHit => ({
  name: card.name,
  manaCost: card.manaCost,
  typeLine: card.typeLine,
  colorIdentity: card.colorIdentity,
  price: cheapestPrice(card, basis)
})

/** What a card does in plain words: what it makes happen, what it wants, and its deck jobs. */
function describe({ card, profile }: KnownCard, basis: PriceBasis): FocusCardInfo {
  return {
    ...hit(card, basis),
    provides: traits(profile.provides, mechanicTrait, 0.8),
    needs: traits(profile.uses, mechanicTrait, 0.5),
    jobs: traits(profile.roles, roleTrait, 0.8, ['land'])
  }
}

/**
 * The commander and key cards in plain words: what each does and needs, how each key card
 * connects to the commander and the other key cards, and the ways to win they suggest.
 * @throws Error in plain words as {@link deckFocus}.
 */
export async function deckFocusInfo(commander: string, anchors: string[], basis: PriceBasis): Promise<DeckFocusInfo> {
  const [focus] = await Promise.all([deckFocus({ commander, anchors }), loadPriceGuide()])
  const cards = focus.map(({ card, profile }) => ({ name: card.name, profile }))
  return {
    commander: describe(focus[0], basis),
    anchors: focus.slice(1).map((anchor) => {
      const others = cards.filter((f) => f.name !== anchor.card.name)
      return {
        ...describe(anchor, basis),
        links: [
          ...sharedEngines(anchor.card.name, anchor.profile, others),
          ...linksTo(anchor.profile, others).map((link) => explainLink(anchor.card.name, link))
        ],
        conflicts: conflictsWith(anchor.profile, others).map((conflict) => explainConflict(anchor.card.name, conflict))
      }
    }),
    wincons: winconOptions(cards),
    engines: engineOptions(cards)
  }
}

/** Strongest a card must do something for it to be an engine it shares. */
const SHARED_STRENGTH = 0.8

/** "Like Toph, Avatar Kyoshi turns your lands into creatures.": what a card does as strongly as another focus card. */
function sharedEngines(name: string, profile: CardProfile, others: FocusCard[]): string[] {
  const strong = (signals: CardProfile['provides']) => signals.filter((s) => s.weight >= SHARED_STRENGTH && !s.via)
  return strong(profile.provides).flatMap((signal) => {
    const alike = others.find((other) => strong(other.profile.provides).some((s) => s.id === signal.id))
    return alike ? [`Like ${alike.name}, ${name} ${MECHANICS[signal.id].provide}.`] : []
  })
}

/** Most search results. */
const MAX_HITS = 12

/**
 * Searches the card library by name: every word must appear; names starting with the query come
 * first, then names with a word starting with it.
 * @param options - `commanders`: only cards that can lead in Commander; `commander`: only cards its
 * deck may play (legal, in its colors, not basic lands, not itself).
 * @throws Error while the card library isn't downloaded.
 */
export async function searchDeckCards(
  query: string,
  options: { commander?: string; commanders?: boolean; basis: PriceBasis }
): Promise<CardHit[]> {
  await Promise.all([loadCardLibrary(), loadPriceGuide()])
  if (cardLibraryStatus().state !== 'ready') throw new Error('The card library is still downloading.')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lead = options.commander ? libraryCard(options.commander) : undefined
  const fits = (card: LibraryCard) => {
    if (card.legalities.commander !== 'legal') return false
    if (options.commanders) return canLead(COMMANDER, card)
    if (!lead) return true
    return card !== lead && !isBasicLand(card.name) && card.colorIdentity.every((color) => lead.colorIdentity.includes(color))
  }
  const query0 = words.join(' ')
  const rank = (name: string) => (name.startsWith(query0) ? 0 : name.includes(` ${words[0]}`) ? 1 : 2)
  const found: Array<{ card: LibraryCard; rank: number }> = []
  for (const card of libraryCards()) {
    const name = card.name.toLowerCase()
    if (words.every((word) => name.includes(word)) && fits(card)) found.push({ card, rank: rank(name) })
  }
  found.sort((a, b) => a.rank - b.rank || a.card.name.length - b.card.name.length || a.card.name.localeCompare(b.card.name))
  return found.slice(0, MAX_HITS).map(({ card }) => hit(card, options.basis))
}

/** Why the last download of card data or prices failed; null after a success. */
let downloadError: string | null = null

/**
 * Loads the saved card data and prices, then starts downloading what's missing or outdated
 * without waiting for it.
 */
export async function prepareDeckHelper(): Promise<DeckHelperStatus> {
  const track = (task: Promise<unknown>) =>
    task.then(
      () => (downloadError = null),
      (error: Error) => (downloadError = error.message)
    )
  await Promise.all([loadCardLibrary(), loadPriceGuide()])
  void track(ensureCardLibrary())
  void track(ensurePrices())
  void loadCommunityDecks()
  return deckHelperStatus()
}

/** Loads Cardmarket prices, downloading them if none are saved: budgets need them. */
async function ensurePrices(): Promise<void> {
  await loadPriceGuide()
  if (priceGuideDate() === null) await refreshPriceGuide()
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

/** The last plan, reused while the brief, card library and prices stay the same. */
let cached: { key: string; plan: DeckPlan } | null = null

/** Identifies a brief with the card data it was planned on. */
function planKey(raw: unknown): string {
  const status = cardLibraryStatus()
  return JSON.stringify([normalizeBrief(raw), status.state === 'ready' ? status.updatedAt : null, priceGuideDate(), communityDecks()?.length ?? 0])
}

/** @returns {@link planDeck}, reusing the last plan for the same brief and data. */
async function cachedPlan(raw: unknown): Promise<DeckPlan> {
  if (cached?.key === planKey(raw)) return cached.plan
  const plan = await planDeck(raw)
  cached = { key: planKey(raw), plan }
  return plan
}

/** @returns Whether the helper has the card library and precons, and why the last download failed. */
export function deckHelperStatus(): DeckHelperStatus {
  return { library: cardLibraryStatus(), precons: { decks: communityDecks()?.length ?? 0, loading: communityLoading() }, error: downloadError }
}

/** @returns The plan for a brief, with the app's own draft, for the wizard to show. */
export async function deckPlanSummary(raw: unknown): Promise<DeckPlanSummary> {
  const { brief, template, pool, draft, check } = await cachedPlan(raw)
  return { brief, template, draft, check, eligible: pool.eligible.size, excluded: pool.excluded }
}

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
  const changed = swapCards(deck.picks, [pick.name], [{ name: next.name, slot: next.slot, reason: next.reason }], pool)
  if (changed.problems.length > 0) throw new Error(changed.problems.join(' '))
  return { picks: changed.deck, check: checkDeck(changed.deck, context), prices: deckPrices(changed.deck, known, context.price) }
}

/**
 * Deck ideas for the brief's commander and key cards, within its bracket and budget. From
 * Bracket 3 up, Commander Spellbook's combos with the commander or a key card can lead; without a
 * connection the ideas come from rules text alone.
 * @throws Error in plain words as {@link planDeck}.
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
 * @throws Error in plain words as {@link planDeck}.
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

/** Names of the strongest nonland cards the deck may play, as many as Commander Spellbook takes. */
function strongest(pool: CandidatePool): string[] {
  return [...pool.eligible.values()]
    .filter((entry) => !isLand(entry.card))
    .sort((a, b) => cardStrength(b.card) - cardStrength(a.card) || a.card.name.localeCompare(b.card.name))
    .slice(0, MAX_SPELLBOOK_CARDS)
    .map((entry) => entry.card.name)
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
  const changed = swapCards(deck.picks, remove, added, pool)
  if (changed.problems.length > 0) throw new Error(changed.problems.join(' '))
  return { picks: changed.deck, check: checkDeck(changed.deck, context), prices: deckPrices(changed.deck, known, context.price) }
}
