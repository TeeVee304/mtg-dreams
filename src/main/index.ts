import { app, BrowserWindow, clipboard, ClipboardItem, Menu, nativeImage, session, shell } from 'electron'
import { join } from 'node:path'
import { contextMenuItems } from './contextMenu'
import { registerDeckWizard } from './deckWizard'
import { env, SERVICES, setEnvironment } from './environment'
import { applyTheme, notifyPricesUpdated, openExternalSafe, registerIpc, windowBackground } from './ipc'
import { startPriceGuide } from './priceGuide'
import { recordCurrentPrices } from './priceHistory'
import { flushScryfallCache, loadScryfallCache } from './scryfallCache'
import { WINDOW_ICONS } from './icons'
import { getAppSettings, getTheme, migrateFromOldName } from './storage'

/**
 * Electron main entry: single-instance lock, environment setup, IPC, window and price guide polling.
 * Service URLs can be overridden in unpackaged builds via `MTG_DREAMS_SCRYFALL_API`,
 * `MTG_DREAMS_MTGJSON_API` and `MTG_DREAMS_PRICE_GUIDE_URL` (used by e2e tests). The Deck Wizard
 * is a feature of its own, registered here (see `deckWizard/index.ts`).
 *
 * @packageDocumentation
 */

/** Renderer crash reloads allowed per rolling minute. */
const MAX_RELOADS_PER_MINUTE = 3

/**
 * Creates the sandboxed main window. Reloads the renderer after a crash (bounded by
 * {@link MAX_RELOADS_PER_MINUTE}); routes new windows and navigation to {@link openExternalSafe};
 * shows a right-click menu for images and text ({@link contextMenuItems}).
 */
function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'MTG Dreams',
    icon: WINDOW_ICONS[getAppSettings().color],
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.on('focus', () => window.webContents.send('window:focus'))

  const crashes: number[] = []
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    const now = Date.now()
    crashes.push(now)
    if (crashes.filter((at) => now - at < 60_000).length <= MAX_RELOADS_PER_MINUTE) window.webContents.reload()
  })

  window.webContents.on('context-menu', (_event, params) => {
    const items = contextMenuItems(params, {
      copyImageAt: (x, y) => window.webContents.copyImageAt(x, y),
      copyImageFrom: (url, fallback) => void copyImageFrom(url).catch(fallback),
      copyText: (text) => void clipboard.writeText(text)
    })
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window })
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
      openExternalSafe(url)
    }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Downloads an image and puts it on the clipboard as a PNG; rejects if it can't be read as an image. */
async function copyImageFrom(url: string): Promise<void> {
  const response = await fetch(url, { headers: { 'User-Agent': env().userAgent }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()))
  if (image.isEmpty()) throw new Error('Not an image')
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    setEnvironment({
      userData: app.getPath('userData'),
      documents: app.getPath('documents'),
      appData: app.getPath('appData'),
      trash: (path) => shell.trashItem(path),
      userAgent: `MTGDreams/${app.getVersion()}`,
      scryfallApi: (!app.isPackaged && process.env.MTG_DREAMS_SCRYFALL_API) || SERVICES.scryfallApi,
      mtgjsonApi: (!app.isPackaged && process.env.MTG_DREAMS_MTGJSON_API) || SERVICES.mtgjsonApi,
      priceGuideUrl: (!app.isPackaged && process.env.MTG_DREAMS_PRICE_GUIDE_URL) || SERVICES.priceGuideUrl
    })
    migrateFromOldName()
    applyTheme(getTheme())
    void loadScryfallCache()
    registerIpc()
    registerDeckWizard()
    createWindow()
    startPriceGuide(() => void recordCurrentPrices().finally(notifyPricesUpdated))
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', flushScryfallCache)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
