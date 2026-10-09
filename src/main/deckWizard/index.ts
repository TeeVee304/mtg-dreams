import { app, ipcMain } from 'electron'
import { MAX_ANCHORS } from '@shared/deckWizard/deckBrief'
import { readDeckSnapshot } from '@shared/deckWizard/deckSession'
import { DEFAULT_PRICE_BASIS, isPriceBasis } from '@shared/pricing'
import { cardNames, text } from '../validate'
import type { EngineCall } from './engine'
import type { EngineHost } from './engineHost'
import { setWizardServices, WIZARD_SERVICES } from './services'

/**
 * The Deck Wizard's main-process entry: the only module the rest of the app imports. It sets up
 * the wizard's services, starts its engine in a worker thread, and registers its `wizard:*` IPC
 * handlers, backing `DeckWizardApi`. All renderer input is checked here, before it reaches the
 * engine. In unpackaged builds `MTG_DREAMS_SPELLBOOK_API` overrides Commander Spellbook's URL
 * (used by e2e tests); precons come through the app's own MTGJSON client.
 *
 * @packageDocumentation
 */

/** Most cards taken out or put in by one edit. */
const MAX_EDITS = 20
/** Most cards swapped out before that a swap skips. */
const MAX_SKIPPED = 200
/** Longest card name or search accepted. */
const MAX_NAME = 200

/** What the handlers need from Electron; tests pass stand-ins. */
export interface WizardHostOptions {
  /** The engine; by default, started in a worker thread. */
  engine?: EngineHost
  /** Registers an IPC handler; by default, `ipcMain.handle`. */
  handle?: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void
}

/**
 * Sets up the Deck Wizard and registers its IPC handlers at once; the engine's worker starts on
 * the first call.
 * @returns The engine.
 */
export function registerDeckWizard(options: WizardHostOptions = {}): EngineHost {
  setWizardServices({ spellbookApi: (!app.isPackaged && process.env.MTG_DREAMS_SPELLBOOK_API) || WIZARD_SERVICES.spellbookApi })
  const ready = options.engine ? Promise.resolve(options.engine) : import('./engineWorker').then((module) => module.startEngine())
  const handle = options.handle ?? ((channel, listener) => ipcMain.handle(channel, listener))
  const basis = (value: unknown) => (isPriceBasis(value) ? value : DEFAULT_PRICE_BASIS)
  const call = ((method, ...args) => ready.then((host) => host.call(method, ...args))) as EngineCall
  const engine: EngineHost = { call, close: async () => (await ready).close() }

  handle('wizard:status', () => call('status'))
  handle('wizard:prepare', () => call('prepare'))
  handle('wizard:search', (_e, query, options) => {
    const opts = (typeof options === 'object' && options !== null ? options : {}) as Record<string, unknown>
    return call('search', text(query, 'search').slice(0, MAX_NAME), {
      commander: typeof opts.commander === 'string' ? opts.commander.slice(0, MAX_NAME) : undefined,
      commanders: opts.commanders === true,
      basis: basis(opts.basis)
    })
  })
  handle('wizard:focus', (_e, commander, anchors, priceBasis) =>
    call('focus', text(commander, 'commander'), cardNames(anchors, MAX_ANCHORS, MAX_NAME), basis(priceBasis))
  )
  handle('wizard:ideas', (_e, brief) => call('ideas', brief))
  handle('wizard:plan', (_e, brief) => call('plan', brief))
  handle('wizard:build', (_e, brief) => call('build', brief))
  handle('wizard:report', (_e, brief, deck) => call('report', brief, readDeckSnapshot(deck)))
  handle('wizard:edit', (_e, brief, deck, remove, add) =>
    call('edit', brief, readDeckSnapshot(deck), cardNames(remove, MAX_EDITS, MAX_NAME), cardNames(add, MAX_EDITS, MAX_NAME))
  )
  handle('wizard:swap', (_e, brief, deck, name, skip) =>
    call('swap', brief, readDeckSnapshot(deck), text(name, 'card').slice(0, MAX_NAME), cardNames(skip, MAX_SKIPPED, MAX_NAME))
  )
  return engine
}
