import { describe, expect, it } from 'vitest'
import { leadersLabel, themeTagColors } from './themeTags'

describe('theme tag colors', () => {
  it('gives a theme the color owning it, when the commander has it', () => {
    expect(themeTagColors(['Aggro', 'Burn', 'Primal Surge'], ['R', 'G'])).toEqual(['R', 'R', 'G'])
    expect(themeTagColors(['Demons', 'Chaos', 'Coin Flip'], ['B', 'R'])).toEqual(['B', 'R', 'R'])
  })

  it('spreads other themes over the colors no tag took yet', () => {
    expect(themeTagColors(['Chaos', 'Coin Flip', 'Voltron'], ['U', 'R'])).toEqual(['R', 'R', 'U'])
    expect(themeTagColors(['Tokens', 'Spellslinger', 'Defenders'], ['W', 'U', 'R', 'G'])).toEqual(['G', 'U', 'W'])
    expect(themeTagColors(['Donate', 'Group Hug', 'Chaos'], ['W', 'U', 'R'])).toEqual(['U', 'W', 'R'])
  })

  it('keeps to the identity', () => {
    expect(themeTagColors(['Combo', 'Mill', 'Self-Mill'], ['B'])).toEqual(['B', 'B', 'B'])
    expect(themeTagColors(['Artifacts', 'Burn'], ['C'])).toEqual(['C', 'C'])
    expect(themeTagColors(['Artifacts'], [])).toEqual(['C'])
  })
})

describe('leaders label', () => {
  it('names one commander in full, and partners by their short names', () => {
    expect(leadersLabel(['Rakdos, the Showstopper'])).toBe('Rakdos, the Showstopper')
    expect(leadersLabel(['Okaun, Eye of Chaos', 'Zndrsplt, Eye of Wisdom'])).toBe('Okaun & Zndrsplt')
    expect(leadersLabel(['Tymna the Weaver', "Kraum, Ludevic's Opus"])).toBe('Tymna the Weaver & Kraum')
    expect(leadersLabel([])).toBe('')
  })
})
