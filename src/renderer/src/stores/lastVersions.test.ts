import { describe, expect, it } from 'vitest'
import { MAX_REMEMBERED, parseMemory, startingVersion, withRemembered } from './lastVersions'

describe('last Versions', () => {
  it('starts a Card never added at Any Version, in the last language chosen', () => {
    expect(startingVersion({ cards: {} }, 'Sol Ring')).toEqual({ foil: false })
    const memory = withRemembered({ cards: {} }, 'Lightning Bolt', { set: '2x2', collector: '117', foil: true, lang: 'pt' })
    expect(startingVersion(memory, 'Sol Ring')).toEqual({ foil: false, lang: 'pt' })
    expect(startingVersion(memory, 'lightning bolt')).toEqual({ set: '2x2', collector: '117', foil: true, lang: 'pt' })
  })

  it('forgets the language once an English Version is chosen', () => {
    const portuguese = withRemembered({ cards: {} }, 'Lightning Bolt', { foil: false, lang: 'pt' })
    const english = withRemembered(portuguese, 'Sol Ring', { foil: false })
    expect(startingVersion(english, 'Counterspell')).toEqual({ foil: false })
  })

  it('reads back what it stored, dropping invalid entries and unreadable text', () => {
    const memory = withRemembered({ cards: {} }, 'Sol Ring', { set: 'c21', collector: '263', foil: false, lang: 'de' })
    expect(parseMemory(JSON.stringify(memory))).toEqual(memory)
    const stored = { cards: { 'sol ring': { foil: 'yes' }, 'lightning bolt': { foil: true, lang: 'xx', collector: '1' } }, lang: 'xx' }
    expect(parseMemory(JSON.stringify(stored))).toEqual({ cards: { 'lightning bolt': { foil: true } } })
    expect(parseMemory('{ "cards": ')).toEqual({ cards: {} })
    expect(parseMemory(null)).toEqual({ cards: {} })
  })

  it('forgets the Cards chosen longest ago first', () => {
    let memory = { cards: {} }
    for (let i = 0; i <= MAX_REMEMBERED; i++) memory = withRemembered(memory, `Card ${i}`, { foil: false })
    memory = withRemembered(memory, 'Card 1', { foil: true })
    expect(Object.keys(memory.cards)).toHaveLength(MAX_REMEMBERED)
    expect(Object.keys(memory.cards)[0]).toBe('card 2')
    expect(Object.keys(memory.cards).at(-1)).toBe('card 1')
  })
})
