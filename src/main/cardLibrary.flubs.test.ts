import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { MECHANICS } from '@shared/mechanics'
import { explainConflict, explainLink, rankCandidates, type Candidate, type FocusCard } from '@shared/synergy'
import type { LibraryCard } from '@shared/types'
import { setEnvironment, SERVICES } from './environment'

/**
 * Acceptance test on real data: the Flubs, the Fool + Valakut, the Molten Pinnacle deck (Temur) against
 * Scryfall's full card library and Cardmarket's price guide. Opt-in, as it downloads ~130 MB on first
 * run: set `MTG_DREAMS_LIBRARY_DIR` to a folder that keeps the downloads between runs. Writes
 * `flubs-report.md` there, ranking the candidates with their reasons and prices.
 *
 * @packageDocumentation
 */

const DIR = process.env.MTG_DREAMS_LIBRARY_DIR

describe.skipIf(!DIR)('Flubs + Valakut on the real card library', { timeout: 600_000 }, () => {
  let ranked: Array<Candidate<LibraryCard>>
  let focus: FocusCard[]
  let library: typeof import('./cardLibrary')

  beforeAll(async () => {
    setEnvironment({ ...SERVICES, userData: DIR!, documents: DIR!, appData: DIR!, trash: async () => undefined, userAgent: 'MTGDreams/acceptance-test' })
    library = await import('./cardLibrary')
    const guide = await import('./priceGuide')
    await Promise.all([library.ensureCardLibrary(), guide.refreshPriceGuide()])
    const profiles = await library.libraryProfiles()
    const byName = new Map(profiles.map((p) => [p.card.name, p]))
    focus = ['Flubs, the Fool', 'Valakut, the Molten Pinnacle'].map((name) => ({ name, profile: byName.get(name)!.profile }))
    ranked = rankCandidates(profiles, focus, { identity: ['G', 'R', 'U'], format: 'commander' })
    await writeFile(join(DIR!, 'flubs-report.md'), report(ranked, library))
  }, 600_000)

  const rank = (name: string) => ranked.findIndex((c) => c.card.name === name) + 1 || Infinity
  const candidate = (name: string) => ranked.find((c) => c.card.name === name)

  it('reads Flubs and Valakut from their rules text', () => {
    const [flubs, valakut] = focus
    expect(flubs.profile.provides.map((s) => s.id)).toEqual(expect.arrayContaining(['extra-land-drop', 'discard']))
    expect(flubs.profile.uses.map((s) => s.id)).toEqual(expect.arrayContaining(['land-play', 'spell-cast', 'empty-hand']))
    expect(valakut.profile.uses.map((s) => s.id)).toEqual(['type-mountain'])
  })

  it('only offers Temur cards that are legal in Commander', () => {
    for (const { card } of ranked) {
      expect(card.colorIdentity.every((color) => 'GRU'.includes(color)), card.name).toBe(true)
      expect(card.legalities.commander, card.name).toBe('legal')
    }
  })

  it('ranks cards built around what Flubs and Valakut do near the top', () => {
    for (const name of ['Dryad of the Ilysian Grove', 'Prismatic Omen', 'Icetill Explorer', 'Courser of Kruphix', 'Valakut Exploration']) {
      expect(rank(name), name).toBeLessThanOrEqual(100)
    }
    for (const name of ['Crucible of Worlds', 'Ramunap Excavator', 'Scapeshift', 'Splendid Reclamation']) {
      expect(rank(name), name).toBeLessThanOrEqual(300)
    }
  })

  it('finds discard payoffs by reading the cards, keywords included', () => {
    for (const name of ['Glint-Horn Buccaneer', 'Fiery Temper', 'Containment Construct', 'Seismic Assault']) {
      expect(candidate(name)?.links.length, name).toBeGreaterThan(0)
    }
    expect(candidate('Fiery Temper')?.links.map((l) => l.mechanic)).toContain('discard')
  })

  it('warns about cards that work against the deck', () => {
    expect(candidate('Blood Moon')?.conflicts).toMatchObject([{ focus: 'Valakut, the Molten Pinnacle', mechanic: 'nonbasic-utility' }])
    expect(candidate('Tatyova, Benthic Druid')?.conflicts).toMatchObject([{ focus: 'Flubs, the Fool', mechanic: 'empty-hand' }])
  })

  it('knows what cards cost, so expensive ones can be kept out', () => {
    const price = (name: string) => library.cheapestPrice(library.libraryCard(name)!, 'trend')
    expect(price('Taiga')).toBeGreaterThan(20)
    expect(price('Mountain')).toBeLessThan(1)
    expect(price('Flubs, the Fool')).toBeGreaterThan(0)
  })
})

/** Markdown report of the top candidates, for reading the reasons. */
function report(ranked: Array<Candidate<LibraryCard>>, library: typeof import('./cardLibrary')): string {
  const eur = (card: LibraryCard) => {
    const price = library.cheapestPrice(card, 'trend')
    return price === null ? 'no price' : `€${price.toFixed(2)}`
  }
  const lines = [`# Flubs, the Fool + Valakut, the Molten Pinnacle — ${ranked.length} connected cards`, '']
  for (const [i, { card, score, links, conflicts }] of ranked.slice(0, 150).entries()) {
    lines.push(`${i + 1}. **${card.name}** — ${eur(card)} · score ${score.toFixed(2)}`)
    for (const link of links) lines.push(`   - ${explainLink(card.name, link)} *(${MECHANICS[link.mechanic].term ?? MECHANICS[link.mechanic].label})*`)
    for (const conflict of conflicts) lines.push(`   - ⚠ ${explainConflict(card.name, conflict)}`)
  }
  return `${lines.join('\n')}\n`
}
