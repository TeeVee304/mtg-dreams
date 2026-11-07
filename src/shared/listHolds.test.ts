import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { holdsCopies, ownHoldsCopies, withHoldsCopies } from './listHolds'

describe('decks holding copies', () => {
  it('follow the setting unless they set their own', () => {
    expect(holdsCopies(parseList('1 Sol Ring'))).toBe(true)
    expect(holdsCopies(parseList('1 Sol Ring'), false)).toBe(false)
    expect(ownHoldsCopies(parseList('1 Sol Ring'))).toBeNull()
    expect(holdsCopies(parseList('// Hold copies: No\n1 Sol Ring'))).toBe(false)
    expect(holdsCopies(parseList('//holds copies:false'))).toBe(false)
    expect(holdsCopies(parseList('// Hold copies: Yes'), false)).toBe(true)
  })

  it('read the old Unbuilt header as holding none', () => {
    expect(holdsCopies(parseList('// Unbuilt: Yes\n1 Sol Ring'))).toBe(false)
    expect(holdsCopies(parseList('//unbuilt:true'))).toBe(false)
    expect(holdsCopies(parseList('// Unbuilt: No'))).toBe(true)
    expect(ownHoldsCopies(parseList('// Unbuilt: No'))).toBeNull()
    expect(holdsCopies(parseList('// Hold copies: Yes\n// Unbuilt: Yes'))).toBe(true)
  })

  it('never hold copies in Arena formats', () => {
    expect(holdsCopies(parseList('// Format: Alchemy\n1 Sol Ring'))).toBe(false)
    expect(holdsCopies(parseList('// Format: Standard Brawl\n// Hold copies: Yes'))).toBe(false)
    expect(holdsCopies(parseList('// Format: Standard\n1 Sol Ring'))).toBe(true)
  })

  it('set and remove the header, dropping the old one', () => {
    const lines = withHoldsCopies(parseList('// Unbuilt: Yes\n1 Sol Ring'), false)
    expect(serializeList(lines)).toBe('// Hold copies: No\n1 Sol Ring\n')
    expect(serializeList(withHoldsCopies(lines, true))).toBe('// Hold copies: Yes\n1 Sol Ring\n')
    expect(serializeList(withHoldsCopies(lines, null))).toBe('1 Sol Ring\n')
    expect(serializeList(withHoldsCopies(parseList('// Unbuilt: Yes\n1 Sol Ring'), true))).toBe('// Hold copies: Yes\n1 Sol Ring\n')
  })
})
