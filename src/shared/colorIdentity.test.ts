import { describe, expect, it } from 'vitest'
import type { ColorFilter } from './cards'
import { colorIdentityName } from './colorIdentity'

const name = (colors: string) => colorIdentityName(colors.split('') as ColorFilter[])

describe('colorIdentityName', () => {
  it('names mono colors and colorless', () => {
    expect(name('B')).toBe('Mono-Black')
    expect(name('C')).toBe('Colorless')
  })

  it('names guilds, shards and wedges, in any order', () => {
    expect(name('GR')).toBe('Gruul')
    expect(name('BW')).toBe('Orzhov')
    expect(name('RUB')).toBe('Grixis')
    expect(name('GWB')).toBe('Abzan')
  })

  it('names four colors after the Nephilim, and all five', () => {
    expect(name('UBRG')).toBe('Glint-Eye')
    expect(name('WUBR')).toBe('Yore-Tiller')
    expect(name('WUBRG')).toBe('WUBRG')
  })

  it('has every identity of one to five colors', () => {
    const colors: ColorFilter[] = ['W', 'U', 'B', 'R', 'G']
    for (let mask = 1; mask < 32; mask++) {
      expect(colorIdentityName(colors.filter((_, i) => mask & (1 << i)))).not.toBeNull()
    }
  })

  it('has no name for no colors', () => {
    expect(colorIdentityName([])).toBeNull()
  })
})
