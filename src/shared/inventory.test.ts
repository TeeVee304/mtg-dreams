import { describe, expect, it } from 'vitest'
import { cardLines, parseInventory, parseList } from './decklist'
import { addCopies, coverLines, hasVersions, itemFromCopies, worthlessCopies, normalizeCopies, otherVersions, ownedVersion, withTotal } from './inventory'

const bolt = () => parseInventory('2 Lightning Bolt\n1 Lightning Bolt <141> [A25]\n1 Lightning Bolt [M11] (F)').get('lightning bolt')!

describe('inventory copies', () => {
  it('merges copies of one version, drops empty ones and lists "any version" first', () => {
    expect(
      normalizeCopies([
        { qty: 1, set: 'm11', foil: true },
        { qty: 2, foil: false },
        { qty: 0, set: 'a25', collector: '141', foil: false },
        { qty: 1, set: 'm11', foil: true }
      ])
    ).toEqual([
      { qty: 2, set: undefined, collector: undefined, foil: false },
      { qty: 2, set: 'm11', collector: undefined, foil: true }
    ])
    expect(itemFromCopies('Opt', [{ qty: 0, foil: false }])).toBeNull()
  })

  it('adds copies in a version, or as any version', () => {
    const item = addCopies(bolt(), 'Lightning Bolt', 2, { set: 'a25', collector: '141', foil: false })!
    expect(item.qty).toBe(6)
    expect(item.copies.find((c) => c.set === 'a25')?.qty).toBe(3)
    expect(addCopies(undefined, 'Opt', 1)).toEqual({ name: 'Opt', qty: 1, copies: [{ qty: 1, set: undefined, collector: undefined, foil: false }] })
  })

  it('removes "any version" copies first, then the latest versions', () => {
    const before = bolt()
    const fewer = withTotal(before, 'Lightning Bolt', 2)!
    expect(fewer.copies.map((c) => [c.qty, c.set ?? 'any'])).toEqual([[1, 'a25'], [1, 'm11']])
    const one = withTotal(before, 'Lightning Bolt', 1)!
    expect(one.copies.map((c) => [c.qty, c.set ?? 'any'])).toEqual([[1, 'a25']])
    expect(withTotal(before, 'Lightning Bolt', 0)).toBeNull()
    expect(before.qty).toBe(4)
  })

  it('removes copies of the given version first, so unticking undoes ticking', () => {
    // Sofia owns a Sol Ring from SLD; a wishlist line asks for CMR. Ticking adds a CMR copy...
    const owned = parseInventory('1 Sol Ring [SLD]').get('sol ring')
    const ticked = withTotal(owned, 'Sol Ring', 2, { set: 'cmr', foil: false })!
    expect(ticked.copies.map((c) => c.set)).toEqual(['cmr', 'sld'])
    // ...and unticking takes that CMR copy away again, not hers.
    const unticked = withTotal(ticked, 'Sol Ring', 1, { set: 'cmr', foil: false })!
    expect(unticked.copies).toEqual([{ qty: 1, set: 'sld', foil: false }])
    // Without that version, the usual order applies.
    expect(withTotal(ticked, 'Sol Ring', 1, { set: 'm11', foil: false })!.copies.map((c) => c.set)).toEqual(['cmr'])
  })

  it('tells when you own only other versions of the printing a line names', () => {
    const item = parseInventory('1 Sol Ring [SLD] (F)\n1 Sol Ring [MSC]').get('sol ring')
    expect(otherVersions(item, { set: 'cmr', collector: '472', foil: false }).map((c) => c.set)).toEqual(['msc', 'sld'])
    expect(otherVersions(item, { set: 'sld', foil: false })).toEqual([])
    // A copy without a recorded version may be the one the line names: no hint.
    expect(otherVersions(parseInventory('1 Sol Ring\n1 Sol Ring [SLD]').get('sol ring'), { set: 'cmr', foil: false })).toEqual([])
    expect(otherVersions(item, undefined)).toEqual([])
    expect(otherVersions(undefined, { set: 'cmr', foil: false })).toEqual([])
  })

  it('adds to the total in the given version', () => {
    const more = withTotal(bolt(), 'Lightning Bolt', 5, { set: 'm11', foil: true })!
    expect(more.copies.find((c) => c.set === 'm11')?.qty).toBe(2)
  })

  it('picks the owned version of the finish asked for, with the most copies', () => {
    const item = parseInventory('3 Sol Ring\n1 Sol Ring [CMM]\n2 Sol Ring [C21]\n1 Sol Ring [SLD] (F)').get('sol ring')
    expect(ownedVersion(item, false)?.set).toBe('c21')
    expect(ownedVersion(item, true)?.set).toBe('sld')
    expect(ownedVersion(parseInventory('2 Opt').get('opt'), false)).toBeNull()
  })

  it('knows when a card has versions recorded', () => {
    expect(hasVersions(bolt())).toBe(true)
    expect(hasVersions(parseInventory('2 Opt').get('opt')!)).toBe(false)
  })

  it('keeps copies in other languages or worthless apart', () => {
    const item = parseInventory(['2 Sol Ring [CMR]', '1 Sol Ring [CMR] {DE}', '1 Sol Ring {Worthless}', '1 Sol Ring [CMR] {de}'].join('\n')).get('sol ring')!
    expect(item.copies).toEqual([
      { qty: 1, foil: false, worthless: true },
      { qty: 2, set: 'cmr', foil: false },
      { qty: 2, set: 'cmr', foil: false, lang: 'de' }
    ])
    expect(worthlessCopies(item)).toBe(1)
    expect(hasVersions(parseInventory('1 Opt {JA}').get('opt')!)).toBe(true)
  })
})

describe('lines wanting a Version', () => {
  const copies = parseInventory('1 Sword of the Animist <217> [M11]\n1 Sword of the Animist <355> [LTC] (F)\n').get('sword of the animist')!.copies
  const line = (text: string) => cardLines(parseList(text))[0]

  it('take only copies that serve them; any other copy is a substitute', () => {
    expect(coverLines([line('1 Sword of the Animist <355> [LTC]')], copies, 2)).toEqual([{ owned: 0, substitutes: 1 }])
    expect(coverLines([line('1 Sword of the Animist <355> [LTC] (F)')], copies, 2)).toEqual([{ owned: 1, substitutes: 0 }])
    expect(coverLines([line('1 Sword of the Animist [M11]')], copies, 2)).toEqual([{ owned: 1, substitutes: 0 }])
  })

  it('go first, so a line taking any copy gets what they leave', () => {
    const lines = [line('2 Sword of the Animist'), line('1 Sword of the Animist <217> [M11]')]
    expect(coverLines(lines, copies, 2)).toEqual([{ owned: 1, substitutes: 0 }, { owned: 1, substitutes: 0 }])
  })

  it('take a copy with no recorded printing in their finish, any copy as a stand-in, and no more than the lists ahead leave', () => {
    const plain = parseInventory('1 Sol Ring\n').get('sol ring')!.copies
    expect(coverLines([line('1 Sol Ring <284> [LTC]')], plain, 1)).toEqual([{ owned: 1, substitutes: 0 }])
    expect(coverLines([line('1 Sol Ring [LTC] (F)')], plain, 1)).toEqual([{ owned: 0, substitutes: 1 }])
    expect(coverLines([line('1 Sword of the Animist <355> [LTC] {Stand-in}')], copies, 2)).toEqual([{ owned: 1, substitutes: 0 }])
    expect(coverLines([line('1 Sword of the Animist <355> [LTC] (F)')], copies, 0)).toEqual([{ owned: 0, substitutes: 0 }])
  })
})
