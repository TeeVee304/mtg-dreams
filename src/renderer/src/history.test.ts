import { describe, expect, it } from 'vitest'
import type { CardLine, Printing } from '../../shared/types'
import type { ValuedCopy } from './collection'
import { lineKey, priceDrop, valueChange } from './history'

const line = (qty: number, extra: Partial<CardLine> = {}): CardLine => ({ kind: 'card', id: 'l1', qty, name: 'Sheoldred, the Apocalypse', foil: false, ...extra })
const baselines = { [lineKey(line(1))]: { at: 1000, prices: { trend: 80, low: 60 } } }

describe('wishlist price drops', () => {
  it('flags a card still needed once it is cheaper than the threshold, on the chosen basis', () => {
    expect(priceDrop(line(1), 64, 0, 'trend', 15, baselines)).toEqual({ percent: 20, was: 80, since: 1000 })
    expect(priceDrop(line(1), 72, 0, 'trend', 15, baselines)).toBeNull() // only 10% cheaper
    expect(priceDrop(line(1), 50, 0, 'low', 15, baselines)?.was).toBe(60)
    expect(priceDrop(line(1), 50, 0, 'avg30', 15, baselines)).toBeNull() // no baseline on that basis
  })

  it('ignores owned lines, unknown prices and other versions of the card', () => {
    expect(priceDrop(line(1), 10, 1, 'trend', 15, baselines)).toBeNull()
    expect(priceDrop(line(1), null, 0, 'trend', 15, baselines)).toBeNull()
    expect(priceDrop(line(1, { foil: true }), 10, 0, 'trend', 15, baselines)).toBeNull()
  })
})

const printing = (cardmarketId: number, finishes = ['nonfoil', 'foil']) => ({ cardmarketId, finishes }) as unknown as Printing
const valued = (id: number, qty: number, foil = false, finishes?: string[]): ValuedCopy => ({
  name: `Card ${id}`,
  copy: { qty, foil },
  qty,
  unit: 0,
  printing: printing(id, finishes)
})

describe('inventory value change', () => {
  const then = { date: 1, prices: { 1: [10, 30] as [number, number], 2: [5, 0] as [number, number] } }
  const latest = { date: 8, prices: { 1: [12, 25] as [number, number], 2: [4, 0] as [number, number], 3: [9, 0] as [number, number] } }

  it('adds up price moves of the copies owned, in their finish', () => {
    const result = valueChange([valued(1, 2), valued(1, 1, true), valued(2, 3), valued(3, 1)], then, latest)!
    // +2×2 non-foil, −5 foil, −1×3; card 3 has no earlier price and is left out.
    expect(result.change).toBeCloseTo(4 - 5 - 3)
    expect(result.moves).toHaveLength(3)
    expect(result.from).toBe(1)
  })

  it('uses the foil price for a version only printed in foil, and needs two different days', () => {
    expect(valueChange([valued(1, 1, false, ['foil'])], then, latest)!.change).toBeCloseTo(-5)
    expect(valueChange([valued(1, 1)], latest, latest)).toBeNull()
  })
})
