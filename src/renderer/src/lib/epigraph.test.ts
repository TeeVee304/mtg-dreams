import { describe, expect, it } from 'vitest'
import { epigraphOf } from './epigraph'

describe('a deck page epigraph', () => {
  it('leaves out the author, on its own line or after the quote', () => {
    expect(epigraphOf('"I have yet to discover a story that predates her."\n—Huatli, warrior poet')).toBe('“I have yet to discover a story that predates her.”')
    expect(epigraphOf('"Swords, meet sorcery!" —Gale')).toBe('“Swords, meet sorcery!”')
  })

  it('keeps dashes inside the text, and dialogue lines', () => {
    expect(epigraphOf('The forest remembers — and it forgives nothing.')).toBe('The forest remembers — and it forgives nothing.')
    expect(epigraphOf('"These fiends are slightly less tolerable than you."\n"A sentiment that warms my heart, sister."')).toBe(
      '“These fiends are slightly less tolerable than you.”\n“A sentiment that warms my heart, sister.”'
    )
  })

  it('curls quotes and apostrophes', () => {
    expect(epigraphOf(`"It's 'mine' now."`)).toBe('“It’s ‘mine’ now.”')
  })
})
