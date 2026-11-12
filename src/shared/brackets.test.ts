import { describe, expect, it } from 'vitest'
import {
  bracketFacts,
  bracketFloor,
  cardBreaks,
  deckSalt,
  saltVersus,
  fitsRule,
  floorLabel,
  listBracket,
  NO_CARD_DATA,
  timeCombo,
  withBracket,
  type BracketCardData,
  type BracketCombo,
  type SpellbookCombo
} from './brackets'
import { parseList, serializeList } from './decklist'
import { manaBase, manaTurn } from './manaBase'

const combo = (cards: string[], extra: Partial<BracketCombo> = {}): BracketCombo => ({
  id: cards.join('+'),
  pieces: cards.map((name) => ({ name, onBattlefield: false })),
  manaNeeded: 3,
  results: ['Win the game'],
  twoCard: true,
  gameEnding: true,
  extraTurns: false,
  landDenial: false,
  mana: 3,
  turn: 3,
  early: true,
  ...extra
})

const data = (patch: Partial<BracketCardData> = {}): BracketCardData => ({ landDenial: [], extraTurns: [], salt: {}, ...patch })

describe('bracket facts', () => {
  it('finds the Game Changers, tagged cards and game-ending two-card combos', () => {
    const facts = bracketFacts(
      [{ name: "Thassa's Oracle", gameChanger: true }, { name: 'Armageddon' }, { name: 'Time Warp' }],
      data({ landDenial: ['armageddon'], extraTurns: ['time warp'] }),
      [combo(["Thassa's Oracle", 'Demonic Consultation']), combo(['Basalt Monolith', 'Rings of Brighthearth'], { gameEnding: false })]
    )
    expect(facts.gameChangers).toEqual(["Thassa's Oracle"])
    expect(facts.landDenial).toEqual(['Armageddon'])
    expect(facts.extraTurns).toEqual(['Time Warp'])
    expect(facts.combos?.map((one) => one.id)).toEqual(["Thassa's Oracle+Demonic Consultation"])
  })

  it('lists early combos first, then by the turn they come together', () => {
    const late = combo(['A', 'B'], { early: false, turn: 9 })
    const never = combo(['C', 'D'], { early: false, turn: null })
    const later = combo(['E', 'F'], { early: true, turn: 5 })
    const soon = combo(['G', 'H'], { early: true, turn: 2 })
    expect(bracketFacts([], data(), [late, never, later, soon]).combos?.map((one) => one.id)).toEqual(['G+H', 'E+F', 'A+B', 'C+D'])
  })

  it('leaves combos and tags unchecked while offline', () => {
    const offline = bracketFacts([{ name: 'Armageddon' }], NO_CARD_DATA, null)
    expect(offline.combos).toBeNull()
    expect(offline.tagged).toBe(false)
    expect(fitsRule(offline, 'landDenial', 3)).toBeNull()
    expect(fitsRule(offline, 'extraTurns', 1)).toBeNull()
    expect(bracketFloor(offline)).toBe(1)
  })
})

describe('the bracket rules', () => {
  const facts = (patch: Partial<ReturnType<typeof bracketFacts>>) => ({ ...bracketFacts([], data(), []), ...patch })

  it('allows no Game Changers in 1 and 2, three in 3, any in 4', () => {
    const three = facts({ gameChangers: ['A', 'B', 'C'] })
    expect([1, 2, 3, 4].map((level) => fitsRule(three, 'gameChangers', level as 1))).toEqual([false, false, true, true])
    expect(bracketFloor(three)).toBe(3)
    expect(bracketFloor(facts({ gameChangers: ['A', 'B', 'C', 'D'] }))).toBe(4)
  })

  it('puts mass land denial in 4', () => {
    expect(bracketFloor(facts({ landDenial: ['Armageddon'] }))).toBe(4)
    expect(bracketFloor(facts({ loops: { landDenial: true, extraTurns: false } }))).toBe(4)
  })

  it('allows a few extra turns in 2 and 3, never chained', () => {
    expect(bracketFloor(facts({ extraTurns: ['Time Warp'] }))).toBe(2)
    expect(bracketFloor(facts({ extraTurns: ['A', 'B', 'C'] }))).toBe(2)
    expect(bracketFloor(facts({ extraTurns: ['A', 'B', 'C', 'D'] }))).toBe(4)
    expect(bracketFloor(facts({ loops: { landDenial: false, extraTurns: true } }))).toBe(4)
  })

  it('allows late two-card combos in 3 and early ones in 4', () => {
    expect(bracketFloor(facts({ combos: [combo(['A', 'B'], { early: false })] }))).toBe(3)
    expect(bracketFloor(facts({ combos: [combo(['A', 'B'])] }))).toBe(4)
  })

  it("can't tell a combo-free floor while combos are unchecked", () => {
    const unchecked = facts({ combos: null })
    expect(fitsRule(unchecked, 'combos', 2)).toBeNull()
    expect(bracketFloor(unchecked)).toBe(1)
    expect(floorLabel(1, false)).toBe('1+')
  })

  it('shows the brackets only intent tells apart as a range', () => {
    expect([1, 2, 3, 4, 5].map((level) => floorLabel(level as 1, true))).toEqual(['1–2', '2', '3', '4–5', '4–5'])
  })

  it('names the rule each card breaks at a declared bracket', () => {
    const deck = facts({
      gameChangers: ['Rhystic Study'],
      extraTurns: ['Time Warp'],
      combos: [combo(['Sanguine Bond', 'Exquisite Blood'], { early: false })]
    })
    expect(cardBreaks(deck, 'Rhystic Study', 2)).toBe('gameChangers')
    expect(cardBreaks(deck, 'Rhystic Study', 3)).toBeNull()
    expect(cardBreaks(deck, 'Sanguine Bond', 2)).toBe('combos')
    expect(cardBreaks(deck, 'Sanguine Bond', 3)).toBeNull()
    expect(cardBreaks(deck, 'Time Warp', 1)).toBe('extraTurns')
    expect(cardBreaks(deck, 'Time Warp', 2)).toBeNull()
    expect(cardBreaks(deck, 'Rhystic Study', 4)).toBeNull()
  })
})

describe('combo timing', () => {
  const raw: SpellbookCombo = {
    id: '1',
    pieces: [
      { name: 'Sanguine Bond', onBattlefield: true },
      { name: 'Exquisite Blood', onBattlefield: true }
    ],
    manaNeeded: 0,
    results: ['Infinite lifeloss'],
    twoCard: true,
    gameEnding: true,
    extraTurns: false,
    landDenial: false
  }

  it('adds the cost of the pieces that must be out first', () => {
    const timed = timeCombo(raw, (name) => (name === 'Sanguine Bond' ? 5 : 5), (mana) => mana)
    expect(timed).toMatchObject({ mana: 10, turn: 10, early: false })
    expect(timeCombo({ ...raw, pieces: raw.pieces.map((piece) => ({ ...piece, onBattlefield: false })), manaNeeded: 3 }, () => 5, (mana) => mana)).toMatchObject({
      mana: 3,
      early: true
    })
  })

  it('finds the turn a Deck likely has the mana by', () => {
    const rows = [
      { line: { name: 'Island', qty: 37 }, info: { typeLine: 'Basic Land — Island', manaValue: 0 } },
      { line: { name: 'Spell', qty: 62 }, info: { typeLine: 'Sorcery', manaValue: 3 } }
    ] as Parameters<typeof manaBase>[0]
    const base = manaBase(rows, { deckSize: 100, players: 4 }, 3)
    expect(manaTurn(base, 0)).toBe(1)
    expect(manaTurn(base, 3)).toBe(3)
    expect(manaTurn(base, 10)).toBeGreaterThan(10)
  })
})

describe('the Bracket header', () => {
  it('declares a bracket before the first card, and reads it by number or name', () => {
    const lines = withBracket(parseList('// Format: Commander\n1 Sol Ring'), 3)
    expect(serializeList(lines)).toContain('// Bracket: 3\n1 Sol Ring')
    expect(listBracket(lines)).toBe(3)
    expect(listBracket(parseList('// Bracket: Optimized'))).toBe(4)
    expect(listBracket(withBracket(lines, null))).toBeNull()
    expect(listBracket(parseList('// Bracket: 7'))).toBeNull()
  })
})

describe('salt', () => {
  it('sums every copy and lists the saltiest cards once', () => {
    const salt = deckSalt(['Rhystic Study', 'Cyclonic Rift', 'Island', 'Rhystic Study'], { 'rhystic study': 2.82, 'cyclonic rift': 2.35 })
    expect(salt).toEqual({ total: 8, cards: 4, saltiest: [{ name: 'Rhystic Study', salt: 2.82 }, { name: 'Cyclonic Rift', salt: 2.35 }] })
    expect(deckSalt(['Island'], null)).toBeNull()
  })

  it('compares salt card for card, so a half-built Deck compares fairly', () => {
    const half = { total: 6, cards: 50, saltiest: [] }
    const average = { total: 10, cards: 100, saltiest: [] }
    expect(saltVersus(half, average)).toBe(20)
    expect(saltVersus(average, half)).toBe(-17)
    expect(saltVersus(half, { ...average, total: 0 })).toBeNull()
  })
})
