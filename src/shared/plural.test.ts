import { describe, expect, it } from 'vitest'
import { counted, plural } from './plural'

describe('plurals', () => {
  it('use the plural for every count but 1, irregular ones as given', () => {
    expect(counted(1, 'card')).toBe('1 card')
    expect(counted(0, 'card')).toBe('0 cards')
    expect(counted(3, 'copy', 'copies')).toBe('3 copies')
    expect(plural(1, 'copy', 'copies')).toBe('copy')
  })
})
