import { describe, expect, it } from 'vitest'
import { promiseCache } from './promiseCache'

describe('the promise cache', () => {
  it('makes a result once for callers asking at the same time', async () => {
    const cache = promiseCache<number>(2)
    let made = 0
    const make = () => new Promise<number>((resolve) => setTimeout(() => resolve(++made), 5))
    const [a, b] = await Promise.all([cache.get('x', make), cache.get('x', make)])
    expect([a, b, made]).toEqual([1, 1, 1])
    expect(await cache.get('x', make)).toBe(1)
  })

  it('drops the least recently used past its size', async () => {
    const cache = promiseCache<string>(2)
    const make = (value: string) => () => Promise.resolve(value)
    await cache.get('a', make('a'))
    await cache.get('b', make('b'))
    await cache.get('a', make('a again'))
    await cache.get('c', make('c'))
    expect(cache.size).toBe(2)
    expect(await cache.get('a', make('a, new'))).toBe('a')
    expect(await cache.get('b', make('b, new'))).toBe('b, new')
  })

  it('forgets a failure, so asking again tries again', async () => {
    const cache = promiseCache<number>(2)
    await expect(cache.get('x', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
    expect(await cache.get('x', () => Promise.resolve(2))).toBe(2)
  })
})
