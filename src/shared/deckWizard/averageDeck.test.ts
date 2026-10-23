import { describe, expect, it } from 'vitest'
import { parseList } from '../decklist'
import { listCommanders, listFormat } from '../formats'
import {
  averageDeckName,
  averageDeckPath,
  averageDeckText,
  commanderSlug,
  isFilters,
  NO_FILTERS,
  parseAverageDeck
} from './averageDeck'

/** A trimmed EDHREC average deck page. */
const PAGE = {
  deck: {
    commander: ["Atraxa, Praetors' Voice"],
    commander_v2: [["Atraxa, Praetors' Voice", 1]],
    cards: {
      Creature: [['Blightbelly Rat', 1], ['Bad', 0]],
      Land: [['Forest', 3], ['Command Tower', 1]],
      Other: 'nonsense'
    }
  },
  tag_counts: [
    { count: 2185, slug: 'plus-1-plus-1-counters', value: '+1/+1 Counters' },
    { count: 3740, slug: 'infect', value: 'Infect' },
    { slug: 'broken' }
  ],
  budget_counts: { budget: 400, middle: 3000, expensive: 340 },
  bracket_counts: { 1: 10, 2: 1200, 3: 900 }
}

describe('EDHREC average decks', () => {
  it('names commanders as EDHREC does', () => {
    expect(commanderSlug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice')
    expect(commanderSlug('Kenrith, the Returned King')).toBe('kenrith-the-returned-king')
    expect(commanderSlug('Lim-Dûl the Necromancer')).toBe('lim-dul-the-necromancer')
    expect(commanderSlug('Esika, God of the Tree // The Prismatic Bridge')).toBe('esika-god-of-the-tree')
  })

  it('builds the path of a mix: bracket, theme, budget', () => {
    expect(averageDeckPath(["Atraxa, Praetors' Voice"], NO_FILTERS)).toBe('atraxa-praetors-voice')
    expect(averageDeckPath(["Atraxa, Praetors' Voice"], { theme: 'infect', bracket: 'core', budget: 'budget' })).toBe(
      'atraxa-praetors-voice/core/infect/budget'
    )
    expect(averageDeckPath(['Tymna the Weaver', "Kraum, Ludevic's Opus"], NO_FILTERS)).toBe('kraum-ludevics-opus-tymna-the-weaver')
  })

  it('checks filters sent by the window', () => {
    expect(isFilters(NO_FILTERS)).toBe(true)
    expect(isFilters({ theme: 'infect', bracket: 'cedh', budget: 'expensive' })).toBe(true)
    expect(isFilters({ theme: '../x', bracket: null, budget: null })).toBe(false)
    expect(isFilters({ theme: null, bracket: 'casual', budget: null })).toBe(false)
    expect(isFilters(null)).toBe(false)
  })

  it('reads the deck, its themes and the decks averaged', () => {
    const deck = parseAverageDeck(PAGE, NO_FILTERS)
    expect(deck.commanders).toEqual(["Atraxa, Praetors' Voice"])
    expect(deck.cards).toEqual([
      { name: 'Blightbelly Rat', qty: 1, type: 'Creature' },
      { name: 'Forest', qty: 3, type: 'Land' },
      { name: 'Command Tower', qty: 1, type: 'Land' }
    ])
    expect(deck.themes.map((theme) => theme.slug)).toEqual(['infect', 'plus-1-plus-1-counters'])
    expect(deck.decks).toBe(3740)
    expect(parseAverageDeck(PAGE, { theme: null, bracket: 'core', budget: 'budget' }).decks).toBe(400)
    expect(() => parseAverageDeck({}, NO_FILTERS)).toThrow('EDHREC sent no deck.')
  })

  it('makes a Commander list led by the commander', () => {
    const lines = parseList(averageDeckText(parseAverageDeck(PAGE, NO_FILTERS)))
    expect(listFormat(lines)?.id).toBe('commander')
    expect(listCommanders(lines)).toEqual(["Atraxa, Praetors' Voice"])
    expect(averageDeckText(parseAverageDeck(PAGE, NO_FILTERS))).toContain('3 Forest')
  })

  it('reads and builds a deck of two partners', () => {
    const pair = {
      ...PAGE,
      deck: { ...PAGE.deck, commander: ['Kraum, Ludevic\'s Opus', 'Tymna the Weaver'], commander_v2: [["Kraum, Ludevic's Opus", 1], ['Tymna the Weaver', 1]] }
    }
    const deck = parseAverageDeck(pair, NO_FILTERS)
    expect(deck.commanders).toEqual(["Kraum, Ludevic's Opus", 'Tymna the Weaver'])
    const lines = parseList(averageDeckText(deck))
    expect(listCommanders(lines)).toEqual(["Kraum, Ludevic's Opus", 'Tymna the Weaver'])
    expect(averageDeckText(deck)).toContain('1 Tymna the Weaver')
  })

  it('names the list after the commanders and theme', () => {
    expect(averageDeckName(["Atraxa, Praetors' Voice"], 'Infect')).toBe('Atraxa Infect')
    expect(averageDeckName(['Flubs, the Fool'], null)).toBe('Flubs')
    expect(averageDeckName(['Tymna the Weaver', "Kraum, Ludevic's Opus"], null)).toBe('Tymna the Weaver & Kraum')
  })
})
