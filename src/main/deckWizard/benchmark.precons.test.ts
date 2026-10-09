import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { isBasicLand } from '@shared/cards'
import type { CommunityDeck } from '@shared/deckWizard/community'
import { newBrief, type DeckBrief } from '@shared/deckWizard/deckBrief'
import { PRECON_IDEA } from '@shared/deckWizard/deckPool'
import { nameKey } from '@shared/decklist'
import { setEnvironment, SERVICES } from '../environment'
import { setWizardServices } from './services'

/**
 * Benchmark of the builder against decks built by people: for a spread of Commander precons, the
 * wizard builds a deck for the precon's commander, as Quick build would, with that precon left out
 * of the statistics, and counts how many of the precon's cards it picks, with the statistics and
 * without. Opt-in: set `MTG_DREAMS_LIBRARY_DIR` to a folder with the card library; the precons
 * download from MTGJSON on first run. Writes `precon-benchmark.md` there.
 *
 * @packageDocumentation
 */

const DIR = process.env.MTG_DREAMS_LIBRARY_DIR
/** Precons compared: every few, for a spread of years and colors. */
const SAMPLE = 40
/** Least share of a precon's cards the statistics must add over building without them; 2026-10-09: 18% with, 10% without. */
const BASELINE_GAIN = 0.06

/** Share of a precon's nonbasic cards a deck plays. */
function overlap(deck: string[], precon: CommunityDeck): number {
  const picked = new Set(deck.map(nameKey))
  const cards = precon.cards.filter((name) => !isBasicLand(name))
  return cards.filter((name) => picked.has(nameKey(name))).length / Math.max(1, cards.length)
}

describe.skipIf(!DIR || !existsSync(join(DIR ?? '', 'card-library.json')))('the builder against the official precons', { timeout: 1_800_000 }, () => {
  const rows: Array<{ precon: CommunityDeck; without: number; with: number; staples: string[] }> = []

  beforeAll(async () => {
    setEnvironment({ ...SERVICES, userData: DIR!, documents: DIR!, appData: DIR!, trash: async () => undefined, userAgent: 'MTGDreams/benchmark' })
    setWizardServices({ spellbookApi: 'http://127.0.0.1:9' })
    const { deckIdeasFor } = await import('./insights')
    const { planDeck } = await import('./planning')
    const { loadCommunityDecks } = await import('./community')
    const { libraryCard, loadCardLibrary } = await import('./cardLibrary')
    await loadCardLibrary()
    const decks = (await loadCommunityDecks())
      .filter((deck) => deck.commanders.length === 1 && libraryCard(deck.commanders[0])?.legalities.commander === 'legal')
      .sort((a, b) => a.id.localeCompare(b.id))
      // A collector's edition repeats its precon.
      .filter((deck, i, all) => all.findIndex((other) => other.commanders[0] === deck.commanders[0]) === i)
    const step = Math.max(1, Math.floor(decks.length / SAMPLE))
    for (const precon of decks.filter((_, i) => i % step === 0).slice(0, SAMPLE)) {
      const commander = libraryCard(precon.commanders[0])!.name
      let brief: DeckBrief = newBrief(commander)
      // The idea built on the precon itself would give its answers away.
      const idea = (await deckIdeasFor(brief)).find((i) => !i.id.startsWith(PRECON_IDEA))
      if (idea) brief = { ...brief, ideaId: idea.id, strategy: idea.strategy, wincons: idea.wincons, engines: idea.engines }
      const without = await planDeck(brief, { noCommunity: true })
      const withStats = await planDeck(brief, { leaveOut: precon.id })
      const names = (plan: typeof without) => plan.draft.picks.map((pick) => pick.name)
      const staples = ['Sol Ring', 'Arcane Signet', 'Command Tower'].filter((name) => names(withStats).includes(name))
      rows.push({ precon, without: overlap(names(without), precon), with: overlap(names(withStats), precon), staples })
    }
    const mean = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0) / rows.length
    const pct = (value: number) => `${Math.round(value * 100)}%`
    const lines = [
      `# Builder against ${rows.length} official precons`,
      '',
      `Share of each precon's cards the wizard picks for its commander, the precon itself left out of the statistics: **${pct(mean((r) => r.with))}** with the statistics, ${pct(mean((r) => r.without))} without.`,
      '',
      '| Precon | Commander | Without | With | Staples picked |',
      '|---|---|---|---|---|'
    ]
    for (const row of rows) lines.push(`| ${row.precon.name} | ${row.precon.commanders[0]} | ${pct(row.without)} | ${pct(row.with)} | ${row.staples.join(', ')} |`)
    await writeFile(join(DIR!, 'precon-benchmark.md'), `${lines.join('\n')}\n`)
  }, 1_800_000)

  it(`picks at least ${BASELINE_GAIN * 100} points more of each precon with the statistics than without`, () => {
    expect(rows.length).toBeGreaterThan(SAMPLE / 2)
    const gain = rows.reduce((sum, row) => sum + row.with - row.without, 0) / rows.length
    expect(gain).toBeGreaterThanOrEqual(BASELINE_GAIN)
  })
})
