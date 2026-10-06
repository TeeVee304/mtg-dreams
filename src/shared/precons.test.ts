import { describe, expect, it } from 'vitest'
import { preconEntries, preconListName, simplifyCardName } from './precons'
import type { PreconCard, PreconDeck } from './types'

function card(overrides: Partial<PreconCard>): PreconCard {
  return {
    qty: 1, name: 'Sol Ring', set: 'fdc', collector: '1', foil: false, basic: false, board: 'main', scryfallId: null,
    ...overrides
  }
}

const deck: PreconDeck = {
  fileName: 'CallingAllAngels_FDC',
  name: 'Calling All Angels',
  code: 'FDC',
  type: 'Commander Deck',
  releaseDate: '2026-10-02',
  cards: [
    card({ name: 'Giada, Font of Hope', collector: '4', foil: true, board: 'commander' }),
    card({ name: 'Sol Ring', collector: '1' }),
    card({ name: 'Plains', collector: '300', qty: 12, basic: true }),
    card({ name: 'Sol Ring', set: 'cmm', collector: '410', board: 'side' })
  ]
}

describe('preconEntries', () => {
  it('merges by name per board and drops versions when not keeping exact printings', () => {
    expect(preconEntries(deck, { exact: false, skipBasics: true })).toEqual([
      { qty: 1, name: 'Giada, Font of Hope', foil: false },
      { qty: 1, name: 'Sol Ring', foil: false },
      { qty: 1, name: 'Sol Ring', foil: false, side: true }
    ])
  })

  it('keeps exact printings, foiling and basics on request', () => {
    const entries = preconEntries(deck, { exact: true, skipBasics: false })
    expect(entries).toHaveLength(4)
    expect(entries[0]).toEqual({ qty: 1, name: 'Giada, Font of Hope', set: 'fdc', collector: '4', foil: true })
    expect(entries.find((e) => e.name === 'Plains')?.qty).toBe(12)
  })
})

describe('simplifyCardName', () => {
  it('collapses reversible cards but keeps real double-faced names', () => {
    expect(simplifyCardName('Command Tower // Command Tower')).toBe('Command Tower')
    expect(simplifyCardName('Graveyard Trespasser // Graveyard Glutton')).toBe('Graveyard Trespasser // Graveyard Glutton')
    expect(simplifyCardName('Sol Ring')).toBe('Sol Ring')
  })
})

describe('preconListName', () => {
  it('produces valid Windows file names', () => {
    expect(preconListName('Masters of the Universe: Sold Separately', [])).toBe('Masters of the Universe - Sold Separately')
    expect(preconListName('What? "Why"...', [])).toBe('What Why')
  })

  it('avoids existing names', () => {
    expect(preconListName('Calling All Angels', ['calling all angels', 'Calling All Angels (2)'])).toBe('Calling All Angels (3)')
  })
})
