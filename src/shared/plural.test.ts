import { describe, expect, it } from 'vitest'
import { counted, ordinal, plural } from './plural'

describe('plurals', () => {
  it('use the plural for every count but 1, irregular ones as given', () => {
    expect(counted(1, 'card')).toBe('1 card')
    expect(counted(0, 'card')).toBe('0 cards')
    expect(counted(3, 'copy', 'copies')).toBe('3 copies')
    expect(plural(1, 'copy', 'copies')).toBe('copy')
  })

  it('writes ordinals, the teens with th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st'])
  })
})
