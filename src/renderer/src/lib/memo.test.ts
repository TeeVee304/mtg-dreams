import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoLast } from './memo'
import { createSignal } from './signal'

afterEach(() => vi.useRealTimers())

describe('memoizing on the latest arguments', () => {
  it('reuses the result while the arguments are the same objects', () => {
    const fn = vi.fn((list: number[], factor: number) => list.map((n) => n * factor))
    const memo = memoLast(fn)
    const list = [1, 2]
    const first = memo(list, 2)
    expect(memo(list, 2)).toBe(first)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(memo([1, 2], 2)).toEqual([2, 4])
    expect(memo(list, 3)).toEqual([3, 6])
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('store signals', () => {
  it('bump their version on every change', () => {
    const signal = createSignal()
    expect(signal.version()).toBe(0)
    signal.emit()
    signal.emit()
    expect(signal.version()).toBe(2)
  })

  it('gather the changes that follow into one, after a delay', () => {
    vi.useFakeTimers()
    const signal = createSignal(50)
    signal.emit()
    signal.emit()
    expect(signal.version()).toBe(0)
    vi.advanceTimersByTime(50)
    expect(signal.version()).toBe(1)
  })
})
