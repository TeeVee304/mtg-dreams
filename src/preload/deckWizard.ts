import { ipcRenderer } from 'electron'
import type { DeckWizardApi } from '@shared/deckWizard/api'

/** {@link DeckWizardApi} over `ipcRenderer`, exposed as `window.deckWizard` by `index.ts`. */
export const deckWizardApi: DeckWizardApi = {
  getStatus: () => ipcRenderer.invoke('wizard:status'),
  prepare: () => ipcRenderer.invoke('wizard:prepare'),
  searchCards: (query, options) => ipcRenderer.invoke('wizard:search', query, options),
  getFocus: (commander, anchors, basis) => ipcRenderer.invoke('wizard:focus', commander, anchors, basis),
  getIdeas: (brief) => ipcRenderer.invoke('wizard:ideas', brief),
  plan: (brief) => ipcRenderer.invoke('wizard:plan', brief),
  build: (brief) => ipcRenderer.invoke('wizard:build', brief),
  getReport: (brief, deck) => ipcRenderer.invoke('wizard:report', brief, deck),
  edit: (brief, deck, remove, add) => ipcRenderer.invoke('wizard:edit', brief, deck, remove, add),
  swap: (brief, deck, name, skip) => ipcRenderer.invoke('wizard:swap', brief, deck, name, skip)
}
