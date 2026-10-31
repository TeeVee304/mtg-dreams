import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cacheSizes, clearCaches } from './caches'
import { writeCacheFile, writeCacheFileNow } from './cacheFiles'
import { setEnvironment, SERVICES } from './environment'
import { scryfallCache } from './scryfallCache'

let dir = ''
/** Writes a file of `bytes` bytes under userData. */
const put = (path: string, bytes: number) => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), 'x'.repeat(bytes))
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-caches-'))
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test' })
  put('scryfall-cache.json', 100)
  put('rulings.json', 20)
  put('price-guide.json', 50)
  put('images/a.jpg', 7)
  put('images/b-back.jpg', 3)
  put('precons/index.json', 4)
  put('precons/deck-v2-x.json', 6)
  put('edhrec/v3/commanders/atraxa.json', 9)
  put('token-cache.json', 2)
  put('price-history.json', 30)
  put('settings.json', 5)
  scryfallCache.entries = { 'sol ring': {} as never, 'llanowar elves': {} as never }
})
afterAll(() => rm(dir, { recursive: true, force: true }))

describe('the caches', () => {
  it('add up by what Settings calls them, folders included', async () => {
    expect(await cacheSizes()).toEqual({
      bytes: { cards: 120, prices: 50, images: 10, precons: 10, edhrec: 9, tokens: 2, setGroups: 0 },
      cards: 2
    })
  })

  it('clear all at once, keeping the price history and settings, and nothing writes them back', async () => {
    await clearCaches()
    expect(readdirSync(dir).sort()).toEqual(['price-history.json', 'settings.json'])
    await writeCacheFile('scryfall-cache.json', { version: 1 })
    writeCacheFileNow('token-cache.json', {})
    expect(existsSync(join(dir, 'scryfall-cache.json'))).toBe(false)
    expect(existsSync(join(dir, 'token-cache.json'))).toBe(false)
  })
})
