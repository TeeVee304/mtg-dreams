import { describe, expect, it } from 'vitest'
import { offeredGroups } from './deckPool'
import { BUILD_TOOLS, buildMessage, cardLine, CHANGE_TOOLS, changeMessage, readNames, readPicks, readSearch } from './deckPrompt'
import { checkDeck } from './deckCheck'
import { draftDeck } from './deckDraft'
import { BRIEF, setUp } from './testDecks'

const { pool, context } = setUp(BRIEF)
const entry = (name: string) => pool.eligible.get(name.toLowerCase())!

describe('card lines', () => {
  it('carry cost, type, price, jobs, connections and rules text', () => {
    expect(cardLine(entry('Seismic Assault'))).toBe(
      'Seismic Assault {R}{R}{R} · Enchantment · €0.50 · jobs: removal, burn · links: feeds Flubs (empty hand) · “Discard a land card: This enchantment deals 2 damage to any target.”'
    )
  })

  it('warn about cards that work against the commander or key cards', () => {
    expect(cardLine(entry('Harmonize'))).toContain('⚠ against Flubs: fills your hand with cards')
  })
})

describe('the first message of a build', () => {
  const message = buildMessage(pool, offeredGroups(pool))

  it('gives the brief, the key cards and the budget in plain words', () => {
    expect(message).toContain('- Commander: Flubs, the Fool')
    expect(message).toContain('- Key cards, always in the deck: Valakut, the Molten Pinnacle')
    expect(message).toContain('- Ways to win: Burn the table (burn); Win with lands entering (landfall); Out-value the table (value)')
    expect(message).toContain('- Pet cards, include them if they fit: Crucible of Worlds')
    expect(message).toContain('- Leave out: Exploration')
    expect(message).toContain('€200.00 for the whole deck, commander included; the commander and key cards cost €1.00, leaving €199.00; at most €20.00 per card')
  })

  it('gives the plan with slot ids and how many cards to pick', () => {
    expect(message).toMatch(/^- `land` Land: 40\. Commander decks usually play 36 to 38 lands\./m)
    expect(message).toContain('- `route:burn` Burn the table: 4.')
    expect(message).toContain('Pick 59 spells for the slots besides `land`, and up to 17 nonbasic lands for `land`.')
  })

  it('gives the shortlist per slot, each card once', () => {
    expect(message).toContain('## `route:burn` Burn the table — pick 4')
    expect(message).toContain('## `land` Land — pick up to 18 nonbasic')
    const lines = message.split('\n').filter((line) => line.startsWith('- ') && line.includes(' · '))
    const cards = lines.map((line) => line.slice(2).split(' {')[0].split(' · ')[0])
    expect(new Set(cards).size).toBe(cards.length)
  })
})

describe('the first message of a change', () => {
  it('gives the deck as it is, its warnings and the player’s request', () => {
    const draft = draftDeck(pool)
    const message = changeMessage(pool, draft.picks, 'Burn them out.', checkDeck(draft.picks, context), '  More removal please. ')
    expect(message).toContain('# The deck as it is\nBurn them out.')
    expect(message).toMatch(/^- \d+ Mountain \(`land`\) — Basic land\./m)
    expect(message).toContain('# The player asks\nMore removal please.')
  })
})

describe('tools', () => {
  it('let Claude search, look up and hand in a deck, or change one', () => {
    expect(BUILD_TOOLS.map((t) => t.name)).toEqual(['search_cards', 'look_up_cards', 'submit_deck', 'change_deck', 'finish_deck'])
    expect(CHANGE_TOOLS.map((t) => t.name)).toEqual(['search_cards', 'look_up_cards', 'change_deck'])
  })

  it('read picks, reporting ones that can’t be used', () => {
    expect(readPicks('nope', pool).problems).toEqual(['The picks must be a list of cards.'])
    const read = readPicks(
      [
        { name: 'Seismic Assault', slot: 'route:burn', reason: '  Damage.  ' },
        { name: 'Bear 1', slot: 'finisher', reason: 'x' },
        { slot: 'theme' },
        { name: 'Bear 2', slot: 'theme' }
      ],
      pool
    )
    expect(read.picks).toEqual([
      { name: 'Seismic Assault', slot: 'route:burn', reason: 'Damage.' },
      { name: 'Bear 2', slot: 'theme', reason: 'Fits the plan.' }
    ])
    expect(read.problems).toEqual([expect.stringMatching(/^Bear 1 has slot “finisher”, which isn't in the plan\. Slots: land, /), 'A pick has no card name.'])
  })

  it('read searches and names', () => {
    expect(readSearch({ text: ' landfall ', slot: 'ramp', max_price: 5, max_mana_value: 'x', limit: 10 })).toEqual({
      text: 'landfall', slot: 'ramp', type: undefined, maxPrice: 5, maxManaValue: undefined, limit: 10
    })
    expect(readNames(['A', '', 3, ' B '])).toEqual(['A', 'B'])
  })
})
