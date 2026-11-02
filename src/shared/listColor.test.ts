import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { withFormat } from './formats'
import { listColor, listPalette, withColor, withPalette } from './listColor'

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

  it('reads the first color of an identity as the theme', () => {
    expect(listColor(parseList('// Color: Azorius'))).toBe('W')
  })

  it('reads palettes from the palette header alone, by identity name', () => {
    expect(listPalette(parseList('// Palette: Azorius'))).toBe('WU')
    expect(listPalette(parseList('// Palette: mono-green'))).toBe('G')
    expect(listPalette(parseList('// Palette: Colorless'))).toBe('C')
    expect(listPalette(parseList('// Palette: Purple'))).toBeNull()
    // A list's accent color leaves its palette to its identity.
    expect(listPalette(parseList('// Color: Red\n// Color: Gruul'))).toBeNull()
    expect(listPalette(parseList('4 Lightning Bolt'))).toBeNull()
  })

  it('writes a palette by its identity name', () => {
    expect(serializeList(withPalette(parseList('1 Sol Ring'), 'UBR'))).toBe('// Palette: Grixis\n1 Sol Ring\n')
    expect(serializeList(withPalette(parseList('// Color: Red\n// Palette: Grixis\n1 Sol Ring'), null))).toBe('// Color: Red\n1 Sol Ring\n')
  })

  it('survives format changes', () => {
    const lines = withFormat(withColor(parseList('1 Sol Ring'), 'C'), 'commander')
    expect(listColor(lines)).toBe('C')
  })
})
