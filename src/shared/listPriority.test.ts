import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { listPriority, priorityWeight, withPriority } from './listPriority'

describe('list priority', () => {
  it('reads the priority header, defaulting to normal', () => {
    expect(listPriority(parseList('// Priority: High\n4 Lightning Bolt'))).toBe('high')
    expect(listPriority(parseList('4 Lightning Bolt\n//priority:low'))).toBe('low')
    expect(listPriority(parseList('// Priority: Urgent'))).toBe('normal')
    expect(listPriority(parseList('4 Lightning Bolt'))).toBe('normal')
  })

  it('sets, replaces and removes the header', () => {
    const lines = withPriority(parseList('// Priority: Low\n4 Lightning Bolt'), 'high')
    expect(serializeList(lines)).toBe('// Priority: High\n4 Lightning Bolt\n')
    expect(serializeList(withPriority(lines, 'normal'))).toBe('4 Lightning Bolt\n')
  })

  it('weights priorities', () => {
    expect([priorityWeight('high'), priorityWeight('normal'), priorityWeight('low')]).toEqual([2, 1, 0.5])
  })
})
