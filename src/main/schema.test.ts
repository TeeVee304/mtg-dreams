import { describe, expect, it } from 'vitest'
import { latestVersion, pendingSteps, readVersion } from './schema'

describe('schema versions', () => {
  it('reads a missing or invalid version as 1', () => {
    expect([undefined, null, 0, -2, 1.5, '3', 4].map(readVersion)).toEqual([1, 1, 1, 1, 1, 1, 4])
  })

  it('is one more than the number of steps', () => {
    expect(latestVersion([])).toBe(1)
    expect(latestVersion(['a', 'b'])).toBe(3)
  })

  it('runs the steps after a version, each with the version it reaches, and none for a newer one', () => {
    const steps = ['1 to 2', '2 to 3', '3 to 4']
    expect(pendingSteps(1, steps)).toEqual([
      { step: '1 to 2', to: 2 },
      { step: '2 to 3', to: 3 },
      { step: '3 to 4', to: 4 }
    ])
    expect(pendingSteps(3, steps)).toEqual([{ step: '3 to 4', to: 4 }])
    expect(pendingSteps(4, steps)).toEqual([])
    expect(pendingSteps(9, steps)).toEqual([])
  })
})
