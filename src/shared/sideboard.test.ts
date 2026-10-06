import { describe, expect, it } from 'vitest'
import { cardLines, parseList, serializeList } from './decklist'
import { addToBoard, entriesToLines, moveToBoard, sideboardIds } from './sideboard'

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

  it('is disabled on request (commander formats)', () => {
    expect(sideboardIds(parseList('1 Sol Ring\nSideboard\n1 Mana Crypt'), false).size).toBe(0)
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
      { qty: 2, name: 'Pyroblast', foil: false, side: true },
      { qty: 1, name: 'Fireblast', foil: false }
    ])
    expect(serializeList(lines)).toBe('4 Lightning Bolt\n1 Fireblast\n\nSideboard\n2 Pyroblast\n')
    expect(cardLines(lines).every((line) => !('side' in line))).toBe(true)
  })
})
