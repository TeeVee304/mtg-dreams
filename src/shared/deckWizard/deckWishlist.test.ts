import { describe, expect, it } from 'vitest'
import { cardLines, parseList } from '../decklist'
import { draftDeck } from './deckDraft'
import { wishlistText } from './deckWishlist'
import { listCommander, listFormat } from '../formats'
import { BRIEF, setUp } from './testDecks'

const { pool } = setUp(BRIEF)
const draft = draftDeck(pool)

describe('saving a wizard deck as a wishlist', () => {
  const text = wishlistText(BRIEF, { picks: draft.picks, summary: 'Play lands, empty your hand and burn the table with Valakut.', notes: ['Kept Blood Moon on purpose.'] })
  const lines = parseList(text)

  it('is a Commander list led by the commander, with all 100 cards', () => {
    expect(listFormat(lines)?.id).toBe('commander')
    expect(listCommander(lines)).toBe('Flubs, the Fool')
    expect(cardLines(lines).reduce((sum, line) => sum + line.qty, 0)).toBe(100)
    expect(cardLines(lines)[0].name).toBe('Flubs, the Fool')
    expect(cardLines(lines).at(-1)?.name).toMatch(/^(Mountain|Forest|Island)$/)
  })

  it('keeps the summary, notes and every card’s reason as comments', () => {
    expect(text).toContain(
      '// Built with the Deck Wizard: Bracket 2 · Core, Midrange, Group Slug, Landfall.\n// How this deck plays:\n// Play lands, empty your hand and burn the table with Valakut.\n// Note: Kept Blood Moon on purpose.'
    )
    expect(text).toMatch(/^\/\/ Valakut, the Molten Pinnacle \(Lands\): Your key card\./m)
    expect(text).not.toMatch(/^\/\/ Mountain \(/m)
    expect(text.split('\n').every((line) => line.length <= 104)).toBe(true)
  })
})
