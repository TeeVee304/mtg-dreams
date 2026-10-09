import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newBrief } from '@shared/deckWizard/deckBrief'
import { briefKey, briefLines, clearDraft, listWords, loadDraft, newDraft, saveDraft } from './model'

/** localStorage, in memory. */
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key)
})
beforeEach(() => storage.clear())

const KEY = 'mtg-dreams.deckWizard'
const DECK = { picks: [], summary: '', notes: [], check: { issues: [], cards: 99, total: 0 }, prices: {} }

describe('the wizard’s saved draft', () => {
  it('saves and resumes a draft with a commander', () => {
    const draft = { ...newDraft(), brief: newBrief('Flubs, the Fool'), step: 'tune' as const, name: 'Flubs plan' }
    saveDraft(draft)
    expect(loadDraft()).toMatchObject({ step: 'tune', name: 'Flubs plan', brief: { commander: 'Flubs, the Fool' } })
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('offers nothing to resume without a commander, or for damaged data', () => {
    saveDraft(newDraft())
    expect(loadDraft()).toBeNull()
    storage.set(KEY, '{ not json')
    expect(loadDraft()).toBeNull()
  })

  it('moves drafts of earlier versions to today’s steps, and back to Build without a deck', () => {
    storage.set(KEY, JSON.stringify({ brief: newBrief('Flubs, the Fool'), step: 'plan' }))
    expect(loadDraft()?.step).toBe('idea')
    storage.set(KEY, JSON.stringify({ brief: newBrief('Flubs, the Fool'), step: 'review', deck: null }))
    expect(loadDraft()?.step).toBe('build')
    storage.set(KEY, JSON.stringify({ brief: newBrief('Flubs, the Fool'), step: 'review', deck: DECK, builtFrom: 'k' }))
    expect(loadDraft()).toMatchObject({ step: 'review', builtFrom: 'k' })
  })
})

describe('the brief in players’ words', () => {
  it('lists words the way people write them', () => {
    expect(listWords([])).toBe('')
    expect(listWords(['Sol Ring'])).toBe('Sol Ring')
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C')
  })

  it('names each answer, and marks what isn’t answered yet', () => {
    const lines = briefLines({ ...newBrief('Flubs, the Fool'), strategy: 'midrange', engines: ['land-enters'] })
    const line = (label: string) => lines.find((l) => l.label === label)!
    expect(line('Power level')).toMatchObject({ value: 'Bracket 2 · Core', step: 'power' })
    expect(line('Strategy')).toMatchObject({ value: 'Midrange', empty: false })
    expect(line('Themes').value).toBe('Landfall')
    expect(line('Key cards')).toMatchObject({ value: 'None', empty: true })
    expect(line('Interaction').value).toBe('Moderate, for Midrange')
  })

  it('keys a brief by what the deck is built to, ignoring locks and the idea picked', () => {
    const brief = newBrief('Flubs, the Fool')
    expect(briefKey({ ...brief, locks: ['Sol Ring'], ideaId: 'x' })).toBe(briefKey(brief))
    expect(briefKey({ ...brief, bracket: 3 })).not.toBe(briefKey(brief))
  })
})
