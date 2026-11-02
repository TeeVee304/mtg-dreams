import { describe, expect, it } from 'vitest'
import { hasIdentityTexture } from './temperaments'

describe('hasIdentityTexture', () => {
  it('is only for mono-color and two-color palettes', () => {
    expect(hasIdentityTexture('W')).toBe(true)
    expect(hasIdentityTexture('UB')).toBe(true)
    expect(hasIdentityTexture('WUB')).toBe(false)
    expect(hasIdentityTexture('WUBRG')).toBe(false)
    expect(hasIdentityTexture('C')).toBe(false)
    expect(hasIdentityTexture(null)).toBe(false)
  })
})
