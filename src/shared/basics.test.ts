import { describe, expect, it } from 'vitest'
import { bundleBasicLines, genericBasic } from './basics'
import { cardLines, parseList } from './decklist'

describe('genericBasic', () => {
  it('covers the five regular basics only', () => {
    expect(genericBasic('island')?.info.typeLine).toBe('Basic Land — Island')
    expect(genericBasic('Forest')?.printing.set).toBe('fdn')
    expect(genericBasic('Wastes')).toBeUndefined()
    expect(genericBasic('Snow-Covered Island')).toBeUndefined()
    expect(genericBasic('Command Tower')).toBeUndefined()
  })
})

describe('bundleBasicLines', () => {
  it('merges every version of a basic into one plain line where it first appears', () => {
    const lines = cardLines(
      parseList('1 Sol Ring\n12 Island <279> [FDC]\n2 Snow-Covered Island\n8 Island (F)\n1 Arcane Signet\n1 island')
    )
    const bundled = bundleBasicLines(lines)
    expect(bundled.map(({ line }) => `${line.qty} ${line.name}`)).toEqual([
      '1 Sol Ring',
      '21 Island',
      '2 Snow-Covered Island',
      '1 Arcane Signet'
    ])
    const island = bundled[1]
    expect(island.line.set).toBeUndefined()
    expect(island.line.collector).toBeUndefined()
    expect(island.line.foil).toBe(false)
    expect(island.bundledIds).toEqual([lines[1].id, lines[3].id, lines[5].id])
    expect(bundled[0].bundledIds).toBeUndefined()
  })
})
