import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { SERVICES, setEnvironment } from './environment'
import { applyTheme, notifyPricesUpdated, openExternalSafe, registerIpc, windowBackground } from './ipc'
import { startPriceGuide } from './priceGuide'
import { flushScryfallCache, loadScryfallCache } from './scryfallCache'
import { WINDOW_ICONS } from './icons'
import { getAppSettings, getTheme, migrateFromOldName } from './storage'

const MAX_RELOADS_PER_MINUTE = 3

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'MTG Dreams',
    // The color theme's icon (the .exe itself keeps the gold one).
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

  // If the page itself crashes (out of memory, GPU fault...), reload it rather than
  // leave a blank window. Data is saved as it changes, so nothing is lost. Gives up
  // after repeated crashes so a persistent fault can't loop forever.
  const crashes: number[] = []
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    const now = Date.now()
    crashes.push(now)
    if (crashes.filter((at) => now - at < 60_000).length <= MAX_RELOADS_PER_MINUTE) window.webContents.reload()
  })

  // Links never open inside the app; allowed ones go to the system browser.
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

if (!app.requestSingleInstanceLock()) {
  // A second copy would fight over the same list files.
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
      // The end-to-end tests point a development build at a local stand-in for these services.
      scryfallApi: (!app.isPackaged && process.env.MTG_DREAMS_SCRYFALL_API) || SERVICES.scryfallApi,
      mtgjsonApi: (!app.isPackaged && process.env.MTG_DREAMS_MTGJSON_API) || SERVICES.mtgjsonApi,
      priceGuideUrl: (!app.isPackaged && process.env.MTG_DREAMS_PRICE_GUIDE_URL) || SERVICES.priceGuideUrl
    })
    migrateFromOldName()
    applyTheme(getTheme())
    // Read in the background: the window opens meanwhile, and price lookups wait for it.
    void loadScryfallCache()
    registerIpc()
    createWindow()
    // Cardmarket prices: checked now and hourly; open windows reload prices when they change.
    startPriceGuide(notifyPricesUpdated)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', flushScryfallCache)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
