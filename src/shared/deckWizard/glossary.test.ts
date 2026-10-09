import { describe, expect, it } from 'vitest'
import { STRATEGIES, WINCONS } from './deckBrief'
import { ROLES } from './vocabulary'
import { findTerms, glossaryEntry, GLOSSARY } from './glossary'

const marked = (text: string, seen?: Parameters<typeof findTerms>[1]) =>
  findTerms(text, seen).map((part) => (typeof part === 'string' ? part : `[${part.text}]`)).join('')

describe('the glossary', () => {
  it('marks each term the first time it appears, any case, as whole words', () => {
    expect(marked('Ramp early: Ramping and ramp again.')).toBe('[Ramp] early: Ramping and ramp again.')
    expect(marked('Gives card advantage and Landfall triggers.')).toBe('Gives [card advantage] and [Landfall] triggers.')
    expect(marked('A tramp stamps the ground')).toBe('A tramp stamps the ground')
  })

  it('prefers the longest phrase, and knows other forms of a term', () => {
    expect(marked('Two fetch lands and a board wipe.')).toBe('Two [fetch lands] and a [board wipe].')
    expect(glossaryEntry('Wraths')?.term).toBe('board wipe')
  })

  it('skips terms already explained elsewhere on the page', () => {
    const seen = new Set([glossaryEntry('ramp')!])
    expect(marked('More ramp and burn.', seen)).toBe('More ramp and [burn].')
    expect(seen.has(glossaryEntry('burn')!)).toBe(true)
  })

  it('explains every community name the wizard shows for strategies, win conditions and jobs', () => {
    // "Control" alone would mark "you control" in rules text; "control deck" covers it. Lands and
    // Protection need no explaining, and "protection from" would be misread.
    const shown = [
      ...Object.values(STRATEGIES).map((c) => c.label).filter((label) => label !== 'Control'),
      ...Object.values(WINCONS).map((c) => c.label),
      ...Object.values(ROLES).map((r) => r.label).filter((label) => label !== 'Lands' && label !== 'Protection'),
      'Bracket',
      'Game Changer',
      'Interaction',
      'Combo'
    ]
    expect(shown.filter((label) => !glossaryEntry(label))).toEqual([])
  })

  it('has one meaning per term and form', () => {
    const forms = GLOSSARY.flatMap((e) => [e.term, ...(e.also ?? [])].map((f) => f.toLowerCase()))
    expect(new Set(forms).size).toBe(forms.length)
  })
})
