import { describe, expect, it } from 'vitest'
import { cardStrength, UNRANKED_STRENGTH } from './cardStrength'

describe('card strength', () => {
  it('falls from 1 for the most-played card, keeping well-played cards apart', () => {
    expect(cardStrength({ edhrecRank: 1 })).toBe(1)
    expect(cardStrength({ edhrecRank: 100 })).toBeCloseTo(0.8, 1)
    expect(cardStrength({ edhrecRank: 1000 })).toBeCloseTo(0.55, 1)
    expect(cardStrength({ edhrecRank: 10_000 })).toBeCloseTo(0.2, 1)
    expect(cardStrength({ edhrecRank: 90_000 })).toBe(0)
  })

  it('treats unranked cards as average, and Game Changers as among the strongest', () => {
    expect(cardStrength({})).toBe(UNRANKED_STRENGTH)
    expect(cardStrength({ edhrecRank: 5000, gameChanger: true })).toBe(0.9)
    expect(cardStrength({ edhrecRank: 3, gameChanger: true })).toBeGreaterThan(0.9)
  })
})
