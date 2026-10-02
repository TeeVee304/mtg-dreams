import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { withFormat } from './formats'
import { listColor, withColor } from './listColor'

describe('list color', () => {
  it('reads the color header by label or id', () => {
    expect(listColor(parseList('// Color: Blue\n4 Lightning Bolt'))).toBe('U')
    expect(listColor(parseList('4 Lightning Bolt\n//colour:g'))).toBe('G')
    expect(listColor(parseList('// Color: Purple'))).toBeNull()
    expect(listColor(parseList('4 Lightning Bolt'))).toBeNull()
  })

  it('sets, replaces and removes the header', () => {
    const lines = withColor(parseList('// Color: Red\n4 Lightning Bolt'), 'B')
    expect(serializeList(lines)).toBe('// Color: Black\n4 Lightning Bolt\n')
    expect(serializeList(withColor(lines, null))).toBe('4 Lightning Bolt\n')
  })

  it('survives format changes', () => {
    const lines = withFormat(withColor(parseList('1 Sol Ring'), 'C'), 'commander')
    expect(listColor(lines)).toBe('C')
  })
})
