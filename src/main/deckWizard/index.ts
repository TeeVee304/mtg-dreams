import { app, ipcMain } from 'electron'
import { MAX_ANCHORS } from '@shared/deckWizard/deckBrief'
import { readDeckSnapshot } from '@shared/deckWizard/deckSession'
import { DEFAULT_PRICE_BASIS, isPriceBasis } from '@shared/pricing'
import {
  deckFocusInfo,
  deckHelperStatus,
  deckIdeasFor,
  deckPlanSummary,
  deckReportFor,
  draftedDeck,
  editDeck,
  prepareDeckHelper,
  searchDeckCards,
  swapDeckCard
} from './deckHelper'
import { setWizardServices, WIZARD_SERVICES } from './services'

/**
 * The Deck Wizard's main-process entry: the only module the rest of the app imports. It sets up
 * the wizard's services and registers its `wizard:*` IPC handlers, backing `DeckWizardApi`. All
 * renderer input is validated. In unpackaged builds `MTG_DREAMS_SPELLBOOK_API` overrides Commander
 * Spellbook's URL (used by e2e tests); precons come through the app's own MTGJSON client.
 *
 * @packageDocumentation
 */

/** Most cards taken out or put in by one edit. */
const MAX_EDITS = 20
/** Most cards swapped out before that a swap skips. */
const MAX_SKIPPED = 200
/** Longest card name or search accepted. */
const MAX_NAME = 200

/** @throws Error if `value` is not a string. */
function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${what}.`)
  return value
}

/** Validates card names from the renderer. @throws Error if invalid, more than `max`, or one is too long. */
function cardNames(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || value.length > max || !value.every((name) => typeof name === 'string' && name.length <= MAX_NAME)) {
    throw new Error('Invalid card names.')
  }
  return value as string[]
}

/** Sets up the Deck Wizard and registers its IPC handlers. */
export function registerDeckWizard(): void {
  setWizardServices({ spellbookApi: (!app.isPackaged && process.env.MTG_DREAMS_SPELLBOOK_API) || WIZARD_SERVICES.spellbookApi })
  const basis = (value: unknown) => (isPriceBasis(value) ? value : DEFAULT_PRICE_BASIS)

  ipcMain.handle('wizard:status', () => deckHelperStatus())
  ipcMain.handle('wizard:prepare', () => prepareDeckHelper())
  ipcMain.handle('wizard:search', (_e, query: unknown, options: unknown) => {
    const opts = (typeof options === 'object' && options !== null ? options : {}) as Record<string, unknown>
    return searchDeckCards(text(query, 'search').slice(0, MAX_NAME), {
      commander: typeof opts.commander === 'string' ? opts.commander.slice(0, MAX_NAME) : undefined,
      commanders: opts.commanders === true,
      basis: basis(opts.basis)
    })
  })
  ipcMain.handle('wizard:focus', (_e, commander: unknown, anchors: unknown, priceBasis: unknown) =>
    deckFocusInfo(text(commander, 'commander'), cardNames(anchors, MAX_ANCHORS), basis(priceBasis))
  )
  ipcMain.handle('wizard:ideas', (_e, brief: unknown) => deckIdeasFor(brief))
  ipcMain.handle('wizard:plan', (_e, brief: unknown) => deckPlanSummary(brief))
  ipcMain.handle('wizard:build', (_e, brief: unknown) => draftedDeck(brief))
  ipcMain.handle('wizard:report', (_e, brief: unknown, deck: unknown) => deckReportFor(brief, readDeckSnapshot(deck)))
  ipcMain.handle('wizard:edit', (_e, brief: unknown, deck: unknown, remove: unknown, add: unknown) =>
    editDeck(brief, readDeckSnapshot(deck), cardNames(remove, MAX_EDITS), cardNames(add, MAX_EDITS))
  )
  ipcMain.handle('wizard:swap', (_e, brief: unknown, deck: unknown, name: unknown, skip: unknown) =>
    swapDeckCard(brief, readDeckSnapshot(deck), text(name, 'card').slice(0, MAX_NAME), cardNames(skip, MAX_SKIPPED))
  )
}
