import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, settingsPatch, validSettings } from './settings'

describe('settings', () => {
  it('keeps valid stored values and defaults the rest', () => {
    expect(validSettings({ theme: 'dark', color: 'teal', dropAlertPercent: 25, sort: 'mana', tradeName: 7 })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      dropAlertPercent: 25,
      sort: 'mana'
    })
  })

  it('validates changes, dropping unknown keys and trimming the trade name', () => {
    expect(settingsPatch({ cardView: 'grid', tradeName: '  Ana ', dataDir: 'C:\\' })).toEqual({ cardView: 'grid', tradeName: 'Ana' })
    expect(settingsPatch(null)).toEqual({})
    expect(() => settingsPatch({ theme: 'neon' })).toThrow('Invalid theme.')
    expect(() => settingsPatch({ tradeName: 'x'.repeat(101) })).toThrow('Invalid name.')
    expect(() => settingsPatch({ dropAlertPercent: 95 })).toThrow('Invalid alert threshold.')
  })
})
