// The Deck Wizard end to end, on real card data. Opt-in like the real-data unit tests: set
// MTG_DREAMS_LIBRARY_DIR to a folder with card-library.json and price-guide.json (as
// cardLibrary.flubs.test.ts leaves it); deckWizard/precons.json there, as benchmark.precons.test.ts
// leaves it, adds the precons' statistics. MTG_DREAMS_SHOTS saves a screenshot per step;
// MTG_DREAMS_THEME=light takes them in light mode.
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { launchApp } from './app.mjs'
import { startFakeServices } from './fake-services.mjs'

const LIBRARY = process.env.MTG_DREAMS_LIBRARY_DIR
const SHOTS = process.env.MTG_DREAMS_SHOTS
let services
before(async () => (services = await startFakeServices()))
after(() => services.close())

test('the Deck Wizard plans a Flubs deck around Valakut and saves it as a wishlist', { skip: !LIBRARY && 'set MTG_DREAMS_LIBRARY_DIR' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'mtg-dreams-wizard-'))
  for (const dir of ['profile', 'data']) mkdirSync(join(root, dir), { recursive: true })
  for (const file of ['card-library.json', 'price-guide.json']) copyFileSync(join(LIBRARY, file), join(root, 'profile', file))
  const precons = existsSync(join(LIBRARY, 'deckWizard', 'precons.json'))
  if (precons) {
    mkdirSync(join(root, 'profile', 'deckWizard'))
    copyFileSync(join(LIBRARY, 'deckWizard', 'precons.json'), join(root, 'profile', 'deckWizard', 'precons.json'))
  }
  writeFileSync(join(root, 'profile', 'settings.json'), JSON.stringify({ dataDir: join(root, 'data'), theme: process.env.MTG_DREAMS_THEME ?? 'dark' }))
  // An unreachable price guide keeps the real prices.
  const run = await launchApp({ ...services, priceGuideUrl: 'http://127.0.0.1:9/none' }, { root })
  const { page } = run
  const shot = (name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`) })
  try {
    await page.locator('.nav-item', { hasText: 'Deck Wizard' }).click()
    const wizard = page.locator('.modal.wizard')
    await wizard.waitFor()
    await shot('1-open')

    // Commander and key card
    await wizard.getByRole('combobox', { name: 'Search commanders' }).fill('flubs')
    await wizard.getByRole('option', { name: /Flubs, the Fool/ }).click()
    await wizard.locator('.chip.trait', { hasText: 'Extra Land Drops' }).waitFor()
    await wizard.getByRole('combobox', { name: 'Search key cards' }).fill('valakut, the')
    await wizard.getByRole('option', { name: /Valakut, the Molten Pinnacle/ }).click()
    await wizard.locator('.link-list li', { hasText: 'Valakut, the Molten Pinnacle triggers' }).first().waitFor()
    await shot('2-commander')

    // Power & budget: Bracket 2 · Core by default; hovering a name explains it.
    await wizard.getByRole('button', { name: 'Next: Power & budget' }).click()
    const core = wizard.getByRole('radio', { name: /^Bracket 2 · Core/ })
    assert.equal(await core.getAttribute('aria-checked'), 'true')
    await wizard.getByRole('radio', { name: /^Bracket 3 · Upgraded/ }).locator('.choice-label').hover()
    await wizard.locator('[role="tooltip"]:visible', { hasText: 'up to three Game Changers' }).waitFor()
    await wizard.getByLabel('The whole deck, commander included').fill('300')
    await wizard.getByLabel('Most for one card').fill('20')
    await wizard.getByLabel('Most for one card').blur()
    await run.waitForText('.budget-live', /cards in Flubs’s colors fit; [\d,.]+ cost more than/)
    await shot('3-power')

    // Deck idea: the Landfall idea, its tags explained on hover.
    await wizard.getByRole('button', { name: 'Next: Deck idea' }).click()
    const landfall = wizard.getByRole('radiogroup', { name: 'Deck ideas' }).getByRole('radio', { name: /^Landfall / }).first()
    await landfall.waitFor({ timeout: 60_000 })
    await landfall.locator('.idea-tag', { hasText: 'Landfall' }).hover()
    await wizard.locator('[role="tooltip"]:visible', { hasText: 'whenever a land enters' }).waitFor()
    await landfall.click()
    await wizard.locator('.brief-value', { hasText: 'Landfall' }).waitFor()
    await shot('4-idea')

    // Tune: heavy interaction, and a pet card.
    await wizard.getByRole('button', { name: 'Next: Tune' }).click()
    await wizard.getByRole('radio', { name: /^Heavy/ }).click()
    await wizard.getByRole('combobox', { name: 'Search pet cards' }).fill('seismic assault')
    await wizard.getByRole('option', { name: /Seismic Assault/ }).click()
    await shot('5-tune')

    // Build.
    await wizard.getByRole('button', { name: 'Next: Build' }).click()
    await wizard.locator('.plan-slots li', { hasText: 'Landfall' }).waitFor()
    await shot('6-build')
    await wizard.getByRole('button', { name: 'Build my deck' }).click()
    await wizard.locator('.review-step').waitFor({ timeout: 60_000 })
    await wizard.locator('.review-summary', { hasText: 'MTG Dreams picked every card from its rules text' }).waitFor()
    assert.equal(await page.getByText(/Claude|API key/).count(), 0, 'No AI anywhere')
    const total = await wizard.locator('.budget-line').innerText()
    assert.match(total, /of your (?:€\s?300[,.]00|300[,.]00\s?€) budget/)

    // Swap puts the next-best card for the job in.
    const firstCard = wizard.locator('.review-card').filter({ has: page.getByRole('button', { name: 'Swap' }) }).first()
    const swapped = await firstCard.locator('.review-name').innerText()
    await firstCard.getByRole('button', { name: 'Swap' }).click()
    await wizard.locator('.review-name', { hasText: swapped }).waitFor({ state: 'detached' })
    await shot('7-free-review')

    // The report: power level, curve, colors, jobs and solo games, each heading explained on hover.
    await wizard.locator('.deck-report .report-card', { hasText: 'Plays like Bracket 2' }).waitFor()
    await wizard.locator('.deck-report').scrollIntoViewIfNeeded()
    await shot('7a-report')
    await wizard.locator('.deck-report h4', { hasText: 'Solo games' }).locator('.term').hover()
    await wizard.locator('[role="tooltip"]:visible', { hasText: 'Playing a deck alone' }).waitFor()

    // Lock a card; rebuilding keeps it.
    const lockCard = wizard.locator('.review-card').filter({ has: page.getByRole('button', { name: 'Lock', exact: true }) }).nth(3)
    const lockedName = (await lockCard.locator('.review-name').innerText()).trim()
    await lockCard.getByRole('button', { name: 'Lock', exact: true }).click()
    await wizard.getByRole('button', { name: /^Rebuild, keeping locked cards/ }).click()
    await wizard.locator('.review-card.locked', { hasText: lockedName }).waitFor()
    await shot('7b-report')

    // The precons' staples, and why each card is there.
    if (precons) {
      await wizard.locator('.deck-report .report-card', { hasText: 'Staples' }).waitFor()
      await wizard.locator('.review-card', { hasText: 'Sol Ring' }).locator('.review-reason', { hasText: /A staple: in \d+% of precons/ }).waitFor()
      await shot('8-staples')
    }

    // Remove takes a card out.
    const removed = await wizard.locator('.review-group').nth(1).locator('.review-name').first().innerText()
    await wizard.locator('.review-group').nth(1).locator('.review-card').first().getByRole('button', { name: 'Remove' }).click()
    await wizard.locator('.review-name', { hasText: removed }).waitFor({ state: 'detached' })
    await shot('10-removed')

    // Save as a wishlist.
    await wizard.getByRole('button', { name: 'Create wishlist' }).click()
    await wizard.waitFor({ state: 'detached' })
    await page.locator('.nav-item.active', { hasText: 'Flubs deck plan' }).waitFor()
    const saved = run.read('lists/Flubs deck plan.txt')
    assert.match(saved, /^\/\/ Format: Commander\n\/\/ Commander: Flubs, the Fool\n1 Flubs, the Fool\n/)
    assert.match(saved, /\/\/ Built with the Deck Wizard: Bracket 2 · Core, /)
    assert.match(saved, /^1 Valakut, the Molten Pinnacle$/m)
    assert.doesNotMatch(saved, new RegExp(`^1 ${removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
    await shot('11-wishlist')

    // A new wizard starts fresh; Quick build makes a deck from the best idea and the defaults.
    await page.locator('.nav-item', { hasText: 'Deck Wizard' }).click()
    await wizard.getByRole('combobox', { name: 'Search commanders' }).fill('flubs')
    await wizard.getByRole('option', { name: /Flubs, the Fool/ }).click()
    await wizard.getByRole('button', { name: 'Next: Power & budget' }).click()
    await wizard.getByRole('button', { name: 'Quick build' }).click()
    await wizard.locator('.review-step').waitFor({ timeout: 60_000 })
    await wizard.locator('.brief-line', { hasText: 'Themes' }).locator('.brief-value').waitFor()
    assert.notEqual(await wizard.locator('.brief-line', { hasText: 'Strategy' }).locator('.brief-value').innerText(), 'Up to the commander')
    await shot('12-quick-build')

    // One closed halfway offers to continue.
    await page.keyboard.press('Escape')
    await wizard.waitFor({ state: 'detached' })
    await page.locator('.nav-item', { hasText: 'Deck Wizard' }).click()
    await wizard.getByRole('heading', { name: 'Continue your Flubs deck?' }).waitFor()
    await shot('13-resume')
    assert.deepEqual(run.errors, [])
  } finally {
    await run.close()
    run.remove()
  }
})
