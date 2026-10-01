import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { PRICE_GUIDE, startFakeServices } from './fake-services.mjs'

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

const DAY = 24 * 60 * 60 * 1000
const guideDate = Date.parse(PRICE_GUIDE.createdAt)
const product = (name) => PRICE_GUIDE.rows[['Atraxa', 'Sol Ring', 'Llanowar Elves', 'Command Tower', 'Lightning Bolt'].indexOf(name)].idProduct

// A week ago Sol Ring's typical price was 1,00 € (today 1,50 €), and Lightning Bolt
// was 1,00 € when it went on the wishlist (today 0,50 €).
const history = {
  version: 1,
  tracked: [product('Sol Ring')],
  days: [{ date: guideDate - 7 * DAY, prices: { [product('Sol Ring')]: [1, 3] } }],
  baselines: { 'lightning bolt|||false': { at: guideDate - 7 * DAY, prices: { trend: 1, low: 0.5, avg30: 1.1 } } }
}

test('inventory value changes and wishlist price drops come from the price history', async () => {
  const run = await launchApp(services, {
    files: { 'lists/Burn.txt': '4 Lightning Bolt\n', 'inventory.txt': '2 Sol Ring\n' },
    profileFiles: { 'price-history.json': JSON.stringify(history) }
  })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Burn' }).click()
    await run.pricesLoaded()
    await page.locator('tr', { hasText: 'Lightning Bolt' }).locator('.chip.cheaper', { hasText: '↓ 50% cheaper' }).waitFor()
    await page.locator('.nav-item', { hasText: 'Burn' }).locator('.nav-cheaper', { hasText: '1 cheaper' }).waitFor()

    // Sol Ring went from 1,00 € to 1,50 €, and two are owned.
    await page.locator('button', { hasText: 'Inventory Value' }).click()
    await run.waitForText('.value-change-total .delta', /\+1[,.]00/)
    await page.locator('.movers-list li', { hasText: 'Sol Ring' }).waitFor()

    // A higher threshold than the drop turns the alert off.
    await page.keyboard.press('Escape')
    await page.locator('.settings-btn').click()
    await page.locator('input[aria-label="Price drop alert threshold in percent"]').fill('60')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.chip.cheaper'))
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})
