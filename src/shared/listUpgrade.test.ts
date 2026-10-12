import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { appliedUpgrade, upgradeOf, upgradeTarget, withUpgradeOf } from './listUpgrade'

describe('list upgrade', () => {
  it('reads, sets and removes the header', () => {
    expect(upgradeOf(parseList('//upgrade  of: Elves\n1 Sol Ring'))).toBe('Elves')
    expect(upgradeOf(parseList('1 Sol Ring'))).toBeNull()
    const lines = withUpgradeOf(parseList('// Upgrade of: Elves\n1 Sol Ring'), 'Goblins')
    expect(serializeList(lines)).toBe('// Upgrade of: Goblins\n1 Sol Ring\n')
    expect(serializeList(withUpgradeOf(lines, null))).toBe('1 Sol Ring\n')
  })

  it('finds the deck a wishlist upgrades', () => {
    const lists = [
      { kind: 'deck' as const, name: 'Elves' },
      { kind: 'wishlist' as const, name: 'Goblins' }
    ]
    const wishlist = (text: string) => ({ kind: 'wishlist' as const, lines: parseList(text) })
    expect(upgradeTarget(wishlist('// Upgrade of: ELVES'), lists)).toBe(lists[0])
    expect(upgradeTarget(wishlist('// Upgrade of: Goblins'), lists)).toBeNull()
    expect(upgradeTarget(wishlist('1 Sol Ring'), lists)).toBeNull()
    expect(upgradeTarget({ kind: 'deck', lines: parseList('// Upgrade of: Elves') }, lists)).toBeNull()
  })

  it('applies to its deck without its upgrade header, in the deck color', () => {
    const upgrade = parseList('// Upgrade of: Elves\n// Color: Red\n1 Sol Ring')
    expect(serializeList(appliedUpgrade(upgrade, parseList('// Color: Green\n1 Llanowar Elves')))).toBe('// Color: Green\n1 Sol Ring\n')
    expect(serializeList(appliedUpgrade(upgrade, parseList('1 Llanowar Elves')))).toBe('// Color: Red\n1 Sol Ring\n')
    expect(serializeList(appliedUpgrade(upgrade, parseList('// Unbuilt: Yes\n1 Llanowar Elves')))).toBe('// Unbuilt: Yes\n// Color: Red\n1 Sol Ring\n')
  })
})
