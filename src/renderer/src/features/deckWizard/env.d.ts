import type { DeckWizardApi } from '@shared/deckWizard/api'

declare global {
  interface Window {
    /** The Deck Wizard's bridge to the main process, exposed by the preload script. */
    deckWizard: DeckWizardApi
  }
}

export {}
