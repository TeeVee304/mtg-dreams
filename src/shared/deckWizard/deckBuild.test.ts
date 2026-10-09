import { describe, expect, it } from 'vitest'
import { checkDeck, type CheckContext, type CheckedPick } from './deckCheck'
import { draftDeck, draftNotes, draftSummary, nextBest } from './deckDraft'
import { nameKey } from '../decklist'
import { offeredGroups, type CandidatePool } from './deckPool'
import { testCards } from './testCards'
import { BRIEF, setUp } from './testDecks'

const names = (pool: CandidatePool, slot: string) => pool.groups.find((g) => g.slot.id === slot)!.ranked.map((r) => r.entry.card.name)

describe('the candidate pool', () => {
  const { pool } = setUp(BRIEF)

  it('keeps cards the deck may play: legal, in its colors, within the limit per card, not avoided', () => {
    for (const name of ['Rest in Peace', 'Path to Exile', 'Pricey Engine', 'Exploration', 'Flubs, the Fool', 'Valakut, the Molten Pinnacle', 'Ferris Wheel']) {
      expect(pool.eligible.has(nameKey(name)), name).toBe(false)
    }
    expect(pool.excluded).toEqual({ overCap: 1, unpriced: 0, avoided: 1, bracket: 1 })
    expect(pool.basics.map((b) => b.card.name).sort()).toEqual(['Forest', 'Island', 'Mountain'])
  })

  it('ranks each slot by its job first, then by connections', () => {
    expect(names(pool, 'wincon:group-slug').slice(0, 4)).toEqual(expect.arrayContaining(['Akoum Hellkite', 'Glint-Horn Buccaneer', 'Seismic Assault']))
    expect(names(pool, 'wincon:group-slug')).toContain('Ember 1')
    expect(names(pool, 'removal')[0]).not.toMatch(/^Bolt/)
    expect(names(pool, 'protection').slice(0, 2)).toContain('Heroic Intervention')
    expect(names(pool, 'land')).toContain('Ridge 1')
    expect(names(pool, 'theme')).not.toContain('Bear 1')
  })

  it('ranks cards that work against the key cards last', () => {
    const cardAdvantage = names(pool, 'card-advantage')
    expect(cardAdvantage.indexOf('Harmonize')).toBeGreaterThan(cardAdvantage.indexOf('Impulse 1'))
  })

  it('offers each card once, with enough to choose from', () => {
    const offered = offeredGroups(pool)
    const all = offered.flatMap((g) => g.ranked.map((r) => r.entry.card.name))
    expect(new Set(all).size).toBe(all.length)
    expect(offered.find((g) => g.slot.id === 'wincon:group-slug')!.ranked.length).toBeGreaterThanOrEqual(15)
  })
})

describe('drafting the 99', () => {
  const { pool, context } = setUp(BRIEF)
  const draft = draftDeck(pool)
  const check = checkDeck(draft.picks, context)
  const picked = (name: string) => draft.picks.find((p) => p.name === name)

  it('drafts a legal 99 within the budget, with the key card and the pet card', () => {
    expect(check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(check.cards).toBe(99)
    expect(check.total).toBeLessThanOrEqual(200)
    expect(picked('Valakut, the Molten Pinnacle')?.reason).toMatch(/^Your key card\./)
    expect(picked('Crucible of Worlds')?.reason).toMatch(/^One of your pet cards\./)
  })

  it('leaves out cards that work against the key cards, cards with no job, and avoided cards', () => {
    for (const name of ['Blood Moon', 'Harmonize', 'Apocalypse', 'Bear 1', 'Exploration']) expect(picked(name), name).toBeUndefined()
  })

  it('fills the plan, explaining each pick', () => {
    // The made-up cards connect in few unusual ways, so wildcards may come up short.
    expect(draft.short.filter((gap) => gap.slot !== 'wildcard'), JSON.stringify(draft.short)).toEqual([])
    expect(check.slots.land).toBe(40)
    expect(draft.picks.filter((p) => p.slot === 'card-advantage').every((p) => p.name.startsWith('Impulse'))).toBe(true)
    expect(picked('Seismic Assault')).toMatchObject({ slot: 'wincon:group-slug' })
    expect(picked('Seismic Assault')?.reason).toBe(
      'Group Slug: “Discard a land card: This enchantment deals 2 damage to any target.” Seismic Assault helps you empty your hand — Flubs, the Fool wants your hand empty.'
    )
  })

  it('makes most basic lands Mountains, for Valakut', () => {
    const basics = draft.picks.filter((p) => p.reason.startsWith('Basic land'))
    expect(basics[0]).toMatchObject({ name: 'Mountain' })
    expect(basics[0].reason).toBe('Basic land. Valakut, the Molten Pinnacle counts your Mountains, so more of the basics are Mountains.')
  })

  it('stays within a tight budget', () => {
    const tight = setUp({ ...BRIEF, budget: { ...BRIEF.budget, total: 40 } })
    const result = checkDeck(draftDeck(tight.pool).picks, tight.context)
    expect(result.total).toBeLessThanOrEqual(40)
    expect(result.cards).toBe(99)
  })

  it('fills with basic lands when the pool runs out, saying which slots came up short', () => {
    const small = setUp(BRIEF, testCards())
    const result = draftDeck(small.pool)
    expect(result.picks.reduce((sum, p) => sum + p.qty, 0)).toBe(99)
    expect(result.short.length).toBeGreaterThan(0)
  })
})

describe('the built deck', () => {
  const { pool } = setUp(BRIEF)
  const draft = draftDeck(pool)
  const inDeck = draft.picks.map((p) => p.name)

  it('says how the deck plays, from the answers', () => {
    expect(draftSummary(pool)).toBe(
      'A Bracket 2 · Core Midrange deck led by Flubs. It does more of what Flubs does best, Landfall, with cards that do it too and cards that reward it. ' +
        'It wins with Group Slug. A balance of threats and answers that adapts to the table and grinds out value. ' +
        'Moderate interaction: a healthy number of answers. MTG Dreams picked every card from its rules text and how widely it’s played: swap any card you don’t like.'
    )
  })

  it('says which parts of the plan came up short', () => {
    expect(draftNotes({ picks: [], short: [{ slot: 'removal', missing: 2 }] })).toEqual([
      'Not enough cards for “Removal” fit your budget, so 2 other cards took their place.'
    ])
  })

  it('swaps a card for the next-best one for its job, skipping cards swapped out before', () => {
    const pick = draft.picks.find((p) => p.slot === 'wincon:group-slug' && !/key card|pet card/.test(p.reason))!
    const next = nextBest(pool, pick, inDeck, [], null)!
    expect(next).toMatchObject({ slot: 'wincon:group-slug', qty: 1 })
    expect(inDeck).not.toContain(next.name)
    expect(next.reason).toMatch(/^Group Slug/)
    expect(nextBest(pool, pick, inDeck, [next.name], null)?.name).not.toBe(next.name)
    expect(nextBest(pool, pick, inDeck, [], 0)).toBeUndefined()
  })
})

describe('checking a proposed deck', () => {
  const { pool, context } = setUp(BRIEF)
  const draft = draftDeck(pool).picks
  const issues = (picks: CheckedPick[], extra: Partial<CheckContext> = {}) =>
    checkDeck(picks, { ...context, ...extra }).issues.map((i) => `${i.severity}: ${i.message}`)
  /** The draft with its first non-key cards replaced. */
  const replacing = (...names: string[]) => {
    const swappable = draft.filter((p) => p.qty === 1 && !/key card|pet card/.test(p.reason))
    const out = new Set(swappable.slice(0, names.length).map((p) => p.name))
    return [...draft.filter((p) => !out.has(p.name)), ...names.map((name) => ({ name, qty: 1, slot: 'theme' as const }))]
  }

  it('rejects cards that are unknown, illegal, off-color, over the limit, avoided or doubled', () => {
    const found = issues(replacing('Not A Card', 'Flubs, the Fool', 'Path to Exile', 'Pricey Engine', 'Exploration', 'Lotus Cobra', 'Lotus Cobra'))
    expect(found).toEqual(
      expect.arrayContaining([
        'error: “Not A Card” isn\'t a card MTG Dreams knows.',
        "error: Flubs, the Fool is your commander, so it doesn't go in the 99.",
        "error: Path to Exile is outside Flubs, the Fool's colors.",
        'error: Pricey Engine costs €25.00, over your €20.00 limit per card.',
        'error: You asked to leave out Exploration.',
        'error: Lotus Cobra: Max 1 copy in Commander.'
      ])
    )
  })

  it('rejects cards that weren’t offered, but not basic lands or the player’s own picks', () => {
    const offered = new Set(offeredGroups(pool).flatMap((g) => g.ranked.map((r) => nameKey(r.entry.card.name))))
    const found = issues(replacing('Bear 1'), { offered })
    expect(found).toContain("error: Bear 1 wasn't among the cards offered for this deck.")
    expect(found.filter((i) => i.startsWith('error'))).toHaveLength(1)
  })

  it('checks the deck size, the budget and the key cards', () => {
    const found = issues(draft.filter((p) => p.name !== 'Valakut, the Molten Pinnacle' && p.name !== 'Crucible of Worlds'), {
      brief: { ...BRIEF, budget: { ...BRIEF.budget, total: 10 } }
    })
    expect(found).toEqual(
      expect.arrayContaining([
        "error: The deck has 97 cards besides the commander; Commander needs exactly 99.",
        expect.stringMatching(/^error: The deck costs €[\d.]+, €[\d.]+ over your €10\.00 budget\.$/),
        "error: Your key card Valakut, the Molten Pinnacle isn't in the deck.",
        "note: Your pet card Crucible of Worlds didn't make it in."
      ])
    )
  })

  it('warns about cards that work against the key cards, and jobs left short', () => {
    expect(issues(replacing('Blood Moon'))).toContain(
      'warning: Blood Moon turns off the abilities of nonbasic lands — Valakut, the Molten Pinnacle is a land with a special ability.'
    )
    const mountains = issues([{ name: 'Mountain', qty: 99, slot: 'land' }])
    expect(mountains).toContain('warning: The deck has 99 lands; the plan calls for 40.')
    expect(mountains).toContain('warning: Only 0 cards for “Removal”; the plan calls for 8.')
    expect(mountains).toContain('warning: Only 0 cards for “Group Slug”; the plan calls for 8.')
  })
})
