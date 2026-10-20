import { ipcMain } from 'electron'
import {
  averageDeckPath,
  EDHREC_JSON,
  isFilters,
  parseAverageDeck,
  type AverageDeckFilters,
  type AverageDeckResult
} from '@shared/deckWizard/averageDeck'
import { cachedFetch } from '../cacheFiles'
import { fetchJson } from '../http'
import { text } from '../validate'

/**
 * The Deck Wizard's main-process entry: the only module the rest of the app imports. It registers
 * the `wizard:*` IPC handlers backing `DeckWizardApi`: EDHREC's average decks, cached for a day under
 * `edhrec/` in userData. All renderer input is checked here.
 *
 * @packageDocumentation
 */

/** How long an EDHREC answer is kept. */
const DAY_MS = 24 * 60 * 60 * 1000
/** Longest commander name accepted. */
const MAX_NAME = 200

/** Registers an IPC handler; tests pass a stand-in. */
type Handle = (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void

/**
 * @returns A commander's average deck for a mix from EDHREC, or `missing` when EDHREC has none.
 * @throws Error in plain words when EDHREC can't be reached or answers oddly.
 */
export function averageDeck(commander: string, filters: AverageDeckFilters): Promise<AverageDeckResult> {
  const path = averageDeckPath(commander, filters)
  if (!path) return Promise.resolve({ status: 'missing' })
  return cachedFetch<AverageDeckResult>(`edhrec/${path}.json`, DAY_MS, async () => {
    const response = await fetchJson(`${EDHREC_JSON}/${path}.json`, 'EDHREC')
    if (response.status === 403 || response.status === 404) return { status: 'missing' }
    if (response.status !== 200) throw new Error(`EDHREC answered with an error (HTTP ${response.status}). Try again later.`)
    return { status: 'ok', deck: parseAverageDeck(response.data, filters) }
  })
}

/** Registers the Deck Wizard's IPC handlers. */
export function registerDeckWizard(handle: Handle = (channel, listener) => ipcMain.handle(channel, listener)): void {
  handle('wizard:average', (_e, commander, filters) => {
    if (!isFilters(filters)) throw new Error('Invalid deck filters.')
    return averageDeck(text(commander, 'commander').slice(0, MAX_NAME), filters)
  })
}
