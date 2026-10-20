import { describe, expect, it } from 'vitest'
import { parseList } from './decklist'
import { joinMeta, sameMeta, splitMeta, stripMeta, validMeta, withMetaOf } from './listMeta'
import { listColor } from './listColor'
import { upgradeOf } from './listUpgrade'

const FILE = `// Format: Commander
// Colour: Blue
// Commander: Invisible Woman
// Upgrade of: The Fantastic Four
// Upgrade version: Duel
1 Invisible Woman
`

describe('personal list settings', () => {
  it('splits them off, keeping the rest as it is', () => {
    const { text, meta } = splitMeta(FILE)
    expect(text).toBe('// Format: Commander\n// Commander: Invisible Woman\n1 Invisible Woman\n')
    expect(meta).toEqual({ color: 'Blue', upgradeOf: 'The Fantastic Four', upgradeVersion: 'Duel' })
  })

  it('joins them back as headers the list reads', () => {
    const { text, meta } = splitMeta(FILE)
    const lines = parseList(joinMeta(text, meta))
    expect(listColor(lines)).toBe('U')
    expect(upgradeOf(lines)).toBe('The Fantastic Four')
    expect(joinMeta(text, {})).toBe(text)
  })

  it('keeps the first value, as headers are read', () => {
    expect(splitMeta('// Unbuilt: Yes\n// Unbuilt: No\n1 Sol Ring').meta).toEqual({ unbuilt: 'Yes' })
  })

  it('gives edited text back its settings, unless it sets them itself', () => {
    const edited = withMetaOf(stripMeta(FILE) + '1 Sol Ring\n', FILE)
    expect(splitMeta(edited).meta.upgradeOf).toBe('The Fantastic Four')
    expect(splitMeta(withMetaOf('// Color: Red\n1 Sol Ring', FILE)).meta.color).toBe('Red')
  })

  it('compares and validates settings', () => {
    expect(sameMeta({ color: 'Blue' }, { color: 'Blue', unbuilt: '' })).toBe(true)
    expect(sameMeta({ color: 'Blue' }, {})).toBe(false)
    expect(validMeta({ color: ' Blue ', unbuilt: 3, other: 'x' })).toEqual({ color: 'Blue' })
    expect(validMeta(null)).toEqual({})
  })
})
