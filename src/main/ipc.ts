import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { PriceBaseline, PrintingsOptions, Theme, TrackerApi } from '@shared/api'
import { isPriceBasis } from '@shared/pricing'
import { settingsPatch } from '@shared/settings'
import { TRADE_EXTENSION } from '@shared/trade'
import { WINDOW_ICONS } from './icons'
import { getPrecon, getPreconIndex } from './precons'
import { getDeckTokens } from './tokens'
import { loadPriceGuide, priceGuideDate, refreshPriceGuide, withMarketPrices } from './priceGuide'
import { getBaselines, pricesAt, recordCurrentPrices, trackPrices, updateBaselines } from './priceHistory'
import { autocomplete, getCardImages, getCardInfos, getPrintings } from './scryfall'
import * as storage from './storage'

/** Hosts (and subdomains) allowed for external links. */
const EXTERNAL_HOSTS = ['cardmarket.com', 'scryfall.com']
/** Max imported trade file size. */
const MAX_TRADE_FILE_BYTES = 5 * 1024 * 1024

/** Sets `nativeTheme.themeSource`, which drives the renderer's `prefers-color-scheme`. */
export function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme
}

/** @returns Window background color for the current light/dark mode. */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#121418' : '#f5f5f3'
}

/** Opens `raw` in the system browser if it is an https URL on {@link EXTERNAL_HOSTS}; otherwise ignores it. */
export function openExternalSafe(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return
  }
  const allowed = EXTERNAL_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  if (url.protocol === 'https:' && allowed) void shell.openExternal(url.toString())
}

/**
 * Validates an array from the renderer.
 * @throws Error if not an array, longer than `max`, or with an item failing `valid`.
 */
function arrayOf<T>(value: unknown, valid: (item: unknown) => boolean, what: string, max: number): T[] {
  if (!Array.isArray(value) || value.length > max || !value.every((item) => valid(item))) throw new Error(`Invalid ${what}.`)
  return value as T[]
}

/** Validates an array of safe integers from the renderer. @throws Error if invalid or longer than `max`. */
const numbers = (value: unknown, what: string, max = 50_000) => arrayOf<number>(value, Number.isSafeInteger, what, max)

/** Validates card names from the renderer. @throws Error if invalid, more than `max`, or one is longer than `maxLength`. */
const cardNames = (value: unknown, max: number, maxLength = Infinity) =>
  arrayOf<string>(value, (name) => typeof name === 'string' && name.length <= maxLength, 'card names', max)

/**
 * Validates baselines from the renderer; drops malformed entries and non-positive prices.
 * @throws Error if `value` is not an object.
 */
function baselines(value: unknown): Record<string, PriceBaseline> {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid baselines.')
  const valid: Record<string, PriceBaseline> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const entry = raw as { at?: unknown; prices?: Record<string, unknown> }
    if (key.length > 400 || typeof entry?.at !== 'number' || typeof entry.prices !== 'object' || entry.prices === null) continue
    const prices: PriceBaseline['prices'] = {}
    for (const [basis, price] of Object.entries(entry.prices)) {
      if (isPriceBasis(basis) && typeof price === 'number' && Number.isFinite(price) && price > 0) prices[basis] = price
    }
    valid[key] = { at: entry.at, prices }
  }
  return valid
}

/** @throws Error if `value` is not a string. */
function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${what}.`)
  return value
}

/** Shows an open dialog over the window that asked. */
function showOpenDialog(event: IpcMainInvokeEvent, options: Electron.OpenDialogOptions) {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)
}

/** Shows a save dialog over the window that asked. */
function showSaveDialog(event: IpcMainInvokeEvent, options: Electron.SaveDialogOptions) {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options)
}

/** Sends `prices:updated` to all windows. */
export function notifyPricesUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('prices:updated')
}

/** Registers all IPC handlers backing {@link TrackerApi}. All renderer input is validated. */
export function registerIpc(): void {
  ipcMain.handle('data:load', () => storage.loadData())
  ipcMain.handle('list:create', (_e, kind: unknown, name: unknown, body: unknown) =>
    storage.createList(storage.validateKind(kind), storage.validateListName(name), text(body, 'list text'))
  )
  ipcMain.handle('list:write', (_e, kind: unknown, name: unknown, body: unknown, force: unknown) =>
    storage.writeList(storage.validateKind(kind), storage.validateListName(name), text(body, 'list text'), force === true)
  )
  ipcMain.handle('list:rename', (_e, kind: unknown, from: unknown, to: unknown) =>
    storage.renameList(storage.validateKind(kind), storage.validateListName(from), storage.validateListName(to))
  )
  ipcMain.handle('list:move', (_e, from: unknown, to: unknown, name: unknown) =>
    storage.moveList(storage.validateKind(from), storage.validateKind(to), storage.validateListName(name))
  )
  ipcMain.handle('list:delete', (_e, kind: unknown, name: unknown) =>
    storage.deleteList(storage.validateKind(kind), storage.validateListName(name))
  )
  ipcMain.handle('inventory:write', (_e, body: unknown, force: unknown) =>
    storage.writeInventory(text(body, 'inventory text'), force === true)
  )

  ipcMain.handle('trade:write', (_e, name: unknown, body: unknown) =>
    storage.writeTrade(storage.validateListName(name), text(body, 'trade list'))
  )
  ipcMain.handle('trade:delete', (_e, name: unknown) => storage.deleteTrade(storage.validateListName(name)))
  ipcMain.handle('trade:open', async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Import a trade list',
      defaultPath: app.getPath('downloads'),
      properties: ['openFile'],
      filters: [
        { name: 'Trade lists and collection exports', extensions: [TRADE_EXTENSION, 'txt', 'csv'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    if ((await stat(path)).size > MAX_TRADE_FILE_BYTES) throw new Error('That file is too big to be a trade list.')
    return { fileName: basename(path, extname(path)), text: await readFile(path, 'utf8') }
  })
  ipcMain.handle('trade:saveAs', async (event, name: unknown, body: unknown) => {
    const result = await showSaveDialog(event, {
      title: 'Save my trade list',
      defaultPath: join(app.getPath('documents'), `${storage.validateListName(name)}.${TRADE_EXTENSION}`),
      filters: [{ name: 'MTG Dreams trade list', extensions: [TRADE_EXTENSION] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, text(body, 'trade list'), 'utf8')
    return result.filePath
  })

  ipcMain.handle('data:chooseDir', async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Choose data folder',
      defaultPath: storage.dataDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    await storage.setDataDir(result.filePaths[0])
    return result.filePaths[0]
  })
  ipcMain.handle('settings:get', () => storage.getAppSettings())
  ipcMain.handle('settings:update', (event, raw: unknown) => {
    const patch = settingsPatch(raw)
    storage.updateAppSettings(patch)
    if (patch.theme) {
      applyTheme(patch.theme)
      BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(windowBackground())
    }
    if (patch.color) BrowserWindow.fromWebContents(event.sender)?.setIcon(WINDOW_ICONS[patch.color])
  })

  ipcMain.handle('data:openDir', async () => {
    await shell.openPath(storage.dataDir())
  })

  ipcMain.handle('scryfall:autocomplete', (_e, query: unknown) => autocomplete(text(query, 'query')))
  ipcMain.handle('scryfall:printings', async (_e, name: unknown, options: unknown) => {
    const opts = (options ?? {}) as PrintingsOptions
    const result = await getPrintings(text(name, 'card name'), {
      force: opts.force === true,
      priority: opts.priority === 'high' ? 'high' : 'low',
      full: opts.full === true
    })
    return withMarketPrices(result)
  })
  ipcMain.handle('prices:refresh', async () => {
    const updated = await refreshPriceGuide()
    if (updated) {
      await recordCurrentPrices()
      notifyPricesUpdated()
    }
    return { updated, pricedAt: priceGuideDate() }
  })
  ipcMain.handle('prices:date', async () => {
    await loadPriceGuide()
    return priceGuideDate()
  })

  ipcMain.handle('scryfall:images', (_e, names: unknown) => getCardImages(cardNames(names, 75)))
  ipcMain.handle('scryfall:cardInfos', (_e, names: unknown) => getCardInfos(cardNames(names, 20_000)))

  ipcMain.handle('history:track', (_e, ids: unknown) => trackPrices(numbers(ids, 'product numbers')))
  ipcMain.handle('history:pricesAt', (_e, ids: unknown, at: unknown) =>
    pricesAt(numbers(ids, 'product numbers'), numbers(at, 'dates', 10))
  )
  ipcMain.handle('history:baselines', () => getBaselines())
  ipcMain.handle('history:updateBaselines', (_e, set: unknown, remove: unknown) =>
    updateBaselines(baselines(set), arrayOf<string>(remove, (key) => typeof key === 'string', 'baselines', Infinity))
  )
  ipcMain.handle('tokens:deck', (_e, names: unknown) => getDeckTokens(cardNames(names, 3000, 200)))
  ipcMain.handle('precons:index', () => getPreconIndex())
  ipcMain.handle('precons:deck', (_e, fileName: unknown) => getPrecon(text(fileName, 'deck')))

  ipcMain.handle('shell:openExternal', (_e, url: unknown) => openExternalSafe(text(url, 'URL')))
  ipcMain.handle('clipboard:write', (_e, value: unknown) => clipboard.writeText(text(value, 'text')))
}
