import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { listBanner, withBanner } from './listBanner'

describe('list banner', () => {
  it('reads the header', () => {
    expect(listBanner(parseList('// Banner: Lightning Bolt\n4 Lightning Bolt'))).toBe('Lightning Bolt')
    expect(listBanner(parseList('// Banner:\n4 Lightning Bolt'))).toBeNull()
    expect(listBanner(parseList('4 Lightning Bolt'))).toBeNull()
  })

  it('writes it before the cards, and removes it', () => {
    const lines = withBanner(parseList('// Format: Modern\n4 Lightning Bolt'), 'Lightning Bolt')
    expect(serializeList(lines)).toBe('// Format: Modern\n// Banner: Lightning Bolt\n4 Lightning Bolt\n')
    expect(serializeList(withBanner(lines, null))).toBe('// Format: Modern\n4 Lightning Bolt\n')
  })
})
