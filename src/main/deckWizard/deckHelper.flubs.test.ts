import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { winconChoice, type WinconOption } from '@shared/deckWizard/deckBrief'
import { pickReason } from '@shared/deckWizard/deckDraft'
import { offeredGroups } from '@shared/deckWizard/deckPool'
import { FLUBS_BRIEF } from '@shared/deckWizard/testDecks'
import { setEnvironment, SERVICES } from '../environment'
import type { DeckPlan } from './deckHelper'

/**
 * Acceptance test on real data: a Flubs, the Fool deck built around Valakut, the Molten Pinnacle,
 * winning by burning the table, landfall and out-valuing, at most €20 a card. Opt-in like
 * `cardLibrary.flubs.test.ts`: set `MTG_DREAMS_LIBRARY_DIR`. Writes `flubs-deck.md` there with the
 * plan, the cards offered per slot, the drafted 99 and its check.
 *
 * @packageDocumentation
 */

const DIR = process.env.MTG_DREAMS_LIBRARY_DIR

describe.skipIf(!DIR)('building the Flubs + Valakut deck from real data', { timeout: 600_000 }, () => {
  let plan: DeckPlan
  let wincons: WinconOption[]
  let helper: typeof import('./deckHelper')

  beforeAll(async () => {
    setEnvironment({ ...SERVICES, userData: DIR!, documents: DIR!, appData: DIR!, trash: async () => undefined, userAgent: 'MTGDreams/acceptance-test' })
    helper = await import('./deckHelper')
    // The precons' statistics steer the picks, as in the app once they're downloaded.
    await (await import('./cardLibrary')).ensureCardLibrary()
    await (await import('./community')).loadCommunityDecks()
    wincons = await helper.deckWincons(FLUBS_BRIEF)
    plan = await helper.planDeck(FLUBS_BRIEF)
    await writeFile(join(DIR!, 'flubs-deck.md'), report(plan, wincons))
  }, 600_000)

  const picked = (name: string) => plan.draft.picks.find((p) => p.name === name)

  it('finds commanders, and cards a commander’s deck may play, by name', async () => {
    expect((await helper.searchDeckCards('flubs', { commanders: true, basis: 'trend' }))[0].name).toBe('Flubs, the Fool')
    const valakut = await helper.searchDeckCards('valakut', { commander: 'Flubs, the Fool', basis: 'trend' })
    expect(valakut.map((c) => c.name)).toEqual(expect.arrayContaining(['Valakut, the Molten Pinnacle', 'Valakut Exploration']))
    expect(await helper.searchDeckCards('path to exile', { commander: 'Flubs, the Fool', basis: 'trend' })).toEqual([])
  })

  it('says what Flubs and Valakut do, and how they connect', async () => {
    const focus = await helper.deckFocusInfo('Flubs, the Fool', ['Valakut, the Molten Pinnacle'], 'trend')
    expect(focus.commander.provides.map((t) => t.label)).toEqual(expect.arrayContaining(['Extra Land Drops', 'Discard']))
    expect(focus.commander.needs).toContainEqual(expect.objectContaining({ label: 'Hellbent', plain: 'Empty hand' }))
    expect(focus.anchors[0].links).toContain(
      'Flubs, the Fool lets you play extra lands each turn, which puts extra lands onto the battlefield — Valakut, the Molten Pinnacle triggers whenever a land enters under your control.'
    )
    expect(focus.anchors[0].conflicts).toEqual([])
  })

  it('suggests Group Slug for Valakut', () => {
    expect(wincons.find((r) => r.id === 'group-slug')?.why).toBe('Valakut, the Molten Pinnacle deals damage on its own.')
  })

  it('drafts a legal 99 within the budget, with Valakut', () => {
    expect(plan.check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(plan.check.cards).toBe(99)
    expect(plan.check.total).toBeLessThanOrEqual(300)
    expect(picked('Valakut, the Molten Pinnacle')).toBeDefined()
  })

  it('leaves out cards that work against Flubs or Valakut', () => {
    expect(picked('Blood Moon')).toBeUndefined()
    const conflicts = plan.check.issues.filter((i) => i.severity === 'warning' && i.card && /turns off|fills your hand/.test(i.message))
    expect(conflicts).toEqual([])
  })

  it('plays mostly Mountains among the basics, for Valakut', () => {
    const basics = plan.draft.picks.filter((p) => p.reason.startsWith('Basic land'))
    const mountains = basics.find((p) => p.name === 'Mountain')?.qty ?? 0
    expect(mountains).toBeGreaterThan(Math.max(...basics.filter((p) => p.name !== 'Mountain').map((p) => p.qty)))
  })
})

/** Cards whose ranks the report lists. */
const WATCH = [
  'Seismic Assault', 'Molten Vortex', 'Glint-Horn Buccaneer', 'Lotus Cobra', 'Crucible of Worlds', 'Ramunap Excavator',
  'Scapeshift', 'Heroic Intervention', 'Swiftfoot Boots', 'Gamble', 'Worldly Tutor', 'Apocalypse', 'Harmonize', 'Blood Moon'
]

/** Markdown report of the plan, the offered cards and the draft. */
function report(plan: DeckPlan, wincons: WinconOption[]): string {
  const eur = (price: number | null) => (price === null ? 'no price' : `€${price.toFixed(2)}`)
  const lines = ['# Flubs, the Fool + Valakut, the Molten Pinnacle', '', '## Win conditions offered', '']
  for (const wincon of wincons) lines.push(`- **${wincon.label}**${wincon.plain ? ` (${wincon.plain})` : ''}: ${wincon.explain}${wincon.why ? ` — ${wincon.why}` : ''}`)
  lines.push('', '## Plan', '')
  for (const slot of plan.template.slots) lines.push(`- **${slot.label}: ${slot.count}** — ${slot.why.join(' ')}`)
  lines.push('', `Eligible: ${plan.pool.eligible.size} · left out: ${JSON.stringify(plan.pool.excluded)} · cheap price €${plan.pool.cheapPrice}`)
  lines.push('', '## Draft', '', `Total ${eur(plan.check.total)} · ${plan.check.cards} cards`, '')
  const { pool } = plan
  const priceOf = (name: string) =>
    [...pool.eligible.values(), ...pool.anchors, ...pool.basics].find((e) => e.card.name === name)?.price ?? null
  for (const slot of plan.template.slots) {
    const picks = plan.draft.picks.filter((p) => p.slot === slot.id)
    lines.push(`### ${slot.label} (${picks.reduce((sum, p) => sum + p.qty, 0)}/${slot.count})`, '')
    for (const pick of picks) lines.push(`- ${pick.qty > 1 ? `${pick.qty} ` : ''}**${pick.name}** ${eur(priceOf(pick.name))} — ${pick.reason}`)
    lines.push('')
  }
  lines.push('## Check', '')
  for (const issue of plan.check.issues) lines.push(`- ${issue.severity}: ${issue.message}`)
  lines.push('', `Short: ${JSON.stringify(plan.draft.short)}`, '', '## Where known cards rank', '')
  for (const name of WATCH) {
    const ranks = pool.groups
      .map(({ slot, ranked }) => [slot.label, ranked.findIndex((r) => r.entry.card.name === name) + 1] as const)
      .filter(([, rank]) => rank > 0)
      .map(([label, rank]) => `${label} #${rank}`)
    const entry = pool.eligible.get(name.toLowerCase())
    lines.push(`- ${name} ${entry ? eur(entry.price) : 'not eligible'}: ${ranks.join(', ') || 'no slot'}`)
  }
  lines.push('', '## Offered per slot', '')
  for (const { slot, ranked } of offeredGroups(plan.pool)) {
    lines.push(`### ${slot.label} — ${ranked.length} offered`, '')
    for (const { entry, score } of ranked) {
      const wincon = slot.wincon ? ` [${winconChoice(slot.wincon).label}]` : ''
      lines.push(`- ${entry.card.name} ${eur(entry.price)} · ${score.toFixed(2)}${wincon}${entry.conflicts.length ? ' ⚠' : ''}`)
      if (slot.id === 'wildcard') lines.push(`  - ${pickReason(entry, slot, pool)}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}
