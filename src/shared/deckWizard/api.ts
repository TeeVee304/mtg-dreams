import type { PriceBasis } from '../types'
import type { DeckBrief, EngineOption, WinconOption } from './deckBrief'
import type { DeckCheck } from './deckCheck'
import type { DeckPick, Draft } from './deckDraft'
import type { DeckIdea } from './deckIdeas'
import type { DeckReport } from './deckReport'
import type { BuiltDeck } from './deckSession'
import type { DeckTemplate } from './deckTemplate'

/**
 * The Deck Wizard's bridge between the window and the main process, exposed by the preload script
 * as `window.deckWizard`. The wizard is a feature of its own: the rest of the app knows only its
 * entry points (see `src/renderer/src/features/deckWizard/index.ts`).
 *
 * @packageDocumentation
 */

/** What the card library is doing, for progress display. */
export type CardLibraryStatus =
  | { state: 'missing' }
  /** `progress` 0 to 1; null if the size is unknown. */
  | { state: 'downloading'; progress: number | null }
  | { state: 'ready'; cards: number; updatedAt: string }

/** What the wizard needs before it can build. */
export interface DeckHelperStatus {
  library: CardLibraryStatus
  /** Official precons read for statistics so far, whether more are downloading, and how many couldn't be. */
  precons: { decks: number; loading: boolean; failed: number }
  /** Why the last download of card data or prices failed; null if it didn't. */
  error: string | null
}

/** A card found by the Deck Wizard's search. */
export interface CardHit {
  name: string
  manaCost: string
  typeLine: string
  colorIdentity: string[]
  /** EUR on the requested basis; null if unknown. */
  price: number | null
}

/** Something a card does or needs, in plain words. */
export interface CardTrait {
  /** What players call it: "Landfall", "Ramp". */
  label: string
  /** The same in plain words, when the label is jargon. */
  plain?: string
  explain: string
}

/** What a commander or key card does, read from its rules text. */
export interface FocusCardInfo extends CardHit {
  /** What it makes happen, e.g. extra land drops. */
  provides: CardTrait[]
  /** What it wants, e.g. an empty hand. */
  needs: CardTrait[]
  /** Deck jobs it does, e.g. ramp. */
  jobs: CardTrait[]
}

/** A key card, with how it connects to the commander and the other key cards. */
export interface AnchorInfo extends FocusCardInfo {
  /** Connections in plain words. */
  links: string[]
  /** Ways it works against them, in plain words. */
  conflicts: string[]
}

/** The commander and key cards of a brief, with the ways to win they suggest. */
export interface DeckFocusInfo {
  commander: FocusCardInfo
  anchors: AnchorInfo[]
  wincons: WinconOption[]
  /** What the commander and key cards do that the deck could multiply. */
  engines: EngineOption[]
}

/** A deck after a change by the player. */
export type DeckEdit = Pick<BuiltDeck, 'picks' | 'check' | 'prices'>

/** A brief's plan, with a draft as a preview. */
export interface DeckPlanSummary {
  /** The brief as checked. */
  brief: DeckBrief
  template: DeckTemplate
  draft: Draft
  /** Check of the draft. */
  check: DeckCheck
  /** Cards the deck may play. */
  eligible: number
  /** Cards left out by the player or the budget, by reason. */
  excluded: { overCap: number; unpriced: number; avoided: number; bracket: number }
}

/** A deck to change: the 99 and its summary. */
export interface DeckSnapshot {
  picks: DeckPick[]
  summary: string
}

/** IPC bridge exposed by the preload script as `window.deckWizard`; channels are `wizard:*`. */
export interface DeckWizardApi {
  /** @returns Whether the card library is ready, and why the last download failed. */
  getStatus(): Promise<DeckHelperStatus>
  /** Starts downloading card data and prices if needed. @returns The status, as {@link getStatus}. */
  prepare(): Promise<DeckHelperStatus>
  /**
   * Searches the card library by name: commanders, or cards a commander's deck may play.
   * @param options - `commander`: only cards in its colors; `commanders`: only cards that can lead.
   * @throws Error while the card library isn't downloaded.
   */
  searchCards(query: string, options: { commander?: string; commanders?: boolean; basis: PriceBasis }): Promise<CardHit[]>
  /**
   * @returns What a commander and key cards do, how the key cards connect, and the ways to win they suggest.
   * @throws Error in plain words for an unknown or invalid commander or key card.
   */
  getFocus(commander: string, anchors: string[], basis: PriceBasis): Promise<DeckFocusInfo>
  /**
   * @returns A few deck ideas for the brief's commander, key cards, bracket and budget.
   * @throws Error in plain words for an invalid brief, or when card data can't be downloaded.
   */
  getIdeas(brief: DeckBrief): Promise<DeckIdea[]>
  /**
   * @returns The plan for a brief, with a draft; downloads the card library on first use.
   * @throws Error in plain words for an invalid brief, or when card data can't be downloaded.
   */
  plan(brief: DeckBrief): Promise<DeckPlanSummary>
  /**
   * @returns The deck for a brief.
   * @throws Error in plain words for an invalid brief, or when card data can't be downloaded.
   */
  build(brief: DeckBrief): Promise<BuiltDeck>
  /**
   * @returns The report for a built deck: curve, color odds, jobs, power level and solo games.
   * @throws Error in plain words for an invalid brief.
   */
  getReport(brief: DeckBrief, deck: DeckSnapshot): Promise<DeckReport>
  /**
   * Takes cards out of a deck, or puts the player's own picks in; basic lands keep it at 99.
   * @throws Error in plain words when a card can't be removed or added.
   */
  edit(brief: DeckBrief, deck: DeckSnapshot, remove: string[], add: string[]): Promise<DeckEdit>
  /**
   * Swaps a card for the next-best one for its job; `skip` lists cards swapped out before.
   * @throws Error in plain words when nothing else fits.
   */
  swap(brief: DeckBrief, deck: DeckSnapshot, name: string, skip: string[]): Promise<DeckEdit>
}
