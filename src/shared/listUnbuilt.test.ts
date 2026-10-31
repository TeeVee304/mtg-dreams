import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { isUnbuilt, withUnbuilt } from './listUnbuilt'

describe('unbuilt decks', () => {
  it('reads the unbuilt header', () => {
    expect(isUnbuilt(parseList('// Unbuilt: Yes\n1 Sol Ring'))).toBe(true)
    expect(isUnbuilt(parseList('//unbuilt:true'))).toBe(true)
    expect(isUnbuilt(parseList('// Unbuilt: No'))).toBe(false)
    expect(isUnbuilt(parseList('1 Sol Ring'))).toBe(false)
  })

  it('is always true of Arena formats, whose Decks hold no paper copies', () => {
    expect(isUnbuilt(parseList('// Format: Alchemy\n1 Sol Ring'))).toBe(true)
    expect(isUnbuilt(parseList('// Format: Standard Brawl\n// Unbuilt: No'))).toBe(true)
    expect(isUnbuilt(parseList('// Format: Standard\n1 Sol Ring'))).toBe(false)
  })

  it('sets and removes the header', () => {
    const lines = withUnbuilt(parseList('1 Sol Ring'), true)
    expect(serializeList(lines)).toBe('// Unbuilt: Yes\n1 Sol Ring\n')
    expect(serializeList(withUnbuilt(lines, false))).toBe('1 Sol Ring\n')
  })
})
