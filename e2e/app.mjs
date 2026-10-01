// Starts the built app (out/) the way a user would, with its own temporary profile
// and data folder, talking to the fake services instead of Scryfall and MTGJSON.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param services the running fake services
 * @param files    data folder contents, e.g. { 'decks/Burn.txt': '4 Lightning Bolt\n' }
 * @param settings extra settings.json values
 */
export async function launchApp(services, { files = {}, settings = {}, root } = {}) {
  const dir = root ?? mkdtempSync(join(tmpdir(), 'mtg-dreams-e2e-'))
  const profile = join(dir, 'profile')
  const data = join(dir, 'data')
  mkdirSync(profile, { recursive: true })
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(data, path)), { recursive: true })
    writeFileSync(join(data, path), text)
  }
  if (!root) {
    writeFileSync(join(profile, 'settings.json'), JSON.stringify({ dataDir: data, theme: 'dark', ...settings }))
  }

  const app = await electron.launch({
    executablePath: join(PROJECT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [PROJECT, `--user-data-dir=${profile}`],
    cwd: PROJECT,
    env: {
      ...process.env,
      MTG_DREAMS_SCRYFALL_API: services.scryfallApi,
      MTG_DREAMS_MTGJSON_API: services.mtgjsonApi,
      MTG_DREAMS_PRICE_GUIDE_URL: services.priceGuideUrl
    }
  })
  const page = await app.firstWindow()
  // Playwright forces a light color scheme by default; let the app's own theme setting decide.
  await page.emulateMedia({ colorScheme: null })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  return {
    app,
    page,
    dir,
    data,
    profile,
    /** Errors thrown in the page so far. */
    errors,
    read: (path) => readFileSync(join(data, path), 'utf8'),
    /** Answers the next native open/save dialogs with these paths. */
    fakeDialogs: ({ open, save }) =>
      app.evaluate(
        ({ dialog }, paths) => {
          dialog.showOpenDialog = async () => ({ canceled: !paths.open, filePaths: paths.open ? [paths.open] : [] })
          dialog.showSaveDialog = async () => ({ canceled: !paths.save, filePath: paths.save })
        },
        { open, save }
      ),
    /** Waits until the open deck or wishlist has its prices. */
    pricesLoaded: () =>
      page.waitForFunction(() => {
        const meta = document.querySelector('.header-meta')?.textContent ?? ''
        return meta.includes('Cardmarket prices of')
      }),
    /**
     * Waits until an element's text matches. Prices can change once after loading (on a
     * first launch, Scryfall's come first, Cardmarket's a moment later), so tests wait
     * for the value they expect rather than reading it once.
     */
    waitForText: (selector, pattern) =>
      page.waitForFunction(
        ([css, source]) => new RegExp(source).test(document.querySelector(css)?.textContent ?? ''),
        [selector, pattern.source]
      ),
    close: async () => {
      await app.close()
    },
    remove: () => rmSync(dir, { recursive: true, force: true })
  }
}
