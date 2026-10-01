import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

const DECK = "// Format: Commander\n1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Llanowar Elves\n1 Command Tower\n10 Island\n"
const INVENTORY = "1 Atraxa, Praetors' Voice\n1 Command Tower\n1 Llanowar Elves\n2 Sol Ring\n10 Island\n"
const WISHLIST = '4 Lightning Bolt\n1 Sol Ring\n'

const files = { 'decks/Superfriends.txt': DECK, 'lists/Upgrades.txt': WISHLIST, 'inventory.txt': INVENTORY }

test('a deck shows its prices, type sections and value', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Superfriends' }).click()
    await run.pricesLoaded()
    // Cardmarket trend: 10 + 1.50 + 0.20 + 0.30, with bundled basic lands free.
    await run.waitForText('.stat.accent .stat-value', /12[,.]00/)
    const sections = await page.locator('.section-row .section-label').allInnerTexts()
    assert.deepEqual(sections, ['CREATURES · 2', 'ARTIFACTS · 1', 'LANDS · 11'])
    // Stats: Llanowar Elves and Sol Ring at 1, Atraxa at 4; Command Tower and 10 Islands are lands.
    await run.waitForText('.deck-stats-toggle', /3 Cards \+ 11 Lands/)
    await run.waitForText('.curve-average', /^Average Mana Value: 2\.00$/)
    assert.equal(await page.locator('.curve-slot').nth(1).getAttribute('aria-label'), 'Mana Value (1): 2 Cards')
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})

test('prices come from Cardmarket, on the basis chosen in Settings', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  const deckValue = '.stat.accent .stat-value'
  const choose = async (label) => {
    await page.locator('.settings-btn').click()
    await page.locator('.radio-option', { hasText: label }).click()
    await page.keyboard.press('Escape')
  }
  try {
    await page.locator('.nav-item', { hasText: 'Superfriends' }).click()
    await run.pricesLoaded()
    // Scryfall's prices are double Cardmarket's in the stand-in: 12.00 means the price guide is used.
    await run.waitForText(deckValue, /12[,.]00/)
    await run.waitForText('.stat.accent .stat-note', /^Typical prices/)
    await choose('Lowest listing')
    await run.waitForText(deckValue, /^6[,.]00/)
    await run.waitForText('.stat.accent .stat-note', /^Lowest listing prices/)
    await choose('30-day average')
    await run.waitForText(deckValue, /12[,.]40/)
    assert.equal(JSON.parse(readFileSync(join(run.profile, 'settings.json'), 'utf8')).priceBasis, 'avg30')
    assert.ok(services.hits.includes('GET /cardmarket/price_guide_1.json'), 'the price guide was downloaded')

    await page.locator('.header-actions button', { hasText: 'Refresh prices' }).click()
    await run.waitForText('.toast:last-child', /Prices are up to date: Cardmarket, 30/)
  } finally {
    await run.close()
    run.remove()
  }
})

test('the wand makes a legendary creature the commander, saved in the file', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Superfriends' }).click()
    await run.pricesLoaded()
    await page.locator('.wand-btn').click()
    const pickable = await page.locator('tr.pick-ok .card-name').allInnerTexts()
    assert.deepEqual(pickable, ["Atraxa, Praetors' Voice"])
    await page.locator('tr.pick-ok').click()
    await page.waitForSelector('.commander-section')
    assert.equal(await page.locator('.section-row .section-label').first().innerText(), 'COMMANDER · 1')
    assert.match(run.read('decks/Superfriends.txt'), /^\/\/ Format: Commander\n\/\/ Commander: Atraxa, Praetors' Voice\n/)
  } finally {
    await run.close()
    run.remove()
  }
})

test('one sort applies to every deck and wishlist, and is remembered', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  const sortSelect = page.locator('label.field-inline:has-text("Sort") select')
  try {
    await page.locator('.nav-item', { hasText: 'Upgrades' }).click()
    await run.pricesLoaded()
    await sortSelect.selectOption('unit')
    await page.locator('.nav-item', { hasText: 'Superfriends' }).click()
    assert.equal(await sortSelect.inputValue(), 'unit')
    await run.close()

    const again = await launchApp(services, { root: run.dir })
    try {
      await again.page.locator('.nav-item', { hasText: 'Upgrades' }).click()
      assert.equal(await again.page.locator('label.field-inline:has-text("Sort") select').inputValue(), 'unit')
    } finally {
      await again.close()
    }
  } finally {
    run.remove()
  }
})

test('ticking a wishlist card adds it to the inventory', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Upgrades' }).click()
    await run.pricesLoaded()
    await page.locator('input[aria-label="Own Lightning Bolt"]').check()
    await page.waitForFunction(() => document.querySelector('.stat-value')?.textContent?.includes('0,00') || document.querySelector('.stat-value')?.textContent?.includes('0.00'))
    assert.match(run.read('inventory.txt'), /^4 Lightning Bolt$/m)
  } finally {
    await run.close()
    run.remove()
  }
})
