import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkDeck } from '@shared/deckCheck'
import type { BuiltDeck } from '@shared/deckSession'
import { FLUBS_BRIEF } from '@shared/testDecks'
import { setEnvironment, SERVICES } from './environment'
import type { DeckPlan } from './deckHelper'

/**
 * Live test with real Claude: builds the Flubs, the Fool + Valakut deck, then asks for a change.
 * Opt-in, as it spends the tester's Anthropic credit: set `MTG_DREAMS_LIBRARY_DIR` (as for
 * `cardLibrary.flubs.test.ts`) and `ANTHROPIC_API_KEY`. Writes `flubs-claude.md` there with the
 * deck by slot, Claude's reasons, summary and notes, the check, the change, and the tokens used.
 *
 * @packageDocumentation
 */

const DIR = process.env.MTG_DREAMS_LIBRARY_DIR
const KEY = process.env.ANTHROPIC_API_KEY
/** A change a player might ask for. */
const REQUEST = 'Swap two cards for cheap removal that also works well with Flubs.'

describe.skipIf(!DIR || !KEY)('building the Flubs + Valakut deck with Claude', { timeout: 1_200_000 }, () => {
  let plan: DeckPlan
  let built: BuiltDeck
  let changed: BuiltDeck
  const progress: string[] = []

  beforeAll(async () => {
    setEnvironment({ ...SERVICES, userData: DIR!, documents: DIR!, appData: DIR!, trash: async () => undefined, userAgent: 'MTGDreams/live-test' })
    const helper = await import('./deckHelper')
    const { buildWithClaude, changeWithClaude } = await import('./deckBuilder')
    const { createMessage } = await import('./anthropic')
    plan = await helper.planDeck(FLUBS_BRIEF)
    const options = {
      pool: plan.pool,
      draft: plan.draft,
      check: (deck: BuiltDeck['picks']) => checkDeck(deck, plan.context),
      find: plan.context.lookup,
      price: plan.context.price,
      send: (request: Parameters<typeof createMessage>[1]) => createMessage(KEY!, request),
      onProgress: (p: { message: string }) => progress.push(p.message)
    }
    built = await buildWithClaude(options)
    changed = await changeWithClaude(options, built, REQUEST)
    await writeFile(join(DIR!, 'flubs-claude.md'), report(plan, built, changed, progress))
  }, 1_200_000)

  it('builds a legal 99 within the budget, with Valakut and without cards that work against it', () => {
    expect(built.check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(built.check.cards).toBe(99)
    expect(built.check.total).toBeLessThanOrEqual(300)
    expect(built.picks.map((p) => p.name)).toContain('Valakut, the Molten Pinnacle')
    expect(built.picks.map((p) => p.name)).not.toContain('Blood Moon')
    expect(built.picks.every((p) => p.reason.trim().length > 0)).toBe(true)
    expect(built.summary.length).toBeGreaterThan(0)
  })

  it('makes a change the player asks for, still legal', () => {
    expect(changed.check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(changed.check.cards).toBe(99)
    expect(changed.picks.map((p) => p.name)).not.toEqual(built.picks.map((p) => p.name))
  })
})

/** Markdown report of the deck Claude built and changed. */
function report(plan: DeckPlan, built: BuiltDeck, changed: BuiltDeck, progress: string[]): string {
  const priceOf = (name: string) => {
    const card = plan.context.lookup(name)?.card
    const price = card ? plan.context.price(card) : null
    return price === null ? 'no price' : `€${price.toFixed(2)}`
  }
  const usage = (deck: BuiltDeck) =>
    `${deck.usage.calls} requests · ${deck.usage.inputTokens} input tokens (${deck.usage.cacheReadTokens} read from cache, ${deck.usage.cacheWriteTokens} written to it) · ${deck.usage.outputTokens} output tokens`
  const lines = ['# Flubs, the Fool + Valakut, built by Claude', '', built.summary, '', `Total €${built.check.total.toFixed(2)} · ${usage(built)}`, '']
  for (const slot of plan.template.slots) {
    const picks = built.picks.filter((p) => p.slot === slot.id)
    lines.push(`## ${slot.label} (${picks.reduce((sum, p) => sum + p.qty, 0)}/${slot.count})`, '')
    for (const pick of picks) lines.push(`- ${pick.qty > 1 ? `${pick.qty} ` : ''}**${pick.name}** ${priceOf(pick.name)} — ${pick.reason}`)
    lines.push('')
  }
  lines.push('## Notes', '', ...built.notes.map((n) => `- ${n}`), '', '## Check', '', ...built.check.issues.map((i) => `- ${i.severity}: ${i.message}`))
  const before = new Set(built.picks.map((p) => p.name))
  const after = new Set(changed.picks.map((p) => p.name))
  lines.push('', `## Change: “${REQUEST}”`, '', `${usage(changed)}`, '')
  lines.push(...[...before].filter((n) => !after.has(n)).map((n) => `- Out: ${n}`))
  lines.push(...changed.picks.filter((p) => !before.has(p.name)).map((p) => `- In: **${p.name}** ${priceOf(p.name)} — ${p.reason}`))
  lines.push('', ...changed.notes.map((n) => `- Note: ${n}`), '', '## Progress', '', ...progress.map((p) => `- ${p}`))
  return `${lines.join('\n')}\n`
}
