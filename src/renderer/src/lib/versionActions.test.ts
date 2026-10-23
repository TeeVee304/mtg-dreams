import { describe, expect, it, vi } from 'vitest'
import type { CardLine } from '@shared/types'
import type { LibraryActions } from '../stores/library'
import type { Row } from './summary'
import { versionActions } from './versionActions'

const list = { kind: 'deck' as const, name: 'Elves' }
const line = (id: string, name: string, qty: number): CardLine => ({ kind: 'card', id, name, qty, foil: false })
const rows = [
  { line: line('a', 'Llanowar Elves', 4) },
  { line: line('b', 'Forest', 10), bundledIds: ['b', 'c'] },
  { line: line('l', 'Lathril, Blade of the Elves', 1) }
] as unknown as Row[]
/** Copies the version plays: the list's, as these tests leave it. */
const copies: Record<string, number> = { 'Llanowar Elves': 4, Forest: 12, 'Lathril, Blade of the Elves': 1, 'Elvish Mystic': 0 }

function setup() {
  const actions = { setVariantCount: vi.fn(), updateCard: vi.fn(), removeCard: vi.fn(), setListColor: vi.fn() } as unknown as LibraryActions
  const onCommanderCut = vi.fn()
  const { actions: edits, setCopies } = versionActions(actions, {
    list,
    version: 'Duel',
    rows,
    copiesOf: (name) => copies[name] ?? 0,
    isCommander: (row) => row.line.id === 'l',
    onCommanderCut
  })
  return { actions, edits, setCopies, onCommanderCut }
}

describe("a version's view", () => {
  it('turns quantities, additions and removals into swaps', () => {
    const { actions, edits } = setup()
    edits.updateCard(list, 'a', { qty: 2 })
    expect(actions.setVariantCount).toHaveBeenLastCalledWith(list, 'Duel', expect.objectContaining({ name: 'Llanowar Elves', foil: false }), 2)
    edits.addCards(list, [{ name: 'Elvish Mystic', qty: 1, foil: false, side: true }])
    expect(actions.setVariantCount).toHaveBeenLastCalledWith(list, 'Duel', expect.objectContaining({ name: 'Elvish Mystic', foil: false }), 1)
    edits.removeCard(list, 'a')
    expect(actions.setVariantCount).toHaveBeenLastCalledWith(list, 'Duel', expect.objectContaining({ name: 'Llanowar Elves', foil: false }), 0)
    edits.setBundledQty(list, ['c'], 8)
    expect(actions.setVariantCount).toHaveBeenLastCalledWith(list, 'Duel', expect.objectContaining({ name: 'Forest', foil: false }), 10)
    expect(actions.removeCard).not.toHaveBeenCalled()
  })

  it('applies other changes to the card in every version', () => {
    const { actions, edits } = setup()
    edits.updateCard(list, 'a', { qty: 3, set: 'DOM' })
    expect(actions.updateCard).toHaveBeenCalledWith(list, 'a', { set: 'DOM' })
    edits.setListColor(list, 'G')
    expect(actions.setListColor).toHaveBeenCalledWith(list, 'G')
  })

  it('keeps the commanders, which lead every version', () => {
    const { actions, edits, onCommanderCut } = setup()
    edits.removeCard(list, 'l')
    expect(onCommanderCut).toHaveBeenCalledOnce()
    expect(actions.setVariantCount).not.toHaveBeenCalled()
  })

  it('never sets fewer than no copies', () => {
    const { actions, setCopies } = setup()
    setCopies({ name: 'Elvish Mystic', qty: 0, foil: false }, -1)
    expect(actions.setVariantCount).toHaveBeenLastCalledWith(list, 'Duel', expect.objectContaining({ name: 'Elvish Mystic', foil: false }), 0)
  })
})
