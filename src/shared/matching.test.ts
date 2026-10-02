import { describe, expect, it } from 'vitest'
import { hasNamedCard, printingsOfNamedCard } from './matching'

/** Scryfall-like search results, newest first. */
const results = [
  { name: 'Grave Researcher // Reanimate', oracle_id: 'grave', set: 'soc' },
  { name: 'Reanimate', oracle_id: 'reanimate', set: 'dmr' },
  { name: 'Grave Researcher // Reanimate', oracle_id: 'grave', set: 'soa' },
  { name: 'Reanimate', oracle_id: 'reanimate', set: 'tmp' }
]

describe('printingsOfNamedCard', () => {
  it('prefers the card whose full name matches over a card with a matching face', () => {
    expect(printingsOfNamedCard(results, 'Reanimate').map((c) => c.set)).toEqual(['dmr', 'tmp'])
  })

  it('finds double-faced cards by their front face', () => {
    expect(printingsOfNamedCard(results, 'grave researcher').map((c) => c.set)).toEqual(['soc', 'soa'])
  })

  it('groups printings whose oracle id lives on the faces (reversible cards)', () => {
    const tower = [
      { name: 'Command Tower // Command Tower', card_faces: [{ oracle_id: 'tower' }, { oracle_id: 'tower' }] },
      { name: 'Command Tower', oracle_id: 'tower' },
      { name: 'Commander Tower', oracle_id: 'other' }
    ]
    expect(printingsOfNamedCard(tower, 'Command Tower')).toHaveLength(2)
  })
})

describe('hasNamedCard', () => {
  it('is false when only a printed (flavor) name or back face matched', () => {
    const marvel = [{ name: 'Annie Joins Up', oracle_id: 'annie' }]
    expect(hasNamedCard(marvel, "Franklin's Finality")).toBe(false)
    expect(hasNamedCard(marvel, 'annie joins up')).toBe(true)
    expect(hasNamedCard(results, 'Grave Researcher')).toBe(true)
    expect(hasNamedCard(results, 'Reanimate')).toBe(true)
  })
})
