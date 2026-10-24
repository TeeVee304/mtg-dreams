import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AverageDeckResult } from '@shared/deckWizard/averageDeck'
import { commanderThemes } from './themes'

/** EDHREC's answers by commanders: themes, or `missing`/`no deck` as EDHREC answers when it has none. */
const answers: Record<string, string[] | 'missing' | 'no deck' | 'offline'> = {
  Wilson: ['Voltron', 'Bears', 'Ramp', 'Counters'],
  'Wilson\nRaised by Giants': 'no deck',
  Okaun: ['Chaos'],
  'Okaun\nZndrsplt': ['Chaos', 'Coin Flip'],
  'Nobody\nBackground': 'missing',
  Nobody: 'missing',
  'Far\nAway': 'offline',
  Far: 'offline'
}
const averageDeck = vi.fn(async (commanders: string[]): Promise<AverageDeckResult> => {
  const answer = answers[commanders.join('\n')]
  if (answer === 'no deck' || answer === 'offline') throw new Error(answer)
  if (answer === 'missing' || !answer) return { status: 'missing' }
  return { status: 'ok', deck: { commanders, cards: [], decks: 10, themes: answer.map((name) => ({ slug: name, name, decks: 1 })) } }
})

beforeEach(() => {
  averageDeck.mockClear()
  vi.stubGlobal('window', { deckWizard: { averageDeck } })
})

describe("a commander's themes", () => {
  it("are a pair's own when EDHREC has a deck for the pair", async () => {
    expect(await commanderThemes(['Okaun', 'Zndrsplt'])).toEqual(['Chaos', 'Coin Flip'])
  })

  it("fall back to the commander's own when the pair has no deck, as with a Background", async () => {
    expect(await commanderThemes(['Wilson', 'Raised by Giants'])).toEqual(['Voltron', 'Bears', 'Ramp', 'Counters'])
    expect(await commanderThemes(['Nobody', 'Background'])).toEqual([])
  })

  it("fail when EDHREC can't be reached, so asking again tries again", async () => {
    await expect(commanderThemes(['Far', 'Away'])).rejects.toThrow('offline')
    await expect(commanderThemes(['Far', 'Away'])).rejects.toThrow('offline')
    expect(averageDeck).toHaveBeenCalledTimes(4)
  })
})
