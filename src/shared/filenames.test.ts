import { describe, expect, it } from 'vitest'
import { fileNameProblem, safeFileName } from './filenames'

describe('fileNameProblem', () => {
  it('accepts ordinary names and explains bad ones', () => {
    expect(fileNameProblem('Burn upgrades')).toBeNull()
    expect(fileNameProblem('')).toBe('Name cannot be empty.')
    expect(fileNameProblem('a'.repeat(101))).toMatch(/too long/)
    expect(fileNameProblem('A: B')).toMatch(/cannot contain/)
    expect(fileNameProblem('Ana M.')).toMatch(/end with a dot/)
    expect(fileNameProblem('com1')).toMatch(/reserved/)
  })
})

describe('safeFileName', () => {
  it('turns any text into a name that passes validation', () => {
    expect(safeFileName('Ana: the "Great"')).toBe('Ana - the Great')
    expect(safeFileName('CON')).toBe('CON_')
    expect(safeFileName('???')).toBe('')
    const samples = ['Ana M.', 'Aux', ' x / y ', 'Duskmourn: House of Horror', `${'Long name '.repeat(20)}.`, 'lpt3', 'a\tb']
    for (const text of samples) {
      const name = safeFileName(text)
      if (name) expect(fileNameProblem(name), text).toBeNull()
    }
  })
})
