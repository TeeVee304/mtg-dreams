import { ipcMain } from 'electron'
import {
  averageDeckPath,
  isFilters,
  parseAverageDeck,
  type AverageDeckFilters,
  type AverageDeckResult
} from '@shared/deckWizard/averageDeck'
import { cacheEntries, cachedFetch } from '../cacheFiles'
import { env } from '../environment'
import { fetchJson } from '../http'
import { ui } from '@shared/text'
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
/** Version of the cached answers' form; older ones are fetched again. */
const CACHE_VERSION = 2

/** @returns Cached EDHREC answers of earlier cache versions, which nothing reads any more. */
export async function outdatedWizardCaches(): Promise<string[]> {
  return (await cacheEntries('edhrec')).filter((name) => name !== `v${CACHE_VERSION}`).map((name) => `edhrec/${name}`)
}

/** Registers an IPC handler; tests pass a stand-in. */
type Handle = (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void

/**
 * @param commanders - The commander, or two partners.
 * @returns Their average deck for a mix from EDHREC, or `missing` when EDHREC has none.
 * @throws Error in plain words when EDHREC can't be reached or answers oddly.
 */
export function averageDeck(commanders: string[], filters: AverageDeckFilters): Promise<AverageDeckResult> {
  const path = averageDeckPath(commanders, filters)
  if (!path) return Promise.resolve({ status: 'missing' })
  return cachedFetch<AverageDeckResult>(`edhrec/v${CACHE_VERSION}/${path}.json`, DAY_MS, async () => {
    const response = await fetchJson(`${env().edhrecJson}/${path}.json`, 'EDHREC')
    if (response.status === 403 || response.status === 404) return { status: 'missing' }
    if (response.status !== 200) throw new Error(ui.errors.edhrec(response.status))
    return { status: 'ok', deck: parseAverageDeck(response.data, filters) }
  })
}

/** Registers the Deck Wizard's IPC handlers. */
export function registerDeckWizard(handle: Handle = (channel, listener) => ipcMain.handle(channel, listener)): void {
  handle('wizard:average', (_e, commanders, filters) => {
    if (!isFilters(filters)) throw new Error(ui.errors.invalid('Deck filters'))
    if (!Array.isArray(commanders) || commanders.length < 1 || commanders.length > 2) throw new Error(ui.errors.invalid('Commanders'))
    return averageDeck(
      commanders.map((name) => text(name, 'commander').slice(0, MAX_NAME)),
      filters
    )
  })
}
