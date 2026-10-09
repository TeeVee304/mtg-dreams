import { reloadPriceGuide } from '../priceGuide'
import { draftedDeck, editDeck, swapDeckCard } from './deckActions'
import { deckFocusInfo, searchDeckCards } from './focus'
import { deckIdeasFor, deckReportFor } from './insights'
import { deckPlanSummary } from './planning'
import { deckHelperStatus, prepareDeckHelper } from './status'

/**
 * The wizard's engine: everything the window can ask of it, by name. It runs in a worker thread
 * (see `worker.ts`), so reading cards and planning decks never hold up the rest of the app; the
 * main process checks what the window sends, then calls these through `engineHost.ts`.
 *
 * @packageDocumentation
 */

export const ENGINE = {
  status: deckHelperStatus,
  prepare: prepareDeckHelper,
  search: searchDeckCards,
  focus: deckFocusInfo,
  ideas: deckIdeasFor,
  plan: deckPlanSummary,
  build: draftedDeck,
  report: deckReportFor,
  edit: editDeck,
  swap: swapDeckCard,
  /** The main process saved a newer price guide. */
  pricesUpdated: reloadPriceGuide
}

/** The engine's methods. */
export type Engine = typeof ENGINE
export type EngineMethod = keyof Engine

/** Calls an engine method, wherever the engine runs. */
export type EngineCall = <M extends EngineMethod>(method: M, ...args: Parameters<Engine[M]>) => Promise<Awaited<ReturnType<Engine[M]>>>

/** A message to the worker: a call, or the answer to the worker's own request. */
export type ToWorker =
  | { kind: 'call'; id: number; method: EngineMethod; args: unknown[] }
  | { kind: 'answer'; id: number; error?: string }

/** A message from the worker: an answer to a call, or a request to the main process. */
export type FromWorker =
  | { kind: 'answer'; id: number; result?: unknown; error?: string }
  | { kind: 'refreshPrices'; id: number }
