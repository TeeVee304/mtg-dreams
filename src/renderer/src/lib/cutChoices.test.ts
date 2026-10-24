import { describe, expect, it } from 'vitest'
import { cardLines, parseList } from '@shared/decklist'
import { cutChoices } from './cutChoices'

describe('cut choices', () => {
  it('offers each cuttable card once, with its copies across lines', () => {
    const lines = cardLines(parseList("1 Atraxa, Praetors' Voice\n2 Forest [M21]\n3 Forest\n1 Sol Ring"))
    const choices = cutChoices(lines, (key) => !key.startsWith('atraxa'))
    expect(choices.map((choice) => choice.name)).toEqual(['Forest', 'Sol Ring'])
    expect(choices[0].hint).toMatch(/5/)
    expect(choices[1].hint).toBeUndefined()
  })
})
