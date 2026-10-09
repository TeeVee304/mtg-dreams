import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

const files = {
  'decks/Ramp.txt': '1 Sol Ring\n',
  'lists/Burn.txt': '4 Lightning Bolt <141> [A25]\n',
  'inventory.txt': '2 Sol Ring\n'
}

/** Waits until a data file's text matches (saves land a moment after the click). */
async function waitForFile(run, path, pattern) {
  for (let i = 0; i < 50 && !pattern.test(run.read(path)); i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.match(run.read(path), pattern)
}

test('the inventory records versions, and decks show the version you own', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Inventory' }).first().click()
    await page.getByRole('button', { name: 'Versions of Sol Ring you own' }).click()
    const dialog = page.locator('.modal', { hasText: 'Your Sol Ring' })
    await dialog.getByRole('button', { name: 'Add a version' }).click()
    await dialog.locator('[role=option]:not(.auto)', { hasText: 'CMM #1' }).click()
    // One of the two "any version" copies became the CMM one.
    await waitForFile(run, 'inventory.txt', /^1 Sol Ring <1> \[CMM\]$/m)
    assert.equal(run.read('inventory.txt'), '1 Sol Ring\n1 Sol Ring <1> [CMM]\n')
    await page.keyboard.press('Escape')
    await page.locator('.chip', { hasText: '1× CMM #1' }).waitFor()

    // The deck's Sol Ring names no version, so it shows yours.
    await page.locator('.nav-item', { hasText: 'Ramp' }).click()
    await page.locator('tr', { hasText: 'Sol Ring' }).locator('.auto-badge.yours').waitFor()

    // Ticking a wishlist line that asks for a version records that version.
    await page.locator('.nav-item', { hasText: 'Burn' }).click()
    await page.locator('input[aria-label="Own Lightning Bolt"]').check()
    await waitForFile(run, 'inventory.txt', /^4 Lightning Bolt <141> \[A25\]$/m)
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})
