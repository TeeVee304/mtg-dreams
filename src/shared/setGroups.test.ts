import { describe, expect, it } from 'vitest'
import { groupCoverage, preferredVersions, withPreferredPrintings, withPreferredVersions } from './listPreference'
import { joinMeta, splitMeta } from './listMeta'
import { parseList, serializeList } from './decklist'
import { resolveLine } from './pricing'
import { buildSetGroups, findSetGroup, franchiseCandidates, groupPrintings, KNOWN_FRANCHISES, setFamily, shortSetName, sortName, type SetSummary } from './setGroups'
import type { Printing } from './types'

const sets: SetSummary[] = [
  { code: 'tla', name: 'Avatar: The Last Airbender', set_type: 'expansion', released_at: '2025-11-21', icon_svg_uri: 'https://svgs.scryfall.io/sets/tla.svg?1763' },
  { code: 'tle', name: 'Avatar: The Last Airbender Eternal', set_type: 'eternal', parent_set_code: 'tla', released_at: '2025-11-21' },
  { code: 'ptla', name: 'Avatar Promos', set_type: 'promo', parent_set_code: 'tla' },
  { code: 'ttla', name: 'Avatar Tokens', set_type: 'token', parent_set_code: 'tla' },
  { code: 'atle', name: 'Avatar Art Series', set_type: 'memorabilia', parent_set_code: 'tle' },
  { code: 'pip', name: 'Fallout', set_type: 'commander', released_at: '2024-03-08' },
  { code: '40k', name: 'Warhammer 40,000 Commander', set_type: 'commander', released_at: '2022-10-07' },
  { code: 'mid', name: 'Innistrad: Midnight Hunt', set_type: 'expansion', released_at: '2021-09-24' },
  { code: 'mic', name: 'Midnight Hunt Commander', set_type: 'commander', parent_set_code: 'mid' },
  { code: 'ymid', name: 'Alchemy: Innistrad', set_type: 'alchemy', parent_set_code: 'mid', digital: true },
  { code: 'isd', name: 'Innistrad', set_type: 'expansion', released_at: '2011-09-30' },
  { code: 'sld', name: 'Secret Lair Drop', set_type: 'box', released_at: '2019-12-02' },
  { code: 'dsk', name: 'Duskmourn: House of Horror', set_type: 'expansion', released_at: '2024-09-27' }
]

function printing(overrides: Partial<Printing>): Printing {
  return {
    id: `${overrides.set}-${overrides.collectorNumber}`,
    name: 'Sol Ring',
    set: 'cmm',
    setName: 'Commander Masters',
    collectorNumber: '1',
    rarity: 'uncommon',
    releasedAt: '2023-08-04',
    lang: 'en',
    finishes: ['nonfoil'],
    cardmarketId: null,
    price: { trend: 1 },
    priceFoil: {},
    imageSmall: null,
    imageNormal: null,
    imageBack: null,
    cardmarketUrl: null,
    labels: [],
    autoEligible: true,
    ...overrides
  }
}

describe('set groups', () => {
  it('holds a set with its promos and spin-offs, but not tokens, art cards or digital sets', () => {
    expect(setFamily('tla', sets)).toEqual(['tla', 'tle', 'ptla'])
    expect(setFamily('mid', sets)).toEqual(['mid', 'mic'])
  })

  it('checks recent, paper, top-level sets as franchises, never Secret Lair', () => {
    expect(franchiseCandidates(sets).map((set) => set.code)).toEqual(['tla', 'pip', '40k', 'dsk'])
  })

  it('names franchises after their set, short, then lists the worlds with the sets known', () => {
    const groups = buildSetGroups(sets, ['tla', '40k'])
    expect(groups.slice(0, 2)).toEqual([
      { name: 'Avatar', kind: 'franchise', sets: ['tla', 'tle', 'ptla'], icon: 'https://svgs.scryfall.io/sets/tla.svg', aliases: ['Avatar: The Last Airbender'] },
      { name: 'Warhammer 40,000', kind: 'franchise', sets: ['40k'], aliases: ['Warhammer 40,000 Commander'] }
    ])
    expect(findSetGroup(groups, 'Avatar: The Last Airbender')?.name).toBe('Avatar')
    expect(shortSetName({ code: 'ltr', name: 'The Lord of the Rings: Tales of Middle-earth' })).toBe('Lord of the Rings')
    expect(shortSetName({ code: 'spm', name: "Marvel's Spider-Man" })).toBe("Marvel's Spider-Man")
    expect([{ name: 'Tarkir' }, { name: 'The Hobbit' }, { name: 'Avatar' }].sort((a, b) => sortName(a).localeCompare(sortName(b)))).toEqual([
      { name: 'Avatar' },
      { name: 'The Hobbit' },
      { name: 'Tarkir' }
    ])
    expect(findSetGroup(groups, 'innistrad')).toEqual({ name: 'Innistrad', kind: 'world', sets: ['isd', 'mid', 'mic'] })
    expect(findSetGroup(groups, 'Duskmourn')?.sets).toEqual(['dsk'])
    expect(findSetGroup(groups, 'Ravnica')).toBeUndefined()
  })

  it('merges the sets of one universe into one group, and shows the symbol chosen for it', () => {
    const icon = (code: string) => `https://svgs.scryfall.io/sets/${code}.svg?1`
    const universe: SetSummary[] = [
      { code: 'ltr', name: 'The Lord of the Rings: Tales of Middle-earth', set_type: 'draft_innovation', icon_svg_uri: icon('ltr') },
      { code: 'ltc', name: 'Tales of Middle-earth Commander', set_type: 'commander', parent_set_code: 'ltr' },
      { code: 'hob', name: 'The Hobbit', set_type: 'expansion', icon_svg_uri: icon('hob') },
      { code: 'msh', name: 'Marvel Super Heroes', set_type: 'expansion', icon_svg_uri: icon('msh') },
      { code: 'spm', name: "Marvel's Spider-Man", set_type: 'expansion', icon_svg_uri: icon('spm') },
      { code: 'mar', name: 'Marvel Universe', set_type: 'masterpiece', icon_svg_uri: icon('mar') },
      { code: 'isd', name: 'Innistrad', set_type: 'expansion', icon_svg_uri: icon('isd') },
      { code: 'soi', name: 'Shadows over Innistrad', set_type: 'expansion', icon_svg_uri: icon('soi') }
    ]
    const groups = buildSetGroups(universe, ['spm', 'hob', 'ltr', 'msh'])
    expect(groups.filter((group) => group.kind === 'franchise').map((group) => group.name)).toEqual(['Marvel', 'Middle-earth'])
    const marvel = findSetGroup(groups, "Marvel's Spider-Man")!
    expect(marvel).toMatchObject({ name: 'Marvel', sets: ['msh', 'spm', 'mar'], icon: 'https://svgs.scryfall.io/sets/msh.svg' })
    const tolkien = findSetGroup(groups, 'The Hobbit')!
    expect(tolkien).toMatchObject({ name: 'Middle-earth', sets: ['ltr', 'ltc', 'hob'], icon: 'https://svgs.scryfall.io/sets/ltr.svg' })
    expect(findSetGroup(groups, 'The Lord of the Rings')).toBe(tolkien)
    expect(findSetGroup(groups, 'Innistrad')?.icon).toBe('https://svgs.scryfall.io/sets/soi.svg')
  })

  it('offers only Versions whose art was first printed in the group', () => {
    const original = printing({ set: 'isd', collectorNumber: '1', releasedAt: '2011-09-30', illustrationId: 'a' })
    const reprint = printing({ set: 'mic', collectorNumber: '2', releasedAt: '2021-09-24', illustrationId: 'b' })
    const older = printing({ set: 'c19', collectorNumber: '3', releasedAt: '2019-08-23', illustrationId: 'b' })
    const unknownArt = printing({ set: 'mid', collectorNumber: '4', releasedAt: '2021-09-24' })
    const ineligible = printing({ set: 'mid', collectorNumber: '5', autoEligible: false, illustrationId: 'c' })
    const innistrad = { sets: ['isd', 'mid', 'mic'] }
    expect(groupPrintings([original, reprint, older, unknownArt, ineligible], innistrad)).toEqual([original, unknownArt])
  })
})

describe('preferred Versions', () => {
  const cheap = printing({ set: 'cmm', collectorNumber: '410', price: { trend: 0.8 }, illustrationId: 'x' })
  const avatar = printing({ set: 'tle', collectorNumber: '57', price: { trend: 3 }, releasedAt: '2025-11-21', illustrationId: 'y' })
  const pricier = printing({ set: 'tla', collectorNumber: '300', price: { trend: 9 }, releasedAt: '2025-11-21', illustrationId: 'z' })
  const avatarGroup = { name: 'Avatar', kind: 'franchise' as const, sets: ['tla', 'tle'] }

  it('resolves a Card with no Version chosen to the cheapest Version of the preferred group', () => {
    const resolution = resolveLine({ foil: false }, [cheap, avatar, pricier], 'trend', { prefer: avatarGroup })
    expect(resolution).toMatchObject({ printing: avatar, unitPrice: 3, preferred: true, pinned: false })
  })

  it('falls back to the cheapest Version, and keeps a chosen one', () => {
    const fallback = resolveLine({ foil: false }, [cheap], 'trend', { prefer: avatarGroup })
    expect(fallback.printing).toBe(cheap)
    expect(fallback.preferred).toBeFalsy()
    expect(resolveLine({ foil: false, set: 'cmm' }, [cheap, avatar], 'trend', { prefer: avatarGroup })).toMatchObject({ printing: cheap, pinned: true })
  })

  it('is a personal setting, kept apart from the deck', () => {
    const lines = withPreferredVersions(parseList('1 Sol Ring\n'), 'Innistrad')
    expect(preferredVersions(lines)).toBe('Innistrad')
    const { text, meta } = splitMeta(serializeList(lines))
    expect(text).toBe('1 Sol Ring\n')
    expect(meta).toEqual({ preferredVersions: 'Innistrad' })
    expect(joinMeta(text, meta)).toBe('// Preferred Versions: Innistrad\n1 Sol Ring\n')
    expect(preferredVersions(withPreferredVersions(lines, null))).toBeNull()
  })

  it('counts the Cards a group would change and the price of the copies still needed', () => {
    const card = (name: string, printings: Printing[], extra: { qty?: number; owned?: number; set?: string; showsOwned?: boolean } = {}) => ({
      line: { name, qty: extra.qty ?? 1, foil: false, ...(extra.set && { set: extra.set }) },
      printings,
      owned: extra.owned ?? 0,
      showsOwned: extra.showsOwned ?? false
    })
    const cards = [
      card('Sol Ring', [cheap, avatar], { qty: 2, owned: 1 }),
      card('Arcane Signet', [cheap]),
      card('Counterspell', [cheap, avatar], { set: 'cmm' }),
      card('Swords to Plowshares', [cheap, avatar], { showsOwned: true }),
      card('Island', [cheap, avatar])
    ]
    const other = { name: 'Fallout', kind: 'franchise' as const, sets: ['pip'] }
    const [coverage, ...rest] = groupCoverage(cards, [other, avatarGroup], 'trend')
    expect(rest).toEqual([])
    expect(coverage.group).toBe(avatarGroup)
    expect(coverage.cards).toBe(1)
    expect(coverage.total).toBe(4)
    expect(coverage.change).toBeCloseTo(2.2)
  })

  it('writes the preferred Versions into a copy, leaving chosen ones', () => {
    const picks = new Map([['sol ring', { set: 'tle', collectorNumber: '57' }], ['counterspell', { set: 'tla', collectorNumber: '1' }]])
    const lines = withPreferredPrintings(parseList('1 Sol Ring\n1 Counterspell [MH2]\n1 Island\n'), picks)
    expect(serializeList(lines)).toBe('1 Sol Ring <57> [TLE]\n1 Counterspell [MH2]\n1 Island\n')
  })
})

describe('known franchises', () => {
  it('come with the app, so only sets released since are looked up', () => {
    expect(KNOWN_FRANCHISES.tla).toBe(true)
    expect(KNOWN_FRANCHISES.dsk).toBe(false)
    expect('zzz' in KNOWN_FRANCHISES).toBe(false)
  })
})
