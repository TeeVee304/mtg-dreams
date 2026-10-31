import { describe, expect, it } from 'vitest'
import { iconTypesOf, piecesOf, rulesParagraphs } from './rulesText'

describe('rules text', () => {
  it('splits words from symbols, hybrid and Phyrexian ones included', () => {
    expect(piecesOf('{2}{W/U}{G/P}')).toEqual([
      { kind: 'symbol', value: '2' },
      { kind: 'symbol', value: 'W/U' },
      { kind: 'symbol', value: 'G/P' }
    ])
    expect(piecesOf('{T}: Add {C}.')).toEqual([
      { kind: 'symbol', value: 'T' },
      { kind: 'text', value: ': Add ' },
      { kind: 'symbol', value: 'C' },
      { kind: 'text', value: '.' }
    ])
    expect(piecesOf('{1} // {3}{R}').map((piece) => piece.value)).toEqual(['1', ' // ', '3', 'R'])
  })

  it('makes one paragraph per line and marks reminder text', () => {
    const paragraphs = rulesParagraphs('Flying\n\nCycling {2} (Pay {2}, discard this card: Draw a card.)')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[1]).toEqual([
      { kind: 'text', value: 'Cycling ' },
      { kind: 'symbol', value: '2' },
      { kind: 'text', value: ' ' },
      { kind: 'text', value: '(Pay ', reminder: true },
      { kind: 'symbol', value: '2', reminder: true },
      { kind: 'text', value: ', discard this card: Draw a card.)', reminder: true }
    ])
  })

  it('reads the card types with an icon from a type line, not its subtypes', () => {
    expect(iconTypesOf('Artifact Creature — Golem')).toEqual(['artifact', 'creature'])
    expect(iconTypesOf('Kindred Instant — Elf')).toEqual(['instant'])
    expect(iconTypesOf('Legendary Enchantment Creature — God')).toEqual(['enchantment', 'creature'])
    expect(iconTypesOf('Battle — Siege')).toEqual([])
    expect(iconTypesOf('Land — Forest Plains')).toEqual(['land'])
  })
})
