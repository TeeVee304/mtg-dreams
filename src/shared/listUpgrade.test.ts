import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { appliedUpgrade, upgradeOf, upgradeTarget, upgradeVersion, withUpgradeOf } from './listUpgrade'

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

describe('upgrades of a version', () => {
  const deck = parseList('// Format: Commander\n// Duel: On\n1 Sol Ring\n1 Galactus, Devourer of Worlds\n\n// Duel out\n1 Galactus, Devourer of Worlds\n')

  it('name the version they plan, kept when the deck is renamed', () => {
    const lines = withUpgradeOf(parseList('1 Sol Ring'), 'Elves', 'Duel')
    expect(upgradeVersion(lines)).toBe('Duel')
    expect(upgradeVersion(withUpgradeOf(lines, 'Goblins', 'Duel'))).toBe('Duel')
    expect(serializeList(withUpgradeOf(lines, null))).toBe('1 Sol Ring\n')
  })

  it('apply a Duel upgrade as swaps, the deck itself unchanged', () => {
    const upgrade = withUpgradeOf(parseList('1 Sol Ring\n1 Flux Channeler\n'), 'Deck', 'Duel')
    expect(serializeList(appliedUpgrade(upgrade, deck))).toBe(
      '// Format: Commander\n// Duel: On\n1 Sol Ring\n1 Galactus, Devourer of Worlds\n\n// Duel in\n1 Flux Channeler\n\n// Duel out\n1 Galactus, Devourer of Worlds\n'
    )
  })

  it('keep the deck\'s Duel version when the deck itself is upgraded', () => {
    const upgrade = withUpgradeOf(parseList('// Format: Commander\n1 Sol Ring\n1 Galactus, Devourer of Worlds\n1 Arcane Signet\n'), 'Deck')
    expect(serializeList(appliedUpgrade(upgrade, deck))).toBe(
      '// Format: Commander\n// Duel: On\n1 Sol Ring\n1 Galactus, Devourer of Worlds\n1 Arcane Signet\n\n// Duel out\n1 Galactus, Devourer of Worlds\n'
    )
  })

  it('apply an upgrade of a named version as its swaps', () => {
    const named = parseList('// Format: Commander\n// Version: Counters\n1 Sol Ring\n1 Galactus, Devourer of Worlds\n')
    const upgrade = withUpgradeOf(parseList('1 Sol Ring\n1 Hardened Scales\n'), 'Deck', 'Counters')
    expect(serializeList(appliedUpgrade(upgrade, named))).toBe(
      '// Format: Commander\n// Version: Counters\n1 Sol Ring\n1 Galactus, Devourer of Worlds\n\n// Counters in\n1 Hardened Scales\n\n// Counters out\n1 Galactus, Devourer of Worlds\n'
    )
  })
})
