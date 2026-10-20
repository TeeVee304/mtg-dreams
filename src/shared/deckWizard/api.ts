import type { AverageDeckFilters, AverageDeckResult } from './averageDeck'

/**
 * The Deck Wizard's bridge between the window and the main process, exposed by the preload script
 * as `window.deckWizard`. The wizard is a feature of its own: the rest of the app knows only its
 * entry points (see `src/renderer/src/features/deckWizard/index.tsx`).
 *
 * @packageDocumentation
 */

/** IPC bridge exposed by the preload script as `window.deckWizard`; channels are `wizard:*`. */
export interface DeckWizardApi {
  /**
   * @returns A commander's EDHREC average deck for a mix of theme, bracket and budget, or `missing`
   * when EDHREC has none (an unknown commander, or too few decks in the mix). Answers are cached for a day.
   * @throws Error in plain words when EDHREC can't be reached.
   */
  averageDeck(commander: string, filters: AverageDeckFilters): Promise<AverageDeckResult>
}
