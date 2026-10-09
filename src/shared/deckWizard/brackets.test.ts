import { describe, expect, it } from 'vitest'
import { bracketIssues, bracketOf, comboBreaks, localFacts, mergeFacts } from './brackets'
import type { BracketFacts } from './combos'
import { readCard } from './mechanics'

/** Facts with only the given fields. */
const facts = (partial: Partial<BracketFacts>): BracketFacts => ({ tag: null, gameChangers: [], massLandDenial: [], extraTurns: [], combos: [], ...partial })
const kiki = { cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'], twoCard: true, lock: false, manaValue: 9 }
const thoracle = { cards: ["Thassa's Oracle", 'Demonic Consultation'], twoCard: true, lock: false, manaValue: 3 }

describe('the Commander Brackets', () => {
  it('allows up to three Game Changers from Bracket 3, and any from Bracket 4', () => {
    const three = facts({ gameChangers: ['Cyclonic Rift', 'Demonic Tutor', 'Rhystic Study'] })
    expect(bracketIssues(three, 2)[0].message).toBe(
      '3 Game Changers (Cyclonic Rift, Demonic Tutor and Rhystic Study); Bracket 2 · Core allows none.'
    )
    expect(bracketIssues(three, 3)).toEqual([])
    expect(bracketIssues(facts({ gameChangers: ['A', 'B', 'C', 'D'] }), 3)[0].rule).toBe('game-changers')
    expect(bracketIssues(facts({ gameChangers: ['A', 'B', 'C', 'D'] }), 4)).toEqual([])
  })

  it('keeps two-card combos out of low brackets, and early ones out of Bracket 3', () => {
    expect(comboBreaks(kiki, 2)).toBe(true)
    expect(comboBreaks(kiki, 3)).toBe(false)
    expect(comboBreaks(thoracle, 3)).toBe(true)
    expect(comboBreaks(thoracle, 4)).toBe(false)
    expect(comboBreaks({ ...kiki, twoCard: false }, 1)).toBe(false)
    expect(bracketIssues(facts({ combos: [thoracle] }), 3)[0].message).toBe(
      "A two-card combo that comes together early: Thassa's Oracle and Demonic Consultation. Bracket 3 · Upgraded doesn't allow it."
    )
  })

  it('keeps land destruction and chained extra turns below Bracket 4', () => {
    expect(bracketIssues(facts({ massLandDenial: ['Armageddon'] }), 3)[0].message).toBe("Land destruction (Armageddon) isn't allowed in Bracket 3 · Upgraded.")
    expect(bracketIssues(facts({ extraTurns: ['Time Warp'] }), 2)).toEqual([])
    expect(bracketIssues(facts({ extraTurns: ['Time Warp', 'Temporal Manipulation'] }), 3)[0].rule).toBe('extra-turns')
  })

  it('finds the lowest bracket a deck fits, and why', () => {
    expect(bracketOf(facts({}))).toEqual({ bracket: 2, reasons: [] })
    expect(bracketOf(facts({ gameChangers: ['Demonic Tutor'] }))).toEqual({
      bracket: 3,
      reasons: ['1 Game Changer (Demonic Tutor); Bracket 2 · Core allows none.']
    })
    expect(bracketOf(facts({ combos: [thoracle] })).bracket).toBe(4)
  })

  it('reads the facts from the cards when Commander Spellbook can’t be reached, and merges both', () => {
    const local = localFacts([
      { name: 'Demonic Tutor', gameChanger: true },
      { name: 'Armageddon', profile: readCard({ name: 'Armageddon', typeLine: 'Sorcery', text: 'Destroy all lands.', keywords: [] }) },
      { name: 'Time Warp', profile: readCard({ name: 'Time Warp', typeLine: 'Sorcery', text: 'Target player takes an extra turn after this one.', keywords: [] }) }
    ])
    expect(local).toEqual(facts({ gameChangers: ['Demonic Tutor'], massLandDenial: ['Armageddon'], extraTurns: ['Time Warp'] }))
    const merged = mergeFacts(local, facts({ tag: 'R', gameChangers: ['demonic tutor', 'Rhystic Study'], combos: [kiki] }))
    expect(merged).toMatchObject({ tag: 'R', gameChangers: ['Demonic Tutor', 'Rhystic Study'], combos: [kiki] })
  })
})
