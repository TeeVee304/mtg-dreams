import { describe, expect, it } from 'vitest'
import { cardLines, parseList, serializeList } from './decklist'
import { listFormat, withFormat } from './formats'
import {
  baseCardLines,
  variantSwaps,
  hasVariant,
  unionCardLines,
  versionCardLines,
  versionLines,
  withVariant,
  withVariantCards,
  withVariantCount,
  withVariantOf,
  variantFor,
  variantText,
  baseText,
  withBaseText,
  withVariantText,
  swapPairs,
  withoutSwapPair,
  listVariants,
  versionNameIssue,
  withNamedVersion,
  withoutVersion,
  withVersionName
} from './listVersion'
import { addToBoard } from './sideboard'
import type { CardLine } from './types'

const DECK = `// Format: Commander
// Commander: Invisible Woman
// Duel: On
1 Invisible Woman
1 Galactus, Devourer of Worlds
1 Alicia Masters, Skilled Sculptor
10 Island

// Duel in
1 Dreamtide Whale
// Duel out
1 Galactus, Devourer of Worlds
`

const names = (lines: CardLine[]) => lines.map((line) => `${line.qty} ${line.name}`)

describe('Duel version', () => {
  it('is the list less the cards out, plus the cards in', () => {
    const lines = parseList(DECK)
    expect(hasVariant(lines)).toBe(true)
    expect(names(baseCardLines(lines))).toEqual(['1 Invisible Woman', '1 Galactus, Devourer of Worlds', '1 Alicia Masters, Skilled Sculptor', '10 Island'])
    expect(names(versionCardLines(lines, 'Duel'))).toEqual(['1 Invisible Woman', '1 Alicia Masters, Skilled Sculptor', '10 Island', '1 Dreamtide Whale'])
  })

  it('follows Duel Commander rules, with the same commander', () => {
    const duel = versionLines(parseList(DECK), 'Duel')
    expect(listFormat(duel)?.id).toBe('duel')
    expect(serializeList(duel)).toContain('// Commander: Invisible Woman')
    expect(serializeList(duel)).not.toMatch(/Duel (in|out)/)
  })

  it('needs copies for the larger version only', () => {
    expect(names(unionCardLines(parseList(DECK)))).toEqual([
      '1 Invisible Woman',
      '1 Galactus, Devourer of Worlds',
      '1 Alicia Masters, Skilled Sculptor',
      '10 Island',
      '1 Dreamtide Whale'
    ])
  })

  it('is off in other formats, and without the header', () => {
    expect(hasVariant(parseList(DECK.replace('Commander\n// Commander', 'Brawl\n// Commander')))).toBe(false)
    const off = parseList(DECK.replace('// Duel: On\n', ''))
    expect(names(versionCardLines(off, 'Duel'))).toEqual(names(baseCardLines(off)))
  })

  it('sets a card\x27s Duel copies as swaps, cutting, restoring and adding', () => {
    let lines = parseList(DECK)
    lines = withVariantCount(lines, 'Duel', { name: 'Alicia Masters, Skilled Sculptor', foil: false }, 0)
    expect(names(variantSwaps(lines, 'Duel').outs)).toEqual(['1 Galactus, Devourer of Worlds', '1 Alicia Masters, Skilled Sculptor'])
    lines = withVariantCount(lines, 'Duel', { name: 'Galactus, Devourer of Worlds', foil: false }, 1)
    expect(names(variantSwaps(lines, 'Duel').outs)).toEqual(['1 Alicia Masters, Skilled Sculptor'])
    lines = withVariantCount(lines, 'Duel', { name: 'Island', foil: false }, 8)
    lines = withVariantCount(lines, 'Duel', { name: 'Flux Channeler', set: 'plst', collector: 'WAR-52', foil: false }, 1)
    expect(names(variantSwaps(lines, 'Duel').ins)).toEqual(['1 Dreamtide Whale', '1 Flux Channeler'])
    expect(names(variantSwaps(lines, 'Duel').outs)).toEqual(['1 Alicia Masters, Skilled Sculptor', '2 Island'])
    expect(serializeList(lines)).toMatch(/\/\/ Duel in\n1 Dreamtide Whale\n1 Flux Channeler <WAR-52> \[PLST\]\n\n\/\/ Duel out\n/)
  })

  it('pairs cards out with cards in, in order, and keeps pairs when a swap changes', () => {
    let lines = withVariantCount(parseList(DECK), 'Duel', { name: 'Alicia Masters, Skilled Sculptor', foil: false }, 0)
    lines = withVariantCount(lines, 'Duel', { name: 'Flux Channeler', foil: false }, 1)
    lines = withVariantCount(lines, 'Duel', { name: 'Island', foil: false }, 9)
    const pair = (lines: Parameters<typeof variantSwaps>[0]) =>
      swapPairs(variantSwaps(lines, 'Duel')).map((p) => `${p.out?.name ?? '-'} > ${p.in?.name ?? '-'}`)
    expect(pair(lines)).toEqual(['Galactus, Devourer of Worlds > Dreamtide Whale', 'Alicia Masters, Skilled Sculptor > Flux Channeler', 'Island > -'])
    // More copies of a card out keeps its place.
    lines = withVariantCount(lines, 'Duel', { name: 'Galactus, Devourer of Worlds', foil: false }, 0)
    expect(pair(lines)[0]).toBe('Galactus, Devourer of Worlds > Dreamtide Whale')
    lines = withoutSwapPair(lines, 'Duel', 0)
    expect(pair(lines)).toEqual(['Alicia Masters, Skilled Sculptor > Flux Channeler', 'Island > -'])
    expect(names(versionCardLines(lines, 'Duel'))).toContain('1 Galactus, Devourer of Worlds')
  })

  it('keeps pairs in order when the version is edited as text', () => {
    let lines = withVariantCount(parseList(DECK), 'Duel', { name: 'Alicia Masters, Skilled Sculptor', foil: false }, 0)
    lines = withVariantCount(lines, 'Duel', { name: 'Flux Channeler', foil: false }, 1)
    lines = withVariantText(lines, 'Duel', ['1 Invisible Woman', '1 Galactus, Devourer of Worlds', '10 Island', '1 Flux Channeler', '1 Dreamtide Whale', '1 Sol Ring'].join('\n'))
    expect(names(variantSwaps(lines, 'Duel').ins)).toEqual(['1 Dreamtide Whale', '1 Flux Channeler', '1 Sol Ring'])
  })

  it('keeps new list cards out of the swap sections, so they are in both versions', () => {
    const lines = addToBoard(parseList(DECK), { qty: 1, name: 'Sol Ring', foil: false }, 'main')
    expect(names(versionCardLines(lines, 'Duel'))).toContain('1 Sol Ring')
    expect(names(variantSwaps(lines, 'Duel').ins)).toEqual(['1 Dreamtide Whale'])
  })

  it('ignores outs of cards no longer in the list', () => {
    const lines = parseList(DECK.replace('1 Galactus, Devourer of Worlds\n1 Alicia', '1 Alicia'))
    expect(variantSwaps(lines, 'Duel').outs).toEqual([])
  })

  it('turns off by deleting the swaps', () => {
    const text = serializeList(withVariant(parseList(DECK), false))
    expect(text).not.toMatch(/Duel/)
    expect(text).toContain('1 Galactus, Devourer of Worlds')
  })

  it('becomes another list as swaps (applying a Duel upgrade)', () => {
    const target = parseList('1 Invisible Woman\n1 Alicia Masters, Skilled Sculptor\n9 Island\n1 Flux Channeler\n').filter(
      (line): line is CardLine => line.kind === 'card'
    )
    const lines = withVariantCards(parseList(DECK), 'Duel', target)
    expect(names(variantSwaps(lines, 'Duel').ins)).toEqual(['1 Flux Channeler'])
    expect(names(variantSwaps(lines, 'Duel').outs)).toEqual(['1 Galactus, Devourer of Worlds', '1 Island'])
  })

  it('carries its Duel version onto a new list (applying an upgrade of the list)', () => {
    const upgraded = parseList('// Format: Commander\n1 Invisible Woman\n1 Galactus, Devourer of Worlds\n1 Sol Ring\n')
    const lines = withVariantOf(upgraded, parseList(DECK))
    expect(hasVariant(lines)).toBe(true)
    expect(names(versionCardLines(lines, 'Duel'))).toEqual(['1 Invisible Woman', '1 Sol Ring', '1 Dreamtide Whale'])
  })
})

describe('EDH version of a Duel Commander list', () => {
  const DUEL_DECK = `// Format: Duel Commander
// Commander: Invisible Woman
1 Invisible Woman
1 Flux Channeler
`

  it('is the version a Duel list can have, following Commander rules', () => {
    expect(variantFor(parseList(DUEL_DECK))?.label).toBe('EDH')
    expect(variantFor(parseList(DECK))?.label).toBe('Duel')
    expect(variantFor(parseList('// Format: Modern\n4 Sol Ring\n'))).toBeNull()
    const lines = withVariant(parseList(DUEL_DECK), true)
    expect(serializeList(lines)).toContain('// EDH: On')
    expect(listFormat(versionLines(lines, 'EDH'))?.id).toBe('commander')
  })

  it('stores its swaps in EDH sections', () => {
    let lines = withVariant(parseList(DUEL_DECK), true)
    lines = withVariantCount(lines, 'EDH', { name: 'Galactus, Devourer of Worlds', foil: false }, 1)
    lines = withVariantCount(lines, 'EDH', { name: 'Flux Channeler', foil: false }, 0)
    expect(serializeList(lines)).toMatch(/\/\/ EDH in\n1 Galactus, Devourer of Worlds\n\n\/\/ EDH out\n1 Flux Channeler\n$/)
    expect(names(versionCardLines(lines, 'EDH'))).toEqual(['1 Invisible Woman', '1 Galactus, Devourer of Worlds'])
  })
})

describe('named versions', () => {
  const named = (lines: Parameters<typeof versionCardLines>[0], version: string) => names(versionCardLines(lines, version))

  it('are added by name, beside a Duel version, each with its own swaps', () => {
    let lines = withNamedVersion(parseList(DECK), 'Counters')
    lines = withNamedVersion(lines, 'Artifacts')
    expect(listVariants(lines).map((variant) => variant.label)).toEqual(['Duel', 'Counters', 'Artifacts'])
    expect(serializeList(lines)).toMatch(/^\/\/ Format: Commander\n\/\/ Commander: Invisible Woman\n\/\/ Duel: On\n\/\/ Version: Counters\n\/\/ Version: Artifacts\n/)
    lines = withVariantCount(lines, 'Counters', { name: 'Hardened Scales', foil: false }, 1)
    lines = withVariantCount(lines, 'counters', { name: 'Island', foil: false }, 9)
    lines = withVariantCount(lines, 'Artifacts', { name: 'Sol Ring', foil: false }, 1)
    expect(named(lines, 'Counters')).toEqual(['1 Invisible Woman', '1 Galactus, Devourer of Worlds', '1 Alicia Masters, Skilled Sculptor', '9 Island', '1 Hardened Scales'])
    expect(named(lines, 'Artifacts')).toContain('1 Sol Ring')
    expect(named(lines, 'Duel')).toContain('1 Dreamtide Whale')
    expect(names(baseCardLines(lines))).toEqual(['1 Invisible Woman', '1 Galactus, Devourer of Worlds', '1 Alicia Masters, Skilled Sculptor', '10 Island'])
    expect(serializeList(lines)).toMatch(/\/\/ Duel in\n1 Dreamtide Whale\n\n\/\/ Duel out\n1 Galactus, Devourer of Worlds\n\n\/\/ Counters in\n1 Hardened Scales\n\n\/\/ Counters out\n1 Island\n\n\/\/ Artifacts in\n1 Sol Ring\n$/)
    // A named version follows the list's own format.
    expect(listFormat(versionLines(lines, 'Counters'))?.id).toBe('commander')
  })

  it('need copies for the version with most of each card', () => {
    let lines = withNamedVersion(parseList(DECK), 'Counters')
    lines = withVariantCount(lines, 'Counters', { name: 'Dreamtide Whale', foil: false }, 1)
    lines = withVariantCount(lines, 'Counters', { name: 'Sol Ring', foil: false }, 1)
    expect(names(unionCardLines(lines))).toEqual([
      '1 Invisible Woman',
      '1 Galactus, Devourer of Worlds',
      '1 Alicia Masters, Skilled Sculptor',
      '10 Island',
      '1 Dreamtide Whale',
      '1 Sol Ring'
    ])
  })

  it('are renamed and deleted alone, and survive a new format, unlike Duel', () => {
    let lines = withNamedVersion(parseList(DECK), 'Counters')
    lines = withVariantCount(lines, 'Counters', { name: 'Hardened Scales', foil: false }, 1)
    lines = withVersionName(lines, 'Counters', 'Plus One')
    expect(named(lines, 'Plus One')).toContain('1 Hardened Scales')
    expect(serializeList(lines)).not.toMatch(/Counters/)
    const modern = versionLines(withVariant(withFormat(lines, 'modern'), false), 'Plus One')
    expect(names(cardLines(modern))).toContain('1 Hardened Scales')
    const without = withoutVersion(lines, 'Plus One')
    expect(serializeList(without)).not.toMatch(/Plus One|Hardened/)
    expect(listVariants(without).map((variant) => variant.label)).toEqual(['Duel'])
    expect(named(without, 'Duel')).toContain('1 Dreamtide Whale')
  })

  it('check names', () => {
    const lines = withNamedVersion(parseList(DECK), 'Counters')
    expect(versionNameIssue(lines, 'Artifacts')).toBeNull()
    expect(versionNameIssue(lines, 'counters')).toBe('That name is taken.')
    expect(versionNameIssue(lines, 'Counters', 'Counters')).toBeNull()
    expect(versionNameIssue(lines, 'Duel')).toBe('That name is taken.')
    expect(versionNameIssue(lines, 'Sideboard')).toBe('That name is taken.')
    expect(versionNameIssue(lines, 'All in')).toMatch(/end in/)
    expect(versionNameIssue(lines, '  ')).toBe('Name the version.')
    expect(versionNameIssue(lines, 'a/b')).toMatch(/Use letters/)
  })

  it('come back after the list is edited as text', () => {
    let lines = withNamedVersion(parseList(DECK), 'Counters')
    lines = withVariantCount(lines, 'Counters', { name: 'Hardened Scales', foil: false }, 1)
    const text = baseText(lines)
    expect(text).not.toMatch(/Version|Counters|Duel/)
    expect(named(withBaseText(lines, text), 'Counters')).toContain('1 Hardened Scales')
  })
})

describe('editing the other version as text', () => {
  it('shows its cards and turns the edited list into swaps', () => {
    const lines = parseList(DECK)
    expect(variantText(lines, 'Duel')).toBe('1 Invisible Woman\n1 Alicia Masters, Skilled Sculptor\n10 Island\n1 Dreamtide Whale\n')
    const edited = withVariantText(lines, 'Duel', '1 Invisible Woman\n1 Alicia Masters, Skilled Sculptor\n9 Island\n1 Sol Ring\n')
    expect(names(variantSwaps(edited, 'Duel').ins)).toEqual(['1 Sol Ring'])
    expect(names(variantSwaps(edited, 'Duel').outs)).toEqual(['1 Galactus, Devourer of Worlds', '1 Island'])
    expect(names(baseCardLines(edited))).toEqual(names(baseCardLines(lines)))
  })

  it('keeps the commander, which leads both versions, and ignores headers', () => {
    const edited = withVariantText(parseList(DECK), 'Duel', 'Deck\n// Format: Modern\n1 Alicia Masters, Skilled Sculptor\n10 Island\n')
    expect(names(versionCardLines(edited, 'Duel'))).toEqual(['1 Invisible Woman', '1 Alicia Masters, Skilled Sculptor', '10 Island'])
    expect(serializeList(edited)).toContain('// Format: Commander')
  })
})

describe('editing the list itself as text', () => {
  it('hides the other version and keeps it on save', () => {
    const text = baseText(parseList(DECK))
    expect(text).not.toMatch(/Duel/)
    expect(text).toContain('1 Galactus, Devourer of Worlds')
    const edited = withBaseText(parseList(DECK), text.replace('10 Island', '9 Island\n1 Sol Ring'))
    expect(names(variantSwaps(edited, 'Duel').ins)).toEqual(['1 Dreamtide Whale'])
    expect(names(versionCardLines(edited, 'Duel'))).toContain('1 Sol Ring')
  })

  it('drops the other version when the edited list changes format', () => {
    const edited = withBaseText(parseList(DECK), baseText(parseList(DECK)).replace('Commander\n', 'Modern\n'))
    expect(serializeList(edited)).not.toMatch(/Duel/)
  })
})
