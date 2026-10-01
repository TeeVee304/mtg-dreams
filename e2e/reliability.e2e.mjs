import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

const execFileAsync = promisify(execFile)
const CRASH_CHECK = join(dirname(fileURLToPath(import.meta.url)), 'crash-check.mjs')

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

const files = { 'decks/Good.txt': '1 Sol Ring\n', 'inventory.txt': '1 Sol Ring\n' }

test('a file that cannot be read is skipped and reported; the rest loads', async () => {
  const run = await launchApp(services, { files })
  try {
    // A folder named like a deck can't be read as one. Make it, then have the app re-read.
    mkdirSync(join(run.data, 'decks', 'Broken.txt'))
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('window:focus'))
    const message = await run.page.locator('.toast.error').innerText()
    assert.match(message, /Could not read decks\/Broken\.txt/)
    assert.deepEqual(await run.page.locator('.nav-item .nav-name').allInnerTexts().then((names) => names.filter((n) => n !== 'Inventory')), [
      'Good',
      'Share my trade list'
    ])
  } finally {
    await run.close()
    run.remove()
  }
})

test('the window comes back by itself after its page crashes', async () => {
  // In a separate process: Playwright reports the crash as an error of its own.
  const { stdout } = await execFileAsync(process.execPath, [CRASH_CHECK, services.scryfallApi, services.mtgjsonApi])
  assert.match(stdout, /RECOVERED/)
})

test('a drawing error shows a way out instead of a blank window', async () => {
  const run = await launchApp(services, { files })
  try {
    await run.page.locator('.nav-item', { hasText: 'Good' }).click()
    await run.pricesLoaded()
  } finally {
    await run.close()
  }
  // Damage the cached card data in a way that only shows up while drawing, then start again.
  const cacheFile = join(run.profile, 'scryfall-cache.json')
  const cache = JSON.parse(readFileSync(cacheFile, 'utf8'))
  cache.entries['sol ring'].printings[0].finishes = null
  writeFileSync(cacheFile, JSON.stringify(cache))
  const again = await launchApp(services, { root: run.dir })
  try {
    await again.page.waitForSelector('.splash.crash')
    assert.match(await again.page.locator('.splash.crash h1').innerText(), /Something went wrong/)
    assert.equal(await again.page.locator('.crash-actions button').count(), 2)
  } finally {
    await again.close()
    run.remove()
  }
})
