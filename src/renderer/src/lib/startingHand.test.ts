import { describe, expect, it } from 'vitest'
import { fanPlace, libraryOf, putOnBottom, shuffled, toBottom } from './startingHand'

describe('starting hands', () => {
  it('counts every copy of a card once', () => {
    const bolt = { line: { qty: 2 } }
    const ring = { line: { qty: 1 } }
    expect(libraryOf([bolt, ring])).toEqual([bolt, bolt, ring])
  })

  it('shuffles every card, none lost or added', () => {
    const cards = [1, 2, 3, 4, 5]
    let seed = 0.37
    const result = shuffled(cards, () => (seed = (seed * 9301 + 0.49297) % 1))
    expect([...result].sort()).toEqual(cards)
    expect(cards).toEqual([1, 2, 3, 4, 5])
  })

  it('fans a hand around one point below it: an even arc, the ends lower and turned outward', () => {
    expect(fanPlace(0, 1)).toEqual({ x: 0, y: 0, rotate: 0 })
    expect(fanPlace(3, 7)).toEqual({ x: 0, y: 0, rotate: 0 })
    expect(fanPlace(0, 7)).toEqual({ x: -309, y: 49, rotate: -18 })
    expect(fanPlace(6, 7)).toEqual({ x: 309, y: 49, rotate: 18 })
    // A bigger hand spreads no wider, each card turning less.
    expect(fanPlace(0, 13)).toEqual({ x: -309, y: 49, rotate: -18 })
    expect(fanPlace(1, 13).rotate).toBe(-15)
  })

  it('puts a card from the hand on the bottom of the library', () => {
    expect(putOnBottom(['a', 'b', 'c', 'd'], 1)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('makes the first mulligan free, then puts one card on the bottom per mulligan', () => {
    expect([0, 1, 2, 3].map(toBottom)).toEqual([0, 0, 1, 2])
  })
})
