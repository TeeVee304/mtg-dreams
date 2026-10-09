import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

const files = {
  'lists/Goblins.txt': '// Priority: High\n2 Sol Ring\n4 Lightning Bolt\n10 Mountain\n',
  'lists/Elves.txt': '1 Sol Ring\n1 Llanowar Elves\n',
  'lists/Someday.txt': '1 Command Tower\n1 Lightning Bolt\n',
  'decks/Superfriends.txt': "// Format: Commander\n// Commander: Atraxa, Praetors' Voice\n1 Atraxa, Praetors' Voice\n",
  'inventory.txt': "1 Sol Ring\n1 Atraxa, Praetors' Voice\n"
}

const rowNames = (page) => page.locator('.wanted-table tbody .card-name').allInnerTexts()

test('with shared copies, Most Wanted buys one copy for every list, and buying updates every list', async () => {
  const run = await launchApp(services, { files, settings: { copies: 'shared' } })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Most Wanted' }).click()
    await run.waitForText('.wanted-view .view-header p', /^7 cards to buy · 4[,.]00\s€/)
    assert.deepEqual(await rowNames(page), ['Llanowar Elves', 'Command Tower', 'Lightning Bolt', 'Sol Ring'])
    await run.waitForText('.wanted-table tbody tr:first-child', /Completes Elves/)

    await page.locator('.wanted-view label', { hasText: 'Sort' }).locator('select').selectOption('lists')
    assert.equal((await rowNames(page))[0], 'Lightning Bolt')

    await page.locator('tr', { hasText: 'Sol Ring' }).getByRole('button', { name: 'Bought' }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('.wanted-table .card-name')].some((el) => el.textContent === 'Sol Ring'))
    assert.match(run.read('inventory.txt'), /^2 Sol Ring$/m)

    await page.getByRole('tab', { name: /Basic lands/ }).click()
    await run.waitForText('.wanted-table tbody', /Mountain[\s\S]*Goblins · 10[\s\S]*10/)
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})

test('with separate copies (the default), every list needs its own copy and decks come first', async () => {
  const run = await launchApp(services, {
    files: { ...files, 'decks/Artifacts.txt': '1 Sol Ring\n1 Lightning Bolt\n', 'decks/Burn.txt': '1 Sol Ring\n' }
  })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Most Wanted' }).click()
    await run.waitForText('.wanted-view .view-header p', /^12 cards to buy · 9[,.]50\s€ to complete every deck and wishlist/)
    const sol = page.locator('.wanted-table tbody tr', { hasText: 'Sol Ring' })
    assert.equal(await sol.locator('td.col-num').first().innerText(), '4')
    assert.deepEqual(await sol.locator('.list-chip').allInnerTexts(), ['Burn', '★ Goblins · 2', 'Elves'])

    await page.getByRole('button', { name: /Budget planner/ }).click()
    await page.getByLabel('Budget in euros').fill('2')
    await run.waitForText('.planner-head', /3 cards for 1[,.]00\s€.*completes Artifacts/)
    assert.match(await page.locator('.plan-list').innerText(), /1× Lightning Bolt\s+Artifacts/)

    await page.locator('.nav-item', { hasText: 'Burn' }).click()
    await run.waitForText('.wanted-view, .view', /Used by Artifacts/)
    await run.waitForText('.view-header', /1 card needs more copies/)

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('radio', { name: /Shared between lists/ }).check()
    await page.keyboard.press('Escape')
    await page.locator('.nav-item', { hasText: 'Most Wanted' }).click()
    await run.waitForText('.wanted-view .view-header p', /^7 cards to buy · 4[,.]00\s€ to complete every wishlist/)
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})

test('a wishlist priority is set from its menu, and sidebar sections fold', async () => {
  const run = await launchApp(services, { files })
  const { page } = run
  try {
    await page.locator('.nav-item', { hasText: 'Someday' }).click()
    await page.getByRole('button', { name: 'More list actions' }).click()
    await page.getByText('Priority…').click()
    await page.getByRole('radio', { name: /Low/ }).click()
    await run.waitForText('.priority-chip', /^Low priority$/)
    assert.match(run.read('lists/Someday.txt'), /^\/\/ Priority: Low$/m)

    assert.equal(await page.locator('.nav-item', { hasText: 'Superfriends' }).count(), 1)
    await page.getByRole('button', { name: 'Collapse decks' }).click()
    assert.equal(await page.locator('.nav-item', { hasText: 'Superfriends' }).count(), 0)
    await page.getByRole('button', { name: 'Show decks' }).click()
    assert.equal(await page.locator('.nav-item', { hasText: 'Superfriends' }).count(), 1)
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})
