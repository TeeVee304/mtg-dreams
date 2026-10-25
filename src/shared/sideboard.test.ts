import { describe, expect, it } from 'vitest'
import { cardLines, parseList, serializeList } from './decklist'
import { addToBoard, boardIds, entriesToLines, maybeboardIds, moveToBoard, sideboardIds, withMaybeboardOf } from './sideboard'

const names = (text: string, side: boolean) => {
  const lines = parseList(text)
  const ids = sideboardIds(lines)
  return cardLines(lines)
    .filter((line) => ids.has(line.id) === side)
    .map((line) => line.name)
}

describe('sideboard sections', () => {
  it('reads Arena, Moxfield and comment headers until the next section', () => {
    const text = 'Deck\n4 Lightning Bolt\n\nSideboard\n2 Pyroblast\n'
    expect(names(text, true)).toEqual(['Pyroblast'])
    expect(names('4 Lightning Bolt\nSIDEBOARD:\n2 Pyroblast\nMaybeboard\n1 Fireblast', true)).toEqual(['Pyroblast'])
    expect(names('4 Lightning Bolt\n// Sideboard\n2 Pyroblast', false)).toEqual(['Lightning Bolt'])
  })

  it('is part of the maybeboard in commander formats, which have no sideboard', () => {
    const lines = parseList('// Format: Commander\n1 Sol Ring\nSideboard\n1 Mana Crypt')
    expect(sideboardIds(lines).size).toBe(0)
    expect([...maybeboardIds(lines)]).toEqual([cardLines(lines)[1].id])
    const added = addToBoard(parseList('// Format: Commander\n1 Sol Ring\n'), { qty: 1, name: 'Mana Crypt', foil: false }, 'side')
    expect(serializeList(added)).toBe('// Format: Commander\n1 Sol Ring\n\nMaybeboard\n1 Mana Crypt\n')
  })

  it('adds to the right board, merging only within it', () => {
    let lines = parseList('4 Lightning Bolt\n')
    lines = addToBoard(lines, { qty: 2, name: 'Pyroblast', foil: false }, 'side')
    expect(serializeList(lines)).toBe('4 Lightning Bolt\n\nSideboard\n2 Pyroblast\n')
    lines = addToBoard(lines, { qty: 1, name: 'Lightning Bolt', foil: false }, 'side')
    lines = addToBoard(lines, { qty: 1, name: 'Lightning Bolt', foil: false }, 'main')
    lines = addToBoard(lines, { qty: 1, name: 'Fireblast', foil: false }, 'main')
    expect(serializeList(lines)).toBe('5 Lightning Bolt\n1 Fireblast\n\nSideboard\n2 Pyroblast\n1 Lightning Bolt\n')
  })

  it('moves lines between boards and drops an empty sideboard header', () => {
    const lines = parseList('4 Lightning Bolt\n\nSideboard\n2 Pyroblast\n')
    const pyroblast = cardLines(lines)[1].id
    const back = moveToBoard(lines, [pyroblast], 'main')
    expect(serializeList(back)).toBe('4 Lightning Bolt\n2 Pyroblast\n')
    const bolt = cardLines(back)[0].id
    expect(serializeList(moveToBoard(back, [bolt], 'side'))).toBe('2 Pyroblast\n\nSideboard\n4 Lightning Bolt\n')
  })

  it('builds lines from entries', () => {
    const lines = entriesToLines([
      { qty: 4, name: 'Lightning Bolt', foil: false },
      { qty: 2, name: 'Pyroblast', foil: false, board: 'side' },
      { qty: 1, name: 'Fireblast', foil: false }
    ])
    expect(serializeList(lines)).toBe('4 Lightning Bolt\n1 Fireblast\n\nSideboard\n2 Pyroblast\n')
    expect(cardLines(lines).every((line) => !('board' in line))).toBe(true)
  })
})

describe('maybeboard sections', () => {
  const boardsOf = (text: string) => {
    const lines = parseList(text)
    const ids = boardIds(lines)
    return cardLines(lines).map((line) => `${ids.get(line.id) ?? 'main'} ${line.name}`)
  }

  it('reads maybeboard headers until the next section, in every format', () => {
    expect(boardsOf('1 Sol Ring\nMaybeboard\n1 Mana Crypt\nSideboard\n1 Pyroblast')).toEqual(['main Sol Ring', 'maybe Mana Crypt', 'side Pyroblast'])
    expect(boardsOf('1 Sol Ring\n// Maybe\n1 Mana Crypt\n\n// Duel in\n1 Mana Vault')).toEqual([
      'main Sol Ring',
      'maybe Mana Crypt',
      'main Mana Vault'
    ])
    expect(maybeboardIds(parseList('1 Sol Ring\nSideboard\n1 Mana Crypt')).size).toBe(0)
  })

  it('adds a section after the sideboard and before the version swaps', () => {
    let lines = parseList('// Duel: On\n1 Sol Ring\n\n// Duel in\n1 Mana Vault\n')
    lines = addToBoard(lines, { qty: 1, name: 'Mana Crypt', foil: false }, 'maybe')
    lines = addToBoard(lines, { qty: 1, name: 'Arcane Signet', foil: false }, 'main')
    expect(serializeList(lines)).toBe('// Duel: On\n1 Sol Ring\n1 Arcane Signet\n\nMaybeboard\n1 Mana Crypt\n\n// Duel in\n1 Mana Vault\n')
    lines = addToBoard(parseList('4 Lightning Bolt\n\nMaybeboard\n1 Fireblast\n'), { qty: 2, name: 'Pyroblast', foil: false }, 'side')
    expect(serializeList(lines)).toBe('4 Lightning Bolt\n\nSideboard\n2 Pyroblast\n\nMaybeboard\n1 Fireblast\n')
  })

  it('moves Cards in and out, dropping the header once empty', () => {
    const lines = parseList('1 Sol Ring\n\nMaybeboard\n1 Mana Crypt\n')
    const crypt = cardLines(lines)[1].id
    const promoted = moveToBoard(lines, [crypt], 'main')
    expect(serializeList(promoted)).toBe('1 Sol Ring\n1 Mana Crypt\n')
    expect(serializeList(moveToBoard(promoted, [cardLines(promoted)[0].id], 'maybe'))).toBe('1 Mana Crypt\n\nMaybeboard\n1 Sol Ring\n')
  })

  it("adds another list's maybeboard Cards it lacks", () => {
    const lines = withMaybeboardOf(parseList('1 Sol Ring\n\nMaybeboard\n1 Mana Crypt\n'), parseList('1 Sol Ring\nMaybeboard\n1 Mana Crypt\n1 Mana Vault'))
    expect(serializeList(lines)).toBe('1 Sol Ring\n\nMaybeboard\n1 Mana Crypt\n1 Mana Vault\n')
  })
})
