import { describe, expect, it } from 'vitest'
import { combosIn, parseBracketFacts, parseComboSearch } from './combos'

/** A Commander Spellbook variant, trimmed to the fields the app reads. */
const variant = (id: string, names: string[], extra: object = {}) => ({
  id,
  uses: names.map((name) => ({ card: { name }, quantity: 1 })),
  produces: [{ feature: { name: 'Infinite creature tokens with haste' } }],
  description: 'Activate Kiki-Jiki…',
  manaValueNeeded: 9,
  popularity: 28001,
  ...extra
})

describe('Commander Spellbook combos', () => {
  it('reads combos in the list, and those one card away', () => {
    const data = {
      results: {
        included: [variant('618-1537', ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'])],
        almostIncluded: [variant('618-2905', ['Kiki-Jiki, Mirror Breaker', 'Pestermite']), variant('x', ['A', 'B', 'C'])]
      }
    }
    const search = parseComboSearch(data, ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'])
    expect(search?.included).toEqual([
      {
        id: '618-1537',
        cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'],
        results: ['Infinite creature tokens with haste'],
        steps: 'Activate Kiki-Jiki…',
        manaValue: 9,
        popularity: 28001
      }
    ])
    expect(search?.near.map((c) => [c.id, c.missing])).toEqual([['618-2905', ['Pestermite']]])
    expect(parseComboSearch({ detail: 'error' }, [])).toBeNull()
  })

  it('reads the flags the bracket rules need', () => {
    const facts = parseBracketFacts({
      bracketTag: 'R',
      cards: [
        { card: { name: 'Demonic Tutor' }, gameChanger: true, massLandDenial: false, extraTurn: false },
        { card: { name: 'Armageddon' }, gameChanger: false, massLandDenial: true, extraTurn: false },
        { card: { name: 'Time Warp' }, gameChanger: false, massLandDenial: false, extraTurn: true }
      ],
      combos: [
        { combo: variant('a', ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts']), relevant: true, definitelyTwoCard: true, lock: false },
        { combo: variant('b', ['X', 'Y', 'Z']), relevant: false, definitelyTwoCard: false, lock: false }
      ]
    })
    expect(facts).toEqual({
      tag: 'R',
      gameChangers: ['Demonic Tutor'],
      massLandDenial: ['Armageddon'],
      extraTurns: ['Time Warp'],
      combos: [{ cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'], twoCard: true, lock: false, manaValue: 9 }]
    })
  })

  it('finds the combos a list completes, ignoring case and back faces', () => {
    const combos = [{ cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'] }, { cards: ['A', 'B'] }]
    expect(combosIn(combos, ['zealous conscripts', 'Kiki-Jiki, Mirror Breaker // Back', 'A'])).toEqual([combos[0]])
  })
})
