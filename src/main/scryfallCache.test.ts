import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRINTINGS_MAX_AGE_MS } from '@shared/pricing'
import type { Printing, PrintingsResult } from '@shared/types'

const printing = (id: string, extra: Partial<Printing> = {}): Printing => ({
  id,
  name: 'Sol Ring',
  set: 'cmm',
  setName: 'Commander Masters',
  collectorNumber: '1',
  rarity: 'uncommon',
  releasedAt: '2023-08-04',
  lang: 'en',
  finishes: ['nonfoil', 'foil'],
  cardmarketId: 721234,
  price: { trend: 1.5 },
  priceFoil: { trend: 3 },
  imageSmall: `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg`,
  imageNormal: `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`,
  cardmarketUrl:
    'https://www.cardmarket.com/en/Magic/Products?idProduct=721234&referrer=scryfall&utm_campaign=card_prices&utm_medium=text&utm_source=scryfall',
  labels: [],
  autoEligible: true,
  ...extra
})

const result = (printings: Printing[], fetchedAt = Date.now()): PrintingsResult => ({ name: 'Sol Ring', printings, fetchedAt })

/** How versions 3–5 stored a printing: whole, with links, Scryfall's prices as eur/eurFoil. */
const oldFormat = (id: string) => {
  const { cardmarketId: _id, price: _price, priceFoil: _foil, ...rest } = printing(id)
  return { ...rest, eur: 1.5, eurFoil: 3, scryfallUrl: 'https://scryfall.com/x', imageSmall: `${rest.imageSmall}?123` }
}

const dirs: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A fresh copy of the cache module using its own folder. */
async function setup(dir?: string) {
  vi.resetModules()
  const userData = dir ?? (await mkdtemp(join(tmpdir(), 'mtg-dreams-cache-')))
  dirs.push(userData)
  const { setEnvironment, SERVICES } = await import('./environment')
  setEnvironment({ userData, documents: userData, appData: userData, trash: async () => undefined, userAgent: 'test', ...SERVICES })
  return { userData, file: join(userData, 'scryfall-cache.json'), cache: await import('./scryfallCache') }
}

describe('stored printings', () => {
  it('leave out what can be rebuilt, and come back identical', async () => {
    const { cache } = await setup()
    const full = printing('2973e855-fe93-41a1-a62e-4699ef2c3d1d')
    const stored = cache.packPrinting(full)
    expect(stored).not.toHaveProperty('imageSmall')
    expect(stored).not.toHaveProperty('imageNormal')
    expect(stored.cardmarket).toBe(721234)
    expect(stored).not.toHaveProperty('cardmarketId')
    expect(stored).toMatchObject({ eur: 1.5, eurFoil: 3 })
    expect(cache.unpackPrinting(stored)).toEqual(full)
    expect(JSON.stringify(stored).length).toBeLessThan(JSON.stringify(full).length / 2)
  })

  it('keep anything unusual as it is', async () => {
    const { cache } = await setup()
    const odd = printing('abc', {
      imageSmall: null,
      imageNormal: 'https://example.com/odd.jpg',
      cardmarketUrl: 'https://www.cardmarket.com/en/Magic/Products/Search?searchString=Sol+Ring'
    })
    expect(cache.packPrinting(odd).cardmarketId).toBe(721234)
    expect(cache.unpackPrinting(cache.packPrinting(odd))).toEqual(odd)
    const unlisted = printing('def', { cardmarketUrl: null, cardmarketId: null, price: {}, priceFoil: {} })
    expect(cache.unpackPrinting(cache.packPrinting(unlisted))).toEqual(unlisted)
  })

  it('keep only Scryfall\'s trend: Cardmarket\'s other prices are never cached', async () => {
    const { cache } = await setup()
    const priced = printing('abc', { price: { trend: 1.5, low: 0.9, avg30: 1.7 }, priceFoil: { trend: 3, low: 2 } })
    expect(cache.unpackPrinting(cache.packPrinting(priced))).toEqual(printing('abc'))
  })
})

describe('the cache file', () => {
  it('survives a restart', async () => {
    const first = await setup()
    first.cache.scryfallCache.entries['sol ring'] = result([printing('aaa'), printing('bbb')])
    first.cache.scryfallCacheChanged()
    first.cache.flushScryfallCache()
    expect(JSON.parse(readFileSync(first.file, 'utf8')).version).toBe(7)

    const restarted = await setup(first.userData)
    await restarted.cache.loadScryfallCache()
    expect(restarted.cache.scryfallCache.entries['sol ring']).toEqual(first.cache.scryfallCache.entries['sol ring'])
  })

  it('reads older files: versions 5 and 6 as they are, versions 3–4 marked for a refresh', async () => {
    const { userData, file } = await setup()
    const entry = result([printing('aaa')])
    writeFileSync(file, JSON.stringify({ version: 5, entries: { 'sol ring': { ...entry, printings: [oldFormat('aaa')] } }, cards: {} }))
    const v5 = await setup(userData)
    await v5.cache.loadScryfallCache()
    expect(v5.cache.scryfallCache.entries['sol ring']).toEqual(entry)
    v5.cache.flushScryfallCache()
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(7)

    const v6Printing = { ...v5.cache.packPrinting(printing('aaa')), eurFoil: null }
    writeFileSync(file, JSON.stringify({ version: 6, entries: { 'sol ring': { ...entry, printings: [v6Printing] } }, cards: {} }))
    const v6 = await setup(userData)
    await v6.cache.loadScryfallCache()
    expect(v6.cache.scryfallCache.entries['sol ring'].printings[0]).toEqual(printing('aaa', { priceFoil: {} }))

    writeFileSync(file, JSON.stringify({ version: 4, entries: { 'sol ring': { ...entry, printings: [oldFormat('aaa')] } }, cards: {} }))
    const v4 = await setup(userData)
    await v4.cache.loadScryfallCache()
    expect(Date.now() - v4.cache.scryfallCache.entries['sol ring'].fetchedAt).toBeGreaterThan(PRINTINGS_MAX_AGE_MS)
  })

  it('drops month-old entries, and ignores files it does not understand', async () => {
    const { userData, file } = await setup()
    writeFileSync(file, JSON.stringify({ version: 6, entries: { old: result([], Date.now() - 40 * 86_400_000) }, cards: {} }))
    const loaded = await setup(userData)
    await loaded.cache.loadScryfallCache()
    expect(loaded.cache.scryfallCache.entries).toEqual({})

    const good = { ...result([]), printings: [] }
    writeFileSync(file, JSON.stringify({ version: 6, entries: { bad: { ...good, printings: null }, good }, cards: {} }))
    const partial = await setup(userData)
    await partial.cache.loadScryfallCache()
    expect(Object.keys(partial.cache.scryfallCache.entries)).toEqual(['good'])

    writeFileSync(file, '{ not json')
    const broken = await setup(userData)
    await broken.cache.loadScryfallCache()
    expect(broken.cache.scryfallCache.entries).toEqual({})
  })

  it('is never overwritten while it is still being read', async () => {
    const { userData, file } = await setup()
    writeFileSync(file, JSON.stringify({ version: 6, entries: { 'sol ring': { ...result([]), printings: [] } }, cards: {} }))
    const run = await setup(userData)
    const loading = run.cache.loadScryfallCache()
    run.cache.scryfallCacheChanged()
    run.cache.flushScryfallCache()
    await loading
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toHaveProperty(['sol ring'])
  })

  it('saves shortly after changes, and at least every minute during a long refresh', async () => {
    const { file, cache } = await setup()
    vi.useFakeTimers()
    cache.scryfallCache.entries.a = result([])
    cache.scryfallCacheChanged()
    vi.advanceTimersByTime(1_000)
    expect(existsSync(file)).toBe(false)
    for (let second = 1; second < 60; second++) {
      cache.scryfallCacheChanged()
      vi.advanceTimersByTime(1_000)
    }
    expect(existsSync(file)).toBe(false)
    cache.scryfallCacheChanged()
    vi.advanceTimersByTime(1)
    vi.useRealTimers()
    await cache.scryfallCacheSaved()
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toHaveProperty('a')
  })
})
