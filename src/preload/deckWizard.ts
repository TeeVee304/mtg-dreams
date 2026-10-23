import { ipcRenderer } from 'electron'
import type { DeckWizardApi } from '@shared/deckWizard/api'

/** {@link DeckWizardApi} over `ipcRenderer`, exposed as `window.deckWizard` by `index.ts`. */
export const deckWizardApi: DeckWizardApi = {
  averageDeck: (commanders, filters) => ipcRenderer.invoke('wizard:average', commanders, filters)
}
