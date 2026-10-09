import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cachedFetch, clearCacheMemory, readCacheFile, writeCacheFile, writeCacheFileNow } from './cacheFiles'
import { setEnvironment, SERVICES } from './environment'

let dir = ''
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-cachefiles-'))
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test' })
})
afterAll(() => rm(dir, { recursive: true, force: true }))

describe('cache files', () => {
  it('write whole files, creating folders, and read them back', async () => {
    await writeCacheFile('precons/index.json', { decks: 3 })
    expect(await readCacheFile('precons/index.json')).toEqual({ decks: 3 })
    expect(readdirSync(join(dir, 'precons'))).toEqual(['index.json'])
    writeCacheFileNow('quit.json', [1, 2])
    expect(await readCacheFile('quit.json')).toEqual([1, 2])
  })

  it('read as null when missing or damaged, so the cache is simply rebuilt', async () => {
    expect(await readCacheFile('missing.json')).toBeNull()
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    expect(await readCacheFile('broken.json')).toBeNull()
  })

  it('never fail the app when a write is impossible', async () => {
    writeFileSync(join(dir, 'blocker'), '')
    await expect(writeCacheFile('blocker/inside.json', {})).resolves.toBeUndefined()
    expect(() => writeCacheFileNow('blocker/inside.json', {})).not.toThrow()
    expect(existsSync(join(dir, 'blocker', 'inside.json'))).toBe(false)
  })
})

describe('cached fetches', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('fetch once, then answer from memory and, after a restart, from disk', async () => {
    let fetched = 0
    const fetch = async () => ({ answer: ++fetched })
    expect(await cachedFetch('answers/a.json', DAY, fetch)).toEqual({ answer: 1 })
    expect(await cachedFetch('answers/a.json', DAY, fetch)).toEqual({ answer: 1 })
    clearCacheMemory()
    expect(await cachedFetch('answers/a.json', DAY, fetch)).toEqual({ answer: 1 })
    expect(fetched).toBe(1)
  })

  it('fetch again once stale, and serve the stale copy when that fails', async () => {
    let fetched = 0
    await cachedFetch('answers/b.json', DAY, async () => ++fetched)
    expect(await cachedFetch('answers/b.json', 0, async () => ++fetched)).toBe(2)
    expect(await cachedFetch('answers/b.json', 0, () => Promise.reject(new Error('offline')))).toBe(2)
  })

  it('fail when nothing is cached and the fetch fails', async () => {
    await expect(cachedFetch('answers/c.json', DAY, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
  })
})
