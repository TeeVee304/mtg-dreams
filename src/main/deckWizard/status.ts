import type { DeckHelperStatus } from '@shared/deckWizard/api'
import { loadPriceGuide, priceGuideDate, refreshPriceGuide } from '../priceGuide'
import { cardLibraryStatus, ensureCardLibrary, loadCardLibrary } from './cardLibrary'
import { communityDecks, communityFailed, communityLoading, loadCommunityDecks } from './community'

/**
 * What the wizard needs before it can build, and getting it: the card library, Cardmarket prices
 * and the official precons, each downloaded once and kept.
 *
 * @packageDocumentation
 */

/** Why the last download of card data or prices failed; null after a success. */
let downloadError: string | null = null

/**
 * Downloads a newer price guide. In the app the wizard runs in a worker thread and asks the main
 * process, which owns the price guide's downloads; elsewhere it downloads itself.
 */
let refreshPrices: () => Promise<unknown> = refreshPriceGuide

/** Sets how {@link ensurePrices} gets a price guide when none is saved. */
export function setPriceRefresher(refresh: () => Promise<unknown>): void {
  refreshPrices = refresh
}

/** Loads Cardmarket prices, getting them if none are saved: budgets need them. */
export async function ensurePrices(): Promise<void> {
  await loadPriceGuide()
  if (priceGuideDate() === null) await refreshPrices()
}

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

/** @returns Whether the helper has the card library and precons, and why the last download failed. */
export function deckHelperStatus(): DeckHelperStatus {
  return {
    library: cardLibraryStatus(),
    precons: { decks: communityDecks()?.length ?? 0, loading: communityLoading(), failed: communityFailed() },
    error: downloadError
  }
}
