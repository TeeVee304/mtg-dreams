import { describe, expect, it } from 'vitest'
import { saltPage, spellbookCombo } from './brackets'

describe("EDHREC's salt pages", () => {
  const view = (name: string, salt: number) => ({ name, salt, num_decks: 10 })

  it('reads cards at the top level or nested in the first card list', () => {
    expect(saltPage({ cardviews: [view('Stasis', 3.05)], more: 'top/salt-2.json' })).toEqual({ cards: [{ name: 'Stasis', salt: 3.05 }], more: true })
    expect(saltPage({ container: { json_dict: { cardlists: [{ cardviews: [view('Armageddon', 3)] }] } } })).toEqual({
      cards: [{ name: 'Armageddon', salt: 3 }],
      more: false
    })
  })

  it('skips malformed entries and pages', () => {
    expect(saltPage({ cardviews: [{ name: 'No salt' }, view('Winter Orb', 2.9)] }).cards).toEqual([{ name: 'Winter Orb', salt: 2.9 }])
    expect(saltPage(null)).toEqual({ cards: [], more: false })
  })
})

describe("Commander Spellbook's combos", () => {
  const classified = {
    combo: {
      id: '690-3966',
      uses: [
        { card: { name: 'Sanguine Bond' }, zoneLocations: ['B'] },
        { card: { name: 'Exquisite Blood' }, zoneLocations: ['B'] }
      ],
      produces: [
        { feature: { name: 'Infinite lifegain triggers', status: 'C' } },
        { feature: { name: 'Infinite lifeloss', status: 'S' } },
        { feature: { name: 'Infinite lifegain', status: 'S' } }
      ],
      manaValueNeeded: 0
    },
    relevant: true,
    definitelyTwoCard: true,
    lock: false,
    extraTurn: false,
    massLandDenial: false
  }

  it('keeps the pieces, what the combo does on its own first, and its flags', () => {
    expect(spellbookCombo(classified)).toEqual({
      id: '690-3966',
      pieces: [
        { name: 'Sanguine Bond', onBattlefield: true },
        { name: 'Exquisite Blood', onBattlefield: true }
      ],
      manaNeeded: 0,
      results: ['Infinite lifeloss', 'Infinite lifegain'],
      twoCard: true,
      gameEnding: true,
      extraTurns: false,
      landDenial: false
    })
  })

  it('counts a lock as game-ending, and a piece cast from hand as not out yet', () => {
    const lock = spellbookCombo({
      ...classified,
      relevant: false,
      lock: true,
      combo: { ...classified.combo, uses: [{ card: { name: 'A' }, zoneLocations: ['H', 'B'] }] }
    })
    expect(lock).toMatchObject({ gameEnding: true, pieces: [{ name: 'A', onBattlefield: false }] })
    expect(spellbookCombo({ combo: {} })).toBeNull()
  })

  it('counts a combo Commander Spellbook calls arguably two-Card', () => {
    expect(spellbookCombo({ ...classified, definitelyTwoCard: false, arguablyTwoCard: true })?.twoCard).toBe(true)
    expect(spellbookCombo({ ...classified, definitelyTwoCard: false, arguablyTwoCard: false })?.twoCard).toBe(false)
  })
})
