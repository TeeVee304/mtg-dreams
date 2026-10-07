import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import {
  canLead,
  capEntries,
  colorIdentityIssue,
  commanderIssue,
  copyLimit,
  deckSizeCheck,
  findFormat,
  legalityIssue,
  listCommander,
  listFormat,
  withCommander,
  withFormat,
  withoutMissingCommander
} from './formats'
import type { CardInfo, Printing } from './types'

function card(legalities: Record<string, string>, overrides: Partial<CardInfo> = {}): CardInfo {
  return { name: 'Card', colors: [], colorIdentity: [], typeLine: 'Instant', manaValue: 1, rarity: 'common', legalities, ...overrides }
}

const commander = findFormat('commander')!
const modern = findFormat('modern')!
const vintage = findFormat('vintage')!
const pauperCommander = findFormat('paupercommander')!
const oathbreaker = findFormat('oathbreaker')!

describe('list format header', () => {
  it('reads the format comment by label or id', () => {
    expect(listFormat(parseList('// Format: Commander\n1 Sol Ring'))?.id).toBe('commander')
    expect(listFormat(parseList('1 Sol Ring\n//format:duelcommander'))?.id).toBe('duel')
    expect(listFormat(parseList('// Format: Canadian Highlander\n1 Sol Ring'))).toBeNull()
    expect(listFormat(parseList('1 Sol Ring'))).toBeNull()
  })

  it('replaces or removes the header', () => {
    const lines = parseList('// Format: Modern\n// my notes\n4 Lightning Bolt')
    expect(serializeList(withFormat(lines, 'pioneer'))).toBe('// Format: Pioneer\n// my notes\n4 Lightning Bolt\n')
    expect(serializeList(withFormat(lines, null))).toBe('// my notes\n4 Lightning Bolt\n')
  })
})

describe('commander', () => {
  const deck = '// Format: Commander\n// my notes\n1 Sol Ring\n1 Atraxa, Praetors\' Voice\n1 Mister Fantastic\n'

  it('is stored as a comment below the format, one at a time', () => {
    const lines = withCommander(parseList(deck), "Atraxa, Praetors' Voice")
    expect(serializeList(lines)).toBe(
      "// Format: Commander\n// Commander: Atraxa, Praetors' Voice\n// my notes\n1 Sol Ring\n1 Atraxa, Praetors' Voice\n1 Mister Fantastic\n"
    )
    expect(listCommander(lines)).toBe("Atraxa, Praetors' Voice")
    const changed = withCommander(lines, 'Mister Fantastic')
    expect(listCommander(changed)).toBe('Mister Fantastic')
    expect(serializeList(changed).match(/Commander:/g)).toHaveLength(1)
    expect(serializeList(withCommander(changed, null))).toBe(deck)
    expect(listCommander(parseList(deck))).toBeNull()
  })

  it('reads the Commander heading of Arena and Moxfield exports', () => {
    const arena = parseList('Commander\n1 Mister Fantastic (MSC) 5\n\nDeck\n1 Sol Ring')
    expect(listCommander(arena)).toBe('Mister Fantastic')
    expect(listCommander(parseList('Commander\n\nDeck\n1 Sol Ring'))).toBeNull()
    const chosen = withCommander(arena, 'Sol Ring')
    expect(serializeList(chosen)).toBe('// Commander: Sol Ring\n1 Mister Fantastic <5> [MSC]\n\nDeck\n1 Sol Ring\n')
  })

  it('is dropped by formats without commanders, and when its card is removed', () => {
    const lines = withCommander(parseList(deck), 'Mister Fantastic')
    expect(listCommander(withFormat(lines, 'duel'))).toBe('Mister Fantastic')
    expect(listCommander(withFormat(lines, 'modern'))).toBeNull()
    expect(listCommander(withFormat(lines, null))).toBeNull()
    expect(withoutMissingCommander(lines)).toBe(lines)
    const removed = lines.filter((line) => !(line.kind === 'card' && line.name === 'Mister Fantastic'))
    expect(listCommander(withoutMissingCommander(removed))).toBeNull()
  })

  it('must be able to lead in the format', () => {
    const legend = card({ commander: 'legal' }, { typeLine: 'Legendary Creature — Human Hero', rarity: 'rare' })
    const grist = card({ commander: 'legal' }, { typeLine: 'Legendary Planeswalker — Grist', canBeCommander: true })
    const walker = card({ commander: 'legal' }, { typeLine: 'Legendary Planeswalker — Jace' })
    const elf = card({ paupercommander: 'not_legal' }, { typeLine: 'Creature — Elf', rarity: 'common' })
    const mdfc = card({}, { typeLine: 'Sorcery // Legendary Creature — God' })
    const vehicle = card({}, { typeLine: 'Legendary Artifact — Vehicle' })
    const background = card({}, { typeLine: 'Legendary Enchantment — Background' })
    expect(canLead(commander, legend)).toBe(true)
    expect(canLead(commander, grist)).toBe(true)
    expect(canLead(commander, walker)).toBe(false)
    expect(canLead(commander, mdfc)).toBe(false)
    expect(canLead(commander, vehicle)).toBe(true)
    expect(canLead(commander, background)).toBe(false)
    expect(canLead(commander, card({}, { typeLine: 'Artifact — Vehicle' }))).toBe(false)
    expect(canLead(oathbreaker, walker)).toBe(true)
    expect(canLead(oathbreaker, legend)).toBe(false)
    expect(canLead(pauperCommander, elf)).toBe(false)
    expect(canLead(pauperCommander, elf, [{ rarity: 'uncommon' } as Printing])).toBe(true)
  })

  it('reports commanders that cannot lead, but accepts uncommon-only Pauper commanders', () => {
    const legend = card({ commander: 'legal', paupercommander: 'not_legal' }, { typeLine: 'Legendary Creature — Spirit', rarity: 'uncommon' })
    expect(commanderIssue(commander, legend, [], 1)).toBeNull()
    expect(commanderIssue(pauperCommander, legend, [], 1)).toBeNull()
    expect(legalityIssue(pauperCommander, legend, 1)?.message).toBe('Not legal in Pauper Commander')
    expect(commanderIssue(oathbreaker, legend, [], 1)?.message).toBe("Can't be your commander in Oathbreaker")
    expect(commanderIssue(commander, { ...legend, legalities: { commander: 'banned' } }, [], 1)?.message).toBe('Banned in Commander')
  })
})

describe('legalityIssue', () => {
  it('flags banned and not legal cards', () => {
    expect(legalityIssue(commander, card({ commander: 'banned' }), 1)).toEqual({ severity: 'error', message: 'Banned in Commander' })
    expect(legalityIssue(modern, card({ modern: 'not_legal' }), 1)?.message).toBe('Not legal in Modern')
    expect(legalityIssue(modern, card({}), 1)?.message).toBe('Not legal in Modern')
  })

  it('handles restricted cards', () => {
    expect(legalityIssue(vintage, card({ vintage: 'restricted' }), 1)?.severity).toBe('warning')
    expect(legalityIssue(vintage, card({ vintage: 'restricted' }), 2)?.severity).toBe('error')
  })

  it('enforces copy limits with exceptions', () => {
    expect(legalityIssue(modern, card({ modern: 'legal' }), 4)).toBeNull()
    expect(legalityIssue(modern, card({ modern: 'legal' }), 5)?.message).toBe('Max 4 copies in Modern')
    expect(legalityIssue(commander, card({ commander: 'legal' }), 2)?.message).toBe('Max 1 copy in Commander')
    expect(legalityIssue(commander, card({ commander: 'legal' }, { typeLine: 'Basic Land — Island' }), 30)).toBeNull()
    expect(legalityIssue(commander, card({ commander: 'legal' }, { deckLimit: 'any' }), 40)).toBeNull()
    expect(legalityIssue(commander, card({ commander: 'legal' }, { deckLimit: 7 }), 8)?.message).toBe('Max 7 copies in Commander')
  })
})

describe('colorIdentityIssue', () => {
  const temur = ['G', 'U', 'R']

  it('flags cards with a color outside the commander identity, hybrid and rules-text colors included', () => {
    const leyline = card({ commander: 'legal' }, { name: 'Leyline of the Guildpact', colorIdentity: ['W', 'U', 'B', 'R', 'G'] })
    const wormHarvest = card({ commander: 'legal' }, { name: 'Worm Harvest', colorIdentity: ['B', 'G'] })
    const dakmor = card({ commander: 'legal' }, { name: 'Dakmor Salvage', typeLine: 'Land', colorIdentity: ['B'] })
    for (const outside of [leyline, wormHarvest, dakmor]) {
      expect(colorIdentityIssue(outside, temur)).toEqual({ severity: 'error', message: "Outside your commander's colors" })
    }
  })

  it('accepts cards within the identity and colorless cards', () => {
    expect(colorIdentityIssue(card({}, { colorIdentity: ['U', 'R'] }), temur)).toBeNull()
    expect(colorIdentityIssue(card({}, { colorIdentity: [] }), temur)).toBeNull()
    expect(colorIdentityIssue(card({}, { colorIdentity: [] }), [])).toBeNull()
    expect(colorIdentityIssue(card({}, { colorIdentity: ['G'] }), [])?.severity).toBe('error')
  })
})

describe('copyLimit', () => {
  it('follows the format, restricted status and card exceptions', () => {
    expect(copyLimit(commander, card({ commander: 'legal' }), 'Sol Ring')).toBe(1)
    expect(copyLimit(modern, card({ modern: 'legal' }), 'Lightning Bolt')).toBe(4)
    expect(copyLimit(vintage, card({ vintage: 'restricted' }), 'Brainstorm')).toBe(1)
    expect(copyLimit(commander, card({ commander: 'legal' }, { deckLimit: 'any' }), 'Relentless Rats')).toBe(Infinity)
    expect(copyLimit(commander, card({ commander: 'legal' }, { deckLimit: 7 }), 'Seven Dwarves')).toBe(7)
  })

  it('recognises basic lands even before card data has loaded', () => {
    expect(copyLimit(commander, undefined, 'Swamp')).toBe(Infinity)
    expect(copyLimit(commander, undefined, 'Sol Ring')).toBe(1)
  })
})

describe('capEntries', () => {
  it('skips copies beyond the limit, counting the list and earlier entries', () => {
    const limit = (name: string) => (name === 'Swamp' ? Infinity : 1)
    const inList = (name: string) => (name === 'Sol Ring' ? 1 : 0)
    const result = capEntries(
      [
        { name: 'Sol Ring', qty: 1 },
        { name: 'Arcane Signet', qty: 1 },
        { name: 'arcane signet', qty: 1 },
        { name: 'Swamp', qty: 12 }
      ],
      limit,
      inList
    )
    expect(result.entries).toEqual([
      { name: 'Arcane Signet', qty: 1 },
      { name: 'Swamp', qty: 12 }
    ])
    expect(result.skipped).toBe(2)
  })
})

describe('deckSizeCheck', () => {
  it('wants at least 60 cards in constructed formats', () => {
    expect(deckSizeCheck(modern, 56)).toEqual({ status: 'short', label: '56/60', note: '4 short of 60' })
    expect(deckSizeCheck(modern, 60)).toEqual({ status: 'ok', label: '60', note: null })
    expect(deckSizeCheck(modern, 63)).toEqual({ status: 'ok', label: '63', note: null })
  })

  it('wants an exact size, commander included, in commander formats', () => {
    expect(deckSizeCheck(commander, 44)).toEqual({ status: 'short', label: '44/100', note: '56 short of 100' })
    expect(deckSizeCheck(commander, 100)).toEqual({ status: 'ok', label: '100/100', note: null })
    expect(deckSizeCheck(commander, 101)).toEqual({ status: 'over', label: '101/100', note: '1 over 100' })
    expect(deckSizeCheck(oathbreaker, 60).status).toBe('ok')
  })
})
