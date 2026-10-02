import { describe, expect, it } from 'vitest'
import { NO_FILTERS } from './cards'
import { parseList } from './decklist'
import { findFormat } from './formats'
import {
  analyzeList,
  copyCaps,
  filterRows,
  landCount,
  limitReason,
  lineMax,
  ownedToggle,
  sectionRows,
  sortRows,
  type ModelRow
} from './listModel'
import type { CardInfo, CardLine, Printing } from './types'

const info = (name: string, typeLine: string, legalities: Record<string, string> = {}, extra: Partial<CardInfo> = {}): CardInfo => ({
  name,
  colors: [],
  colorIdentity: [],
  typeLine,
  manaValue: 2,
  rarity: 'rare',
  legalities,
  ...extra
})

const CARDS: Record<string, CardInfo> = {
  'Sol Ring': info('Sol Ring', 'Artifact', { commander: 'legal', modern: 'banned' }, { manaValue: 1 }),
  Atraxa: info('Atraxa', 'Legendary Creature — Phyrexian Angel', { commander: 'legal' }, { manaValue: 4 }),
  'Llanowar Elves': info('Llanowar Elves', 'Creature — Elf', { commander: 'legal' }, { manaValue: 1, rarity: 'common' }),
  'Command Tower': info('Command Tower', 'Land', { commander: 'legal' }, { manaValue: 0 }),
  Island: info('Island', 'Basic Land — Island', { commander: 'legal' }, { manaValue: 0 })
}

/** Rows as the page builds them: every card line, with prices and inventory. */
function rowsOf(text: string, owned: Record<string, number> = {}, prices: Record<string, number | null> = {}) {
  const lines = parseList(text)
  const rows: ModelRow[] = lines
    .filter((line): line is CardLine => line.kind === 'card')
    .map((line) => {
      const inventoryQty = owned[line.name] ?? 0
      return {
        line,
        info: CARDS[line.name],
        entry: { data: { printings: [] as Printing[] } },
        inventoryQty,
        owned: Math.min(line.qty, inventoryQty),
        before: 0,
        unit: line.name in prices ? prices[line.name] : 1
      }
    })
  return { lines, rows }
}

const names = (rows: ModelRow[]) => rows.map((row) => row.line.name)

describe('analyzeList', () => {
  it('flags cards that break the format, counting copies across lines', () => {
    const { lines, rows } = rowsOf('// Format: Commander\n1 Sol Ring\n1 Sol Ring <1> [CMM]\n1 Atraxa\n30 Island')
    const analysis = analyzeList('wishlist', lines, rows)
    expect(analysis.copiesOf('sol ring')).toBe(2)
    expect(rows.map((row) => analysis.issueOf(row)?.message ?? null)).toEqual([
      'Max 1 copy in Commander',
      'Max 1 copy in Commander',
      null,
      null
    ])
    expect(analysis.legalityErrors).toBe(2)
  })

  it('finds no rule problems without a format, and none for cards still loading', () => {
    const { lines, rows } = rowsOf('4 Sol Ring\n1 Unknown Card')
    const analysis = analyzeList('wishlist', lines, rows)
    expect(rows.map(analysis.issueOf)).toEqual([null, null])
    expect(analysis.format).toBeNull()
  })

  it('counts deck cards missing from the inventory, but never for wishlists', () => {
    const text = '1 Sol Ring\n2 Atraxa'
    const owned = { 'Sol Ring': 1, Atraxa: 1 }
    const deck = rowsOf(text, owned)
    const analysis = analyzeList('deck', deck.lines, deck.rows)
    expect(deck.rows.map(analysis.shortfallOf)).toEqual([0, 1])
    expect(analysis.ownershipErrors).toBe(1)
    expect(analysis.hasProblem(deck.rows[1])).toBe(true)
    const wish = rowsOf(text, owned)
    expect(analyzeList('wishlist', wish.lines, wish.rows).ownershipErrors).toBe(0)
  })

  it('knows the commander and who could replace it', () => {
    const { lines, rows } = rowsOf("// Format: Commander\n// Commander: Atraxa\n1 Sol Ring\n1 Atraxa\n1 Llanowar Elves")
    const analysis = analyzeList('deck', lines, rows)
    expect(analysis.hasCommander).toBe(true)
    expect(rows.filter(analysis.isCommander).map((row) => row.line.name)).toEqual(['Atraxa'])
    expect(rows.filter(analysis.canBeCommander).map((row) => row.line.name)).toEqual(['Atraxa'])
  })
})

describe('filterRows', () => {
  const { lines, rows } = rowsOf('// Format: Modern\n1 Sol Ring\n2 Llanowar Elves\n1 Command Tower', { 'Llanowar Elves': 2 })

  it('hides owned lines of a wishlist only', () => {
    const analysis = analyzeList('wishlist', lines, rows)
    const filters = { filters: NO_FILTERS, hideOwned: true, onlyProblems: false }
    expect(names(filterRows(rows, 'wishlist', analysis, filters))).toEqual(['Sol Ring', 'Command Tower'])
    expect(names(filterRows(rows, 'deck', analyzeList('deck', lines, rows), filters))).toHaveLength(3)
  })

  it('shows only problems, and applies card filters', () => {
    const analysis = analyzeList('wishlist', lines, rows)
    expect(names(filterRows(rows, 'wishlist', analysis, { filters: NO_FILTERS, hideOwned: false, onlyProblems: true }))).toEqual([
      'Sol Ring',
      'Llanowar Elves',
      'Command Tower'
    ])
    const creatures = { filters: { ...NO_FILTERS, type: 'Creature' }, hideOwned: false, onlyProblems: false }
    expect(names(filterRows(rows, 'wishlist', analysis, creatures))).toEqual(['Llanowar Elves'])
  })
})

describe('sortRows', () => {
  const { rows } = rowsOf('1 Sol Ring\n4 Llanowar Elves\n2 Atraxa\n1 Command Tower', { Atraxa: 1 }, {
    'Sol Ring': 2,
    'Llanowar Elves': 0.2,
    Atraxa: 10,
    'Command Tower': null
  })

  it('keeps the file order, or reverses it for "recently added"', () => {
    expect(sortRows(rows, 'file')).toBe(rows)
    expect(names(sortRows(rows, 'recent'))).toEqual(['Command Tower', 'Atraxa', 'Llanowar Elves', 'Sol Ring'])
  })

  it('sorts by price, with unpriced cards last', () => {
    expect(names(sortRows(rows, 'unit'))).toEqual(['Atraxa', 'Sol Ring', 'Llanowar Elves', 'Command Tower'])
  })

  it('sorts by the cost still needed (copies not owned)', () => {
    expect(names(sortRows(rows, 'needed'))).toEqual(['Atraxa', 'Sol Ring', 'Llanowar Elves', 'Command Tower'])
  })

  it('sorts by quantity, then name, and by card data', () => {
    expect(names(sortRows(rows, 'qty'))).toEqual(['Llanowar Elves', 'Atraxa', 'Command Tower', 'Sol Ring'])
    expect(names(sortRows(rows, 'mana'))).toEqual(['Command Tower', 'Llanowar Elves', 'Sol Ring', 'Atraxa'])
    expect(sortRows(rows, 'name')).not.toBe(rows)
  })
})

describe('sectionRows', () => {
  it('puts the commander on top, then the type sections in order, without empty ones', () => {
    const { lines, rows } = rowsOf('// Format: Commander\n// Commander: Atraxa\n1 Command Tower\n1 Sol Ring\n1 Atraxa\n1 Llanowar Elves')
    const sections = sectionRows(rows, analyzeList('deck', lines, rows))
    expect(sections.map((s) => [s.label, names(s.rows)])).toEqual([
      ['Commander', ['Atraxa']],
      ['Creatures', ['Llanowar Elves']],
      ['Artifacts', ['Sol Ring']],
      ['Lands', ['Command Tower']]
    ])
    expect(landCount(rows)).toBe(1)
  })
})

describe('copy limits', () => {
  const commander = findFormat('commander')
  const modern = findFormat('modern')

  it('takes the stricter of the format limit and, for decks, the copies owned', () => {
    expect(copyCaps('deck', commander, 'Sol Ring', CARDS['Sol Ring'], 3)).toEqual({ formatCap: 1, ownedCap: 3, cap: 1 })
    expect(copyCaps('deck', modern, 'Sol Ring', CARDS['Sol Ring'], 2)).toEqual({ formatCap: 4, ownedCap: 2, cap: 2 })
    expect(copyCaps('wishlist', null, 'Sol Ring', undefined, 0).cap).toBe(Infinity)
    expect(copyCaps('wishlist', commander, 'Island', CARDS.Island, 0).cap).toBe(Infinity)
  })

  it('explains the limit that applies', () => {
    expect(limitReason(commander, 'Sol Ring', copyCaps('deck', commander, 'Sol Ring', CARDS['Sol Ring'], 3))).toBe(
      'Commander allows 1 copy of Sol Ring'
    )
    expect(limitReason(modern, 'Sol Ring', copyCaps('deck', modern, 'Sol Ring', CARDS['Sol Ring'], 2))).toBe('You own 2× Sol Ring')
  })

  it('lets a line grow into the room the other lines leave, and never forces it down', () => {
    const [line] = parseList('2 Lightning Bolt') as CardLine[]
    const caps = { formatCap: 4, ownedCap: Infinity, cap: 4 }
    expect(lineMax(line, caps, 3)).toBe(3)
    expect(lineMax(line, { ...caps, cap: 1 }, 2)).toBe(2)
    expect(lineMax(line, { formatCap: Infinity, ownedCap: Infinity, cap: Infinity }, 2)).toBeUndefined()
  })
})

describe('ownedToggle', () => {
  const row = (qty: number, owned: number, inventoryQty: number, before = 0) =>
    ({ ...rowsOf(`${qty} Sol Ring`).rows[0], owned, inventoryQty, before }) as ModelRow

  it('ticking covers this line and earlier lines of the same card', () => {
    expect(ownedToggle(row(2, 0, 1, 1))).toEqual({ kind: 'set', qty: 3 })
    expect(ownedToggle(row(1, 0, 5))).toEqual({ kind: 'set', qty: 5 })
  })

  it('unticking asks first when other copies would go too', () => {
    expect(ownedToggle(row(1, 1, 1))).toEqual({ kind: 'set', qty: 0 })
    expect(ownedToggle(row(1, 1, 3))).toEqual({ kind: 'confirm', target: 0 })
  })
})
