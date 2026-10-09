import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

test('two players swap trade lists and see what each can give the other', async () => {
  // Ana owns a Sol Ring and wants Lightning Bolts.
  const ana = await launchApp(services, {
    files: { 'inventory.txt': '1 Sol Ring\n', 'lists/Burn.txt': '4 Lightning Bolt\n' },
    settings: { tradeName: 'Ana' }
  })
  const file = join(ana.dir, 'Ana.mtgtrade')
  try {
    await ana.fakeDialogs({ save: file })
    await ana.page.locator('.share-item').click()
    await ana.page.locator('.modal-foot button', { hasText: 'Save file' }).click()
    await ana.page.waitForSelector('.modal', { state: 'detached' })
  } finally {
    await ana.close()
  }
  const shared = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(shared.format, 'mtg-dreams-trade')
  assert.deepEqual(shared.haves, [{ name: 'Sol Ring', qty: 1 }])
  assert.deepEqual(shared.wants, [{ name: 'Lightning Bolt', qty: 4 }])
  assert.deepEqual(Object.keys(shared).sort(), ['createdAt', 'format', 'haves', 'name', 'source', 'version', 'wants'])

  // You own Lightning Bolts and want a Sol Ring.
  const you = await launchApp(services, {
    files: { 'inventory.txt': '3 Lightning Bolt\n', 'lists/Upgrades.txt': '1 Sol Ring\n' }
  })
  try {
    await you.fakeDialogs({ open: file })
    await you.page.locator('button[aria-label="Import a friend\'s trade list"]').click()
    await you.page.locator('.import-file button', { hasText: 'Open a file' }).click()
    await you.page.waitForSelector('h1:has-text("Trading with Ana")')
    await you.waitForText('.summary-strip', /can give you\s*1[,.]50[\s\S]*You can give Ana\s*1[,.]50/)
    const stats = (await you.page.locator('.summary-strip').innerText()).replace(/\s+/g, ' ')
    assert.match(stats, /Ana can give you 1[,.]50 € 1 card your lists need/)
    assert.match(stats, /You can give Ana 1[,.]50 € 3 cards on their lists/)
    assert.match(await you.page.locator('.nav-item', { hasText: 'Ana' }).innerText(), /1 for you · 3 for them/)
    assert.equal(you.read('trades/Ana.mtgtrade'), readFileSync(file, 'utf8'))
  } finally {
    await you.close()
    you.remove()
    ana.remove()
  }
})
