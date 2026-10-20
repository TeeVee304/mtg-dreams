import { describe, expect, it } from 'vitest'
import type { CardLine, PriceBasis, Printing } from '@shared/types'
import type { ValuedCopy } from '../lib/collection'
import { lineKey, priceChange, valueChange } from './history'

const line = (qty: number, extra: Partial<CardLine> = {}): CardLine => ({ kind: 'card', id: 'l1', qty, name: 'Sheoldred, the Apocalypse', foil: false, ...extra })
/** Alert settings: 15% and, unless given, no euro minimum (rises: the same as drops unless given). */
const alert = (priceBasis: PriceBasis, dropAlertMinEur = 0, riseAlertMinEur = dropAlertMinEur) => ({
  priceBasis,
  dropAlertPercent: 15,
  dropAlertMinEur,
  riseAlertMinEur
})
const baselines = { [lineKey(line(1))]: { at: 1000, prices: { trend: 80, low: 60 } } }

describe('wishlist price changes', () => {
  it('flags a card still needed once it is cheaper than the threshold, on the chosen basis', () => {
    expect(priceChange(line(1), 64, 0, alert('trend'), baselines)).toEqual({ direction: 'down', percent: 20, was: 80, since: 1000 })
    expect(priceChange(line(1), 72, 0, alert('trend'), baselines)).toBeNull()
    expect(priceChange(line(1), 50, 0, alert('low'), baselines)?.was).toBe(60)
    expect(priceChange(line(1), 50, 0, alert('avg30'), baselines)).toBeNull()
  })

  it('flags a card still needed once it is more expensive by the same threshold', () => {
    expect(priceChange(line(1), 100, 0, alert('trend'), baselines)).toEqual({ direction: 'up', percent: 25, was: 80, since: 1000 })
    expect(priceChange(line(1), 88, 0, alert('trend'), baselines)).toBeNull()
    expect(priceChange(line(1), 100, 1, alert('trend'), baselines)).toBeNull()
  })

  it('needs the euro minimum too, so cent moves of cheap cards do not count', () => {
    const cheap = { [lineKey(line(1))]: { at: 1000, prices: { trend: 0.03 } } }
    expect(priceChange(line(1), 0.04, 0, alert('trend'), cheap)?.percent).toBe(33)
    expect(priceChange(line(1), 0.04, 0, alert('trend', 0.1), cheap)).toBeNull()
    expect(priceChange(line(1), 0.13, 0, alert('trend', 0.1), cheap)?.direction).toBe('up')
    // Expensive cards still need the percentage: 0,15 € on 80 € is not a change worth flagging.
    expect(priceChange(line(1), 80.15, 0, alert('trend', 0.1), baselines)).toBeNull()
    expect(priceChange(line(1), 64, 0, alert('trend', 0.1), baselines)?.direction).toBe('down')
  })

  it('asks rises for their own, larger euro minimum', () => {
    const euro = { [lineKey(line(1))]: { at: 1000, prices: { trend: 1 } } }
    expect(priceChange(line(1), 1.4, 0, alert('trend', 0.1, 0.5), euro)).toBeNull()
    expect(priceChange(line(1), 1.5, 0, alert('trend', 0.1, 0.5), euro)?.direction).toBe('up')
    expect(priceChange(line(1), 0.8, 0, alert('trend', 0.1, 0.5), euro)?.direction).toBe('down')
  })

  it('ignores owned lines, unknown prices and other versions of the card', () => {
    expect(priceChange(line(1), 10, 1, alert('trend'), baselines)).toBeNull()
    expect(priceChange(line(1), null, 0, alert('trend'), baselines)).toBeNull()
    expect(priceChange(line(1, { foil: true }), 10, 0, alert('trend'), baselines)).toBeNull()
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
    expect(result.change).toBeCloseTo(4 - 5 - 3)
    expect(result.moves).toHaveLength(3)
    expect(result.from).toBe(1)
  })

  it('uses the foil price for a version only printed in foil, and needs two different days', () => {
    expect(valueChange([valued(1, 1, false, ['foil'])], then, latest)!.change).toBeCloseTo(-5)
    expect(valueChange([valued(1, 1)], latest, latest)).toBeNull()
  })
})
