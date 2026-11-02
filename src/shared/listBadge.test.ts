import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { listBadge, withBadge } from './listBadge'

describe('list badge shape', () => {
  it('reads the header, any case', () => {
    expect(listBadge(parseList('// Badge: Diamond\n1 Sol Ring'))).toBe('diamond')
    expect(listBadge(parseList('// Badge: hexagon\n1 Sol Ring'))).toBeNull()
    expect(listBadge(parseList('1 Sol Ring'))).toBeNull()
  })

  it('writes it before the cards, and removes it', () => {
    const lines = withBadge(parseList('// Format: Commander\n1 Sol Ring'), 'square')
    expect(serializeList(lines)).toBe('// Format: Commander\n// Badge: square\n1 Sol Ring\n')
    expect(serializeList(withBadge(lines, null))).toBe('// Format: Commander\n1 Sol Ring\n')
  })
})
