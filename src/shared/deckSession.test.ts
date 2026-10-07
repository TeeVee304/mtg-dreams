import { describe, expect, it } from 'vitest'
import { checkDeck } from './deckCheck'
import { draftDeck } from './deckDraft'
import { changeDeck, completeDeck, handedIn, plannedPicks, readDeckSnapshot, repairDeck } from './deckSession'
import { BRIEF, setUp } from './testDecks'

const { pool, context } = setUp(BRIEF)
const draft = draftDeck(pool)
const picks = handedIn(draft.picks, pool)
const total = (deck: Array<{ qty: number }>) => deck.reduce((sum, p) => sum + p.qty, 0)
const errors = (deck: Parameters<typeof checkDeck>[0]) => checkDeck(deck, context).issues.filter((i) => i.severity === 'error')

describe('what Claude is asked to pick', () => {
  it('counts spells and nonbasic lands, less the key cards that fill some', () => {
    expect(plannedPicks(pool)).toEqual({ spells: 59, nonbasicLands: 17 })
  })
})

describe('completing a handed-in deck', () => {
  it('adds the key cards and basic lands to reach 99', () => {
    const { deck, problems } = completeDeck(picks, pool)
    expect(problems).toEqual([])
    expect(total(deck)).toBe(99)
    expect(deck[0]).toMatchObject({ name: 'Valakut, the Molten Pinnacle', slot: 'land' })
    expect(deck.at(-1)?.reason).toMatch(/^Basic land\./)
    expect(errors(deck)).toEqual([])
  })

  it('keeps Claude’s reason for a key card it lists, and drops basic lands it picks', () => {
    const { deck } = completeDeck(
      [{ name: 'Valakut, the Molten Pinnacle', slot: 'land', reason: 'Burns a player every time a Mountain enters.' }, { name: 'Mountain', slot: 'land', reason: 'x' }, ...picks],
      pool
    )
    expect(deck.filter((p) => p.name === 'Valakut, the Molten Pinnacle')).toEqual([
      { name: 'Valakut, the Molten Pinnacle', qty: 1, slot: 'land', reason: 'Your key card. Burns a player every time a Mountain enters.' }
    ])
    expect(total(deck)).toBe(99)
  })

  it('reports a card picked twice, and more than 99 cards', () => {
    expect(completeDeck([picks[0], picks[0]], pool).problems).toEqual([`${picks[0].name} is picked twice; Commander allows one copy.`])
    const tooMany = [...picks, ...Array.from({ length: 30 }, (_, i) => ({ name: `Bear ${i + 1}`, slot: 'theme' as const, reason: 'x' }))]
    expect(completeDeck(tooMany, pool).problems).toEqual([`That's ${tooMany.length + 1} cards before basic lands; the deck holds 99.`])
  })
})

describe('changing a deck', () => {
  it('swaps cards and adjusts basic lands to keep 99', () => {
    const out = picks.find((p) => p.slot === 'theme')!
    const { deck, problems } = changeDeck(draft.picks, [out.name], [{ name: 'Bear 1', slot: 'theme', reason: 'A body.' }, { name: 'Bear 2', slot: 'theme', reason: 'Another.' }], pool)
    expect(problems).toEqual([])
    expect(deck.map((p) => p.name)).not.toContain(out.name)
    expect(deck.map((p) => p.name)).toEqual(expect.arrayContaining(['Bear 1', 'Bear 2']))
    expect(total(deck)).toBe(99)
  })

  it('refuses to remove key cards or missing cards, or to add cards already in', () => {
    const { problems } = changeDeck(draft.picks, ['Valakut, the Molten Pinnacle', 'Bear 3'], [{ name: picks[0].name, slot: 'theme', reason: 'x' }], pool)
    expect(problems).toEqual([
      "Valakut, the Molten Pinnacle is one of the player's key cards and stays in the deck.",
      "Bear 3 isn't in the deck.",
      `${picks[0].name} is already in the deck.`
    ])
  })
})

describe('repairing a deck Claude couldn’t get right', () => {
  it('drops the cards with errors and fills their places from the app’s draft', () => {
    const bad = [...picks.slice(2), { name: 'Path to Exile', slot: 'removal' as const, reason: 'x' }, { name: 'Pricey Engine', slot: 'ramp' as const, reason: 'x' }]
    const deck = completeDeck(bad, pool).deck
    const repaired = repairDeck(bad, checkDeck(deck, context), draft, pool)
    expect(repaired.dropped).toEqual(['Path to Exile', 'Pricey Engine'])
    expect(repaired.added).toEqual(picks.slice(0, 2).map((p) => p.name))
    expect(errors(repaired.deck)).toEqual([])
  })
})

describe('reading a deck from the window', () => {
  it('accepts a list of cards with slots and reasons', () => {
    expect(readDeckSnapshot({ picks: [{ name: ' Mountain ', qty: 14, slot: 'land', reason: 'Basic land.' }], summary: 'Burn.' })).toEqual({
      picks: [{ name: 'Mountain', qty: 14, slot: 'land', reason: 'Basic land.' }],
      summary: 'Burn.'
    })
  })

  it('rejects anything else', () => {
    for (const raw of [null, { picks: 'x' }, { picks: [{ name: 'A', qty: 0, slot: 'land', reason: '' }] }, { picks: [{ name: '', qty: 1, slot: 'x', reason: '' }] }]) {
      expect(() => readDeckSnapshot(raw)).toThrow('Invalid deck.')
    }
  })
})
