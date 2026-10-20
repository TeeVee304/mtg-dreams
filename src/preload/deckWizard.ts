import { ipcRenderer } from 'electron'
import type { DeckWizardApi } from '@shared/deckWizard/api'

/** {@link DeckWizardApi} over `ipcRenderer`, exposed as `window.deckWizard` by `index.ts`. */
export const deckWizardApi: DeckWizardApi = {
  averageDeck: (commander, filters) => ipcRenderer.invoke('wizard:average', commander, filters)
}
