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
  imageBack: null,
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

  it('store a two-sided card\'s back image as a flag when it is at the usual address', async () => {
    const { cache } = await setup()
    const id = '6904ea20-e504-47da-95a0-08739fdde260'
    const delver = printing(id, { imageBack: `https://cards.scryfall.io/normal/back/6/9/${id}.jpg` })
    const stored = cache.packPrinting(delver)
    expect(stored).toMatchObject({ back: true })
    expect(stored).not.toHaveProperty('imageBack')
    expect(cache.unpackPrinting(stored)).toEqual(delver)
    const odd = printing('abc', { imageBack: 'https://example.com/back.jpg' })
    expect(cache.unpackPrinting(cache.packPrinting(odd))).toEqual(odd)
  })

  it('keep only Scryfall\'s trend: Cardmarket\'s other prices are never cached', async () => {
    const { cache } = await setup()
    const priced = printing('abc', { price: { trend: 1.5, low: 0.9, avg30: 1.7 }, priceFoil: { trend: 3, low: 2 } })
    expect(cache.unpackPrinting(cache.packPrinting(priced))).toEqual(printing('abc'))
  })
})

describe('the cache file', () => {
  it('forgets reversible cards read with mana value 0 before version 18', async () => {
    const { userData, file } = await setup()
    const krark = { name: 'Krark, the Thumbless // Krark, the Thumbless', colors: ['R'], colorIdentity: ['R'], typeLine: 'Legendary Creature — Goblin Wizard // Legendary Creature — Goblin Wizard', manaValue: 0, rarity: 'rare', legalities: {} }
    const sol = { name: 'Sol Ring', colors: [], colorIdentity: [], typeLine: 'Artifact', manaValue: 1, rarity: 'uncommon', legalities: {} }
    const packed = (card: { name: string }) => ({ ...result([]), name: card.name, card })
    writeFileSync(
      file,
      JSON.stringify({
        version: 17,
        entries: { 'krark, the thumbless': packed(krark), 'sol ring': packed(sol) },
        cards: { 'krark, the thumbless': { fetchedAt: Date.now(), card: krark }, 'sol ring': { fetchedAt: Date.now(), card: sol } }
      })
    )
    const v17 = await setup(userData)
    await v17.cache.loadScryfallCache()
    const { entries, cards } = v17.cache.scryfallCache
    expect(Object.keys(entries)).toEqual(['sol ring'])
    // Before version 19 no card has rules text: all are looked up again.
    expect(Object.keys(cards)).toEqual([])
  })

  it('refreshes card data from before version 19, which had no rules text', async () => {
    const { userData, file } = await setup()
    const sol = { name: 'Sol Ring', colors: [], colorIdentity: [], typeLine: 'Artifact', manaValue: 1, rarity: 'uncommon', legalities: {} }
    writeFileSync(
      file,
      JSON.stringify({
        version: 18,
        entries: { 'sol ring': { ...result([]), name: sol.name, card: sol } },
        cards: { 'sol ring': { fetchedAt: Date.now(), card: sol } }
      })
    )
    const v18 = await setup(userData)
    await v18.cache.loadScryfallCache()
    const { entries, cards } = v18.cache.scryfallCache
    expect(Object.keys(cards)).toEqual([])
    expect(Date.now() - entries['sol ring'].fetchedAt).toBeGreaterThan(PRINTINGS_MAX_AGE_MS)
  })

  it('survives a restart', async () => {
    const first = await setup()
    first.cache.scryfallCache.entries['sol ring'] = result([printing('aaa'), printing('bbb')])
    first.cache.scryfallCacheChanged()
    first.cache.flushScryfallCache()
    expect(JSON.parse(readFileSync(first.file, 'utf8')).version).toBe(19)

    const restarted = await setup(first.userData)
    await restarted.cache.loadScryfallCache()
    expect(restarted.cache.scryfallCache.entries['sol ring']).toEqual(first.cache.scryfallCache.entries['sol ring'])
  })

  it('reads older files and marks them for a refresh (no back images before version 8)', async () => {
    const { userData, file } = await setup()
    const entry = result([printing('aaa')])
    writeFileSync(file, JSON.stringify({ version: 5, entries: { 'sol ring': { ...entry, printings: [oldFormat('aaa')] } }, cards: {} }))
    const v5 = await setup(userData)
    await v5.cache.loadScryfallCache()
    expect(v5.cache.scryfallCache.entries['sol ring'].printings).toEqual(entry.printings)
    expect(Date.now() - v5.cache.scryfallCache.entries['sol ring'].fetchedAt).toBeGreaterThan(PRINTINGS_MAX_AGE_MS)
    v5.cache.flushScryfallCache()
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(19)

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

  it('refreshes everything cached before artwork ids and Universes Beyond flags (version 11), and legendary card data before partner abilities (version 9)', async () => {
    const { userData, file } = await setup()
    const card = (name: string, typeLine: string) => ({ name, colors: [], colorIdentity: [], typeLine, manaValue: 1, rarity: 'rare', legalities: {} })
    const tymna = { ...result([]), name: 'Tymna', card: card('Tymna the Weaver', 'Legendary Creature — Human Cleric'), printings: [] }
    const ring = { ...result([]), card: card('Sol Ring', 'Artifact'), printings: [] }
    const cards = { kraum: { fetchedAt: Date.now(), card: card("Kraum, Ludevic's Opus", 'Legendary Creature — Zombie Horror') } }
    writeFileSync(file, JSON.stringify({ version: 8, entries: { tymna, 'sol ring': ring }, cards }))
    const v8 = await setup(userData)
    await v8.cache.loadScryfallCache()
    expect(Date.now() - v8.cache.scryfallCache.entries.tymna.fetchedAt).toBeGreaterThan(PRINTINGS_MAX_AGE_MS)
    expect(Date.now() - v8.cache.scryfallCache.entries['sol ring'].fetchedAt).toBeGreaterThan(PRINTINGS_MAX_AGE_MS)
    expect(v8.cache.scryfallCache.cards.kraum).toBeUndefined()
  })

  it('drops Cards found by another name before version 12, and keeps the card resolver\'s answers', async () => {
    const { userData, file } = await setup()
    const resolved = { 'name:relampago': { fetchedAt: Date.now(), card: { name: 'Lightning Bolt', lang: 'es' } } }
    // "Relampago" was taken for Lightning Greaves before version 12.
    const greaves = { ...result([]), name: 'Lightning Greaves' }
    writeFileSync(file, JSON.stringify({ version: 11, entries: { relampago: greaves, 'sol ring': result([]) }, cards: {}, resolved }))
    const v11 = await setup(userData)
    await v11.cache.loadScryfallCache()
    expect(Object.keys(v11.cache.scryfallCache.entries)).toEqual(['sol ring'])
    expect(v11.cache.scryfallCache.aliases).toEqual({})
    expect(v11.cache.scryfallCache.resolved).toEqual(resolved)
  })

  it('stores a Card found by another name once, the other name an alias of it (version 13)', async () => {
    const { userData, file } = await setup()
    const bolt = { ...result([printing('aaa')]), name: 'Lightning Bolt' }
    // Before version 13, a Card found by another name was stored again under that name.
    const entries = { 'lightning bolt': bolt, 'relámpago': { ...bolt, lang: 'es' }, 'lightning bolt (a25) 141': bolt, rayo: { ...bolt, name: 'Thunderbolt' } }
    writeFileSync(file, JSON.stringify({ version: 12, entries, cards: {} }))
    const v12 = await setup(userData)
    await v12.cache.loadScryfallCache()
    const cache = v12.cache.scryfallCache
    expect(Object.keys(cache.entries).sort()).toEqual(['lightning bolt', 'thunderbolt'])
    expect(cache.aliases).toEqual({
      'relámpago': { key: 'lightning bolt', lang: 'es' },
      'lightning bolt (a25) 141': { key: 'lightning bolt' },
      rayo: { key: 'thunderbolt' }
    })
    expect(v12.cache.cachedEntry('relámpago')).toMatchObject({ name: 'Lightning Bolt', lang: 'es' })
    expect(v12.cache.cachedEntry('lightning bolt')?.lang).toBeUndefined()

    // A lookup by another name later stores the Card under its own name too.
    v12.cache.storeEntry('blitz', { ...bolt, lang: 'de' })
    expect(cache.aliases.blitz).toEqual({ key: 'lightning bolt', lang: 'de' })
    expect(cache.entries.blitz).toBeUndefined()
  })

  it('keeps the Cards the data folder uses, and only recent others', async () => {
    const { cache } = await setup()
    await cache.loadScryfallCache()
    const now = Date.now()
    const entry = (name: string, usedDaysAgo: number) => {
      cache.scryfallCache.entries[name] = { ...result([]), name }
      cache.scryfallCache.usedAt[name] = now - usedDaysAgo * 86_400_000
    }
    entry('sol ring', 20)
    entry('lightning bolt', 20)
    entry('counterspell', 1)
    cache.scryfallCache.aliases['relámpago'] = { key: 'lightning bolt', lang: 'es' }
    cache.pinCards(['sol ring'])
    expect(Object.keys(cache.scryfallCache.entries).sort()).toEqual(['counterspell', 'sol ring'])
    expect(cache.scryfallCache.aliases).toEqual({})

    // An alias in a file keeps its Card.
    entry('lightning bolt', 20)
    cache.scryfallCache.aliases['relámpago'] = { key: 'lightning bolt', lang: 'es' }
    cache.pinCards(['relámpago'])
    expect(Object.keys(cache.scryfallCache.entries).sort()).toEqual(['counterspell', 'lightning bolt'])

    // Past the most kept, the least recently used go first.
    for (let i = 0; i <= cache.MAX_RECENT; i++) entry(`card ${i}`, i / 10_000)
    cache.pinCards([])
    expect(Object.keys(cache.scryfallCache.entries)).toHaveLength(cache.MAX_RECENT)
    expect(cache.scryfallCache.entries['card 0']).toBeDefined()
    expect(cache.scryfallCache.entries.counterspell).toBeUndefined()
  })

  it('drops month-old entries, and ignores files it does not understand', async () => {
    const { userData, file } = await setup()
    writeFileSync(file, JSON.stringify({ version: 6, entries: { old: result([], Date.now() - 40 * 86_400_000) }, cards: {} }))
    const loaded = await setup(userData)
    await loaded.cache.loadScryfallCache()
    expect(loaded.cache.scryfallCache.entries).toEqual({})

    const good = { ...result([]), name: 'Good', printings: [] }
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
