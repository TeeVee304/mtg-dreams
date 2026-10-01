import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

const DECK = '1 Sol Ring\n1 Llanowar Elves\n1 Command Tower\n'
const files = { 'decks/Ramp.txt': DECK, 'inventory.txt': '1 Sol Ring\n1 Llanowar Elves\n1 Command Tower\n' }

/** Waits until a data file's text matches (saves land a moment after the click). */
async function waitForFile(run, path, pattern) {
  for (let i = 0; i < 50 && !pattern.test(run.read(path)); i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.match(run.read(path), pattern)
}

const removeButton = (page, card) => page.locator('tr', { hasText: card }).getByRole('button', { name: 'Remove from deck' })

test('removing a card can be undone with the toast icon or Ctrl+Z', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Ramp' }).click()
    await removeButton(page, 'Sol Ring').click()
    await run.waitForText('.toast:last-child', /Removed Sol Ring/)
    await waitForFile(run, 'decks/Ramp.txt', /^(?![\s\S]*Sol Ring)/)

    await page.locator('.toast:last-child .toast-action').click()
    await run.waitForText('.toast:last-child', /Undone: Removed Sol Ring/)
    await waitForFile(run, 'decks/Ramp.txt', /^1 Sol Ring$/m)
    assert.equal(run.read('decks/Ramp.txt'), DECK)

    await removeButton(page, 'Llanowar Elves').click()
    await waitForFile(run, 'decks/Ramp.txt', /^(?![\s\S]*Llanowar)/)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+z')
    await waitForFile(run, 'decks/Ramp.txt', /^1 Llanowar Elves$/m)
    assert.equal(run.read('decks/Ramp.txt'), DECK)

    await page.keyboard.press('Control+z')
    await run.waitForText('.toast:last-child', /Nothing to undo/)
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})

test('a list changed outside the app is not overwritten unasked', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  const dialog = page.locator('.modal', { hasText: 'Changed somewhere else' })
  try {
    await page.locator('.nav-item', { hasText: 'Ramp' }).click()
    await page.locator('tr', { hasText: 'Command Tower' }).waitFor()

    // Another PC's edit arrives through OneDrive while the app is open.
    const synced = '1 Sol Ring\n1 Llanowar Elves\n1 Command Tower\n1 Arcane Signet\n'
    writeFileSync(join(run.data, 'decks/Ramp.txt'), synced)
    await removeButton(page, 'Command Tower').click()
    await dialog.waitFor()
    assert.equal(run.read('decks/Ramp.txt'), synced)

    await dialog.getByRole('button', { name: 'Load the other version' }).click()
    await page.locator('tr', { hasText: 'Arcane Signet' }).waitFor()
    assert.equal(await page.locator('tr', { hasText: 'Command Tower' }).count(), 1)

    // This time keep the app's version.
    writeFileSync(join(run.data, 'decks/Ramp.txt'), '1 Sol Ring\n')
    await removeButton(page, 'Arcane Signet').click()
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Keep mine' }).click()
    await waitForFile(run, 'decks/Ramp.txt', /Command Tower/)
    assert.equal(run.read('decks/Ramp.txt'), '1 Sol Ring\n1 Llanowar Elves\n1 Command Tower\n')
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})
