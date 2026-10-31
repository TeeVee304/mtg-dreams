import { describe, expect, it } from 'vitest'
import { arrayOf, cardNames, localizedQuery, numbers, text } from './validate'

describe('checking what the renderer sends', () => {
  it('accepts text, and refuses anything else', () => {
    expect(text('Sol Ring', 'card')).toBe('Sol Ring')
    expect(() => text(1, 'card')).toThrow('Invalid card.')
  })

  it('accepts arrays within their size whose items pass', () => {
    expect(arrayOf([1, 2], (n) => typeof n === 'number', 'numbers', 2)).toEqual([1, 2])
    expect(() => arrayOf([1, 2, 3], () => true, 'numbers', 2)).toThrow('Invalid numbers.')
    expect(() => arrayOf('12', () => true, 'numbers', 2)).toThrow('Invalid numbers.')
  })

  it('checks product numbers and card names', () => {
    expect(numbers([1, -2], 'ids')).toEqual([1, -2])
    expect(() => numbers([1.5], 'ids')).toThrow('Invalid ids.')
    expect(cardNames(['Sol Ring'], 1, 20)).toEqual(['Sol Ring'])
    expect(() => cardNames(['Sol Ring', 'Mox'], 1)).toThrow('Invalid card names.')
    expect(() => cardNames(['x'.repeat(21)], 1, 20)).toThrow('Invalid card names.')
    expect(() => cardNames([7], 1)).toThrow('Invalid card names.')
  })

  it('checks a localized image query: a name, a known language, and an optional printing', () => {
    expect(localizedQuery({ name: 'Sol Ring', lang: 'de' })).toEqual({ name: 'Sol Ring', lang: 'de' })
    expect(localizedQuery({ name: 'Sol Ring', lang: 'ja', set: 'cmm', collector: '1' })).toEqual({ name: 'Sol Ring', lang: 'ja', set: 'cmm', collector: '1' })
    expect(() => localizedQuery({ name: 'Sol Ring', lang: 'en' })).toThrow('Invalid localized image query.')
    expect(() => localizedQuery({ name: 'Sol Ring', lang: 'DE' })).toThrow('Invalid localized image query.')
    expect(() => localizedQuery({ name: '', lang: 'de' })).toThrow('Invalid localized image query.')
    expect(() => localizedQuery({ name: 'Sol Ring', lang: 'de', set: 7 })).toThrow('Invalid localized image query.')
    expect(() => localizedQuery(null)).toThrow('Invalid localized image query.')
  })
})
