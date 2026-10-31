import { describe, expect, it, vi } from 'vitest'
import type { CardQuery, ResolvedCard } from '@shared/types'
import { localizeText, localizeTradeCards, type Resolve } from './localize'

/** A resolver that knows a few names and printings. */
const known: Record<string, ResolvedCard> = {
  'Sol Ring': { name: 'Sol Ring' },
  Relámpago: { name: 'Lightning Bolt', lang: 'es' },
  稲妻: { name: 'Lightning Bolt', lang: 'ja' },
  Relampago: { name: 'Lightning Bolt', fuzzy: true },
  'a25/141': { name: 'Lightning Bolt', set: 'a25', collector: '141' }
}
const resolve: Resolve = async (queries: CardQuery[]) =>
  queries.map((query) => known['name' in query ? query.name : `${query.set}/${query.collector}`] ?? null)

describe('importing names in other languages', () => {
  it('names Cards in English, keeping their language, and leaves English names and other lines alone', async () => {
    const text = '// Burn\n4 Relámpago\n1 稲妻 {DE}\n1 Sol Ring\n'
    expect(await localizeText(text, resolve)).toBe('// Burn\n4 Lightning Bolt {ES}\n1 Lightning Bolt {DE}\n1 Sol Ring\n')
  })

  it('names a Card by its printing when its name is unknown', async () => {
    expect(await localizeText('2 Blitz <141> [A25] (F)\n', resolve)).toBe('2 Lightning Bolt <141> [A25] (F)\n')
  })

  it('leaves near matches, unknown names and text with nothing to change as they are', async () => {
    const text = '1 Relampago\n1 Zzyzx\n1  Sol Ring\n'
    expect(await localizeText(text, resolve)).toBe(text)
  })

  it('names a trade list\'s Cards in English, merging a Card listed under two names', async () => {
    const haves = [
      { name: 'Relámpago', qty: 2, worthless: 1 },
      { name: 'Lightning Bolt', qty: 1 },
      { name: 'Relampago', qty: 1 },
      { name: 'Sol Ring', qty: 1 }
    ]
    expect(await localizeTradeCards(haves, resolve)).toEqual([
      { name: 'Lightning Bolt', qty: 3, worthless: 1 },
      { name: 'Relampago', qty: 1 },
      { name: 'Sol Ring', qty: 1 }
    ])
    const english = [{ name: 'Sol Ring', qty: 1 }]
    expect(await localizeTradeCards(english, resolve)).toBe(english)
  })

  it('keeps the text when the resolver fails', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await localizeText('4 Relámpago\n', failing)).toBe('4 Relámpago\n')
  })
})
