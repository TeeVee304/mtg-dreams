import { describe, expect, it } from 'vitest'
import { isPriceBasis, pick, priceBasisLabel, priceOf, resolveLine, sortPrintings } from './pricing'
import type { Printing } from './types'

function printing(overrides: Partial<Printing>): Printing {
  return {
    id: `${overrides.set}-${overrides.collectorNumber}`,
    name: 'Lightning Bolt',
    set: 'm11',
    setName: 'Magic 2011',
    collectorNumber: '1',
    rarity: 'common',
    releasedAt: '2010-07-16',
    lang: 'en',
    finishes: ['nonfoil', 'foil'],
    cardmarketId: null,
    price: {},
    priceFoil: {},
    imageSmall: null,
    imageNormal: null,
    imageBack: null,
    cardmarketUrl: null,
    labels: [],
    autoEligible: true,
    ...overrides
  }
}

const m11 = printing({ set: 'm11', collectorNumber: '149', price: { trend: 1.27, low: 0.3 }, priceFoil: { trend: 4.57 } })
const a25 = printing({
  set: 'a25',
  collectorNumber: '141',
  price: { trend: 1.19, low: 0.5, avg30: 1.4 },
  priceFoil: { trend: 3.78 },
  releasedAt: '2018-03-16'
})
const foilOnly = printing({ set: 'pd2', collectorNumber: '17', finishes: ['foil'], priceFoil: { trend: 1.1 } })
const gold = printing({ set: 'wc97', collectorNumber: '1', price: { trend: 0.5 }, autoEligible: false })
const unpriced = printing({ set: 'plst', collectorNumber: 'CLB-187', finishes: ['nonfoil'] })
const all = [m11, a25, foilOnly, gold, unpriced]

describe('price basis', () => {
  it('uses the chosen price, or the trend when that one is missing', () => {
    expect(pick({ trend: 2, low: 1, avg30: 3 }, 'low')).toBe(1)
    expect(pick({ trend: 2 }, 'avg30')).toBe(2)
    expect(pick({}, 'trend')).toBeNull()
  })

  it('recognises and names the bases', () => {
    expect(isPriceBasis('avg30')).toBe(true)
    expect(isPriceBasis('avg7')).toBe(false)
    expect(priceBasisLabel('low')).toBe('Lowest listing')
  })
})

describe('priceOf', () => {
  it('uses the foil price for foil-only printings', () => {
    expect(priceOf(foilOnly, false, 'trend')).toBe(1.1)
    expect(priceOf(m11, false, 'trend')).toBe(1.27)
    expect(priceOf(m11, true, 'trend')).toBe(4.57)
  })
})

describe('resolveLine', () => {
  it('picks the cheapest eligible printing when no version is given', () => {
    const r = resolveLine({ foil: false }, all, 'trend')
    expect(r.printing?.set).toBe('pd2')
    expect(r.unitPrice).toBe(1.1)
    expect(r.pinned).toBe(false)
  })

  it('can pick a different printing on another price basis', () => {
    expect(resolveLine({ foil: false }, [m11, a25], 'trend').printing?.set).toBe('a25')
    expect(resolveLine({ foil: false }, [m11, a25], 'low')).toMatchObject({ unitPrice: 0.3, printing: { set: 'm11' } })
    expect(resolveLine({ foil: false }, [m11, a25], 'avg30')).toMatchObject({ unitPrice: 1.27, printing: { set: 'm11' } })
  })

  it('ignores gold-bordered / memorabilia printings for "cheapest"', () => {
    expect(resolveLine({ foil: false }, [gold, m11], 'trend').printing?.set).toBe('m11')
  })

  it('respects foil when picking the cheapest', () => {
    expect(resolveLine({ foil: true }, [m11, a25], 'trend').printing?.set).toBe('a25')
  })

  it('honours a pinned set and collector number', () => {
    const r = resolveLine({ set: 'm11', collector: '149', foil: true }, all, 'trend')
    expect(r).toMatchObject({ unitPrice: 4.57, pinned: true, pinMissing: false })
    expect(r.printing?.set).toBe('m11')
  })

  it('falls back to the cheapest in the set when the collector tag does not match', () => {
    const word = resolveLine({ set: 'm11', collector: 'borderless', foil: false }, all, 'trend')
    expect(word).toMatchObject({ collectorMissing: false })
    expect(word.printing?.collectorNumber).toBe('149')
    expect(resolveLine({ set: 'm11', collector: '999', foil: false }, all, 'trend')).toMatchObject({ collectorMissing: true })
  })

  it('reports pins that Scryfall does not know', () => {
    expect(resolveLine({ set: 'xyz', foil: false }, all, 'trend')).toMatchObject({ printing: null, pinMissing: true })
  })
})

describe('sortPrintings', () => {
  it('sorts by price with unpriced printings last', () => {
    expect(sortPrintings(all, false, 'trend').map((p) => p.set)).toEqual(['wc97', 'pd2', 'a25', 'm11', 'plst'])
    expect(sortPrintings(all, false, 'low').map((p) => p.set)).toEqual(['m11', 'a25', 'wc97', 'pd2', 'plst'])
  })
})
