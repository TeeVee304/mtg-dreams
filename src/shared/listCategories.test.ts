import { describe, expect, it } from 'vitest'
import { cardLines, parseList, serializeList } from './decklist'
import {
  groupsByCategory,
  listCategories,
  withCategory,
  withGroupByCategory,
  withoutCategory,
  withRenamedCategory
} from './listCategories'
import { joinMeta, splitMeta } from './listMeta'

const text = (lines: ReturnType<typeof parseList>) => serializeList(lines)
const ids = (lines: ReturnType<typeof parseList>, ...names: string[]) =>
  cardLines(lines).filter((line) => names.includes(line.name)).map((line) => line.id)

describe('list categories', () => {
  it('turns grouping by category on and off, as a personal setting', () => {
    const lines = withGroupByCategory(parseList('1 Sol Ring'), true)
    expect(groupsByCategory(lines)).toBe(true)
    expect(splitMeta(text(lines)).meta).toEqual({ groupBy: 'Category' })
    expect(groupsByCategory(parseList(joinMeta('1 Sol Ring\n', { groupBy: 'Category' })))).toBe(true)
    expect(groupsByCategory(withGroupByCategory(lines, false))).toBe(false)
  })

  it('lists every category once, in the first spelling, alphabetically', () => {
    expect(listCategories(parseList('1 Sol Ring [Ramp,Artifact]\n1 Llanowar Elves [ramp,]\n1 Island'))).toEqual(['Artifact', 'Ramp'])
  })

  it('replaces a Card\'s first category, keeping the others and the list\'s spelling', () => {
    const lines = parseList('1 Sol Ring [Ramp,Artifact]\n1 Arcane Signet [Rocks]')
    expect(text(withCategory(lines, ids(lines, 'Sol Ring'), 'Draw'))).toBe('1 Sol Ring [Draw,Artifact]\n1 Arcane Signet [Rocks]\n')
    expect(text(withCategory(lines, ids(lines, 'Sol Ring'), 'rocks'))).toBe('1 Sol Ring [Rocks,Artifact]\n1 Arcane Signet [Rocks]\n')
    expect(text(withCategory(lines, ids(lines, 'Sol Ring'), ' [Card], Draw '))).toBe('1 Sol Ring [Card Draw,Artifact]\n1 Arcane Signet [Rocks]\n')
    expect(text(withCategory(lines, ids(lines, 'Sol Ring', 'Arcane Signet'), null))).toBe('1 Sol Ring\n1 Arcane Signet\n')
  })

  it('renames and deletes a category on every Card', () => {
    const lines = parseList('1 Sol Ring [Ramp,Artifact]\n1 Arcane Signet [Artifact,Ramp]\n1 Island')
    expect(text(withRenamedCategory(lines, 'ramp', 'Mana'))).toBe('1 Sol Ring [Mana,Artifact]\n1 Arcane Signet [Artifact,Mana]\n1 Island\n')
    expect(text(withRenamedCategory(lines, 'Ramp', 'Artifact'))).toBe('1 Sol Ring [Artifact]\n1 Arcane Signet [Artifact]\n1 Island\n')
    expect(text(withoutCategory(lines, 'Ramp'))).toBe('1 Sol Ring [Artifact]\n1 Arcane Signet [Artifact]\n1 Island\n')
  })
})
