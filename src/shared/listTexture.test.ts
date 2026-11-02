import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { listTexture, withTexture } from './listTexture'
import { listTypeface, withTypeface } from './listTypeface'

describe('list banner texture', () => {
  it('reads the header, any case; none by default', () => {
    expect(listTexture(parseList('// Texture: Crosshatch\n1 Sol Ring'))).toBe('crosshatch')
    expect(listTexture(parseList('// Texture: none\n1 Sol Ring'))).toBeNull()
    expect(listTexture(parseList('// Texture: linen\n1 Sol Ring'))).toBeNull()
    expect(listTexture(parseList('1 Sol Ring'))).toBeNull()
  })

  it('writes it before the cards, and removes it', () => {
    const lines = withTexture(parseList('// Format: Commander\n1 Sol Ring'), 'guilloche')
    expect(serializeList(lines)).toBe('// Format: Commander\n// Texture: guilloche\n1 Sol Ring\n')
    expect(serializeList(withTexture(lines, null))).toBe('// Format: Commander\n1 Sol Ring\n')
  })
})

describe('list typeface', () => {
  it('reads the face by name, any case', () => {
    expect(listTypeface(parseList('// Typeface: im fell english\n1 Sol Ring'))).toBe('gothic')
    expect(listTypeface(parseList('// Typeface: Comic Sans\n1 Sol Ring'))).toBeNull()
    expect(listTypeface(parseList('1 Sol Ring'))).toBeNull()
  })

  it('writes the face by name, and removes it', () => {
    const lines = withTypeface(parseList('// Format: Commander\n1 Sol Ring'), 'brutal')
    expect(serializeList(lines)).toBe('// Format: Commander\n// Typeface: Anton\n1 Sol Ring\n')
    expect(serializeList(withTypeface(lines, null))).toBe('// Format: Commander\n1 Sol Ring\n')
  })
})
