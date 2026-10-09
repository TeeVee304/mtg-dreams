import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Tests against a local server standing in for Scryfall's bulk data.
 *
 * @packageDocumentation
 */

const legal = (...formats: string[]) => ({
  standard: 'not_legal',
  alchemy: 'not_legal',
  ...Object.fromEntries(formats.map((format) => [format, 'legal']))
})

/** Scryfall Oracle cards: two playable cards, a split card, a reversible card, a token and a digital-only card. */
const ORACLE = [
  {
    oracle_id: 'o-flubs', name: 'Flubs, the Fool', layout: 'normal', mana_cost: '{G}{U}{R}', cmc: 3,
    type_line: 'Legendary Creature — Frog Scout', colors: ['G', 'R', 'U'], color_identity: ['G', 'R', 'U'], keywords: [], rarity: 'mythic',
    oracle_text: 'You may play an additional land on each of your turns.\nWhenever you play a land or cast a spell, draw a card if you have no cards in hand. Otherwise, discard a card.',
    legalities: legal('commander', 'duel')
  },
  {
    oracle_id: 'o-valakut', name: 'Valakut, the Molten Pinnacle', layout: 'normal', mana_cost: '', cmc: 0, type_line: 'Land',
    colors: [], color_identity: ['R'], keywords: [], rarity: 'rare', legalities: { ...legal('commander', 'modern'), pauper: 'not_legal' },
    oracle_text: 'This land enters tapped.\nWhenever a Mountain you control enters, if you control at least five other Mountains, you may have this land deal 3 damage to any target.\n{T}: Add {R}.'
  },
  {
    oracle_id: 'o-fire', name: 'Fire // Ice', layout: 'split', cmc: 4, type_line: 'Instant // Instant', colors: ['R', 'U'], color_identity: ['R', 'U'],
    keywords: [], rarity: 'uncommon', legalities: legal('commander', 'legacy'),
    card_faces: [
      { name: 'Fire', mana_cost: '{1}{R}', type_line: 'Instant', oracle_text: 'Fire deals 2 damage divided as you choose among one or two targets.' },
      { name: 'Ice', mana_cost: '{1}{U}', type_line: 'Instant', oracle_text: 'Tap target permanent.\nDraw a card.' }
    ]
  },
  {
    name: 'Wanderer // Wanderer', layout: 'reversible_card', color_identity: [], keywords: [], rarity: 'rare', legalities: legal('commander'),
    card_faces: [{ oracle_id: 'o-wanderer', name: 'Wanderer', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.', cmc: 1 }]
  },
  { oracle_id: 'o-token', name: 'Elemental', layout: 'token', type_line: 'Token Creature — Elemental', color_identity: ['R'], keywords: [], legalities: legal() },
  { oracle_id: 'o-alchemy', name: 'A-Flubs, the Fool', layout: 'normal', type_line: 'Legendary Creature', color_identity: ['G'], keywords: [], legalities: { ...legal(), alchemy: 'legal' } }
]

/** Scryfall default printings: one of each kind the library keeps or leaves out. */
const PRINTS = [
  { oracle_id: 'o-flubs', cardmarket_id: 101, finishes: ['nonfoil', 'foil'], games: ['paper', 'mtgo'], border_color: 'black' },
  { oracle_id: 'o-flubs', cardmarket_id: 102, finishes: ['foil'], games: ['paper'], border_color: 'borderless' },
  { oracle_id: 'o-flubs', cardmarket_id: 103, finishes: ['nonfoil'], games: ['paper'], border_color: 'gold' },
  { oracle_id: 'o-flubs', finishes: ['nonfoil'], games: ['arena'] },
  { oracle_id: 'o-valakut', cardmarket_id: 201, finishes: ['nonfoil'], games: ['paper'], set_type: 'expansion' },
  { oracle_id: 'o-valakut', cardmarket_id: 202, finishes: ['nonfoil'], games: ['paper'], set_type: 'memorabilia' },
  { oracle_id: 'o-fire', cardmarket_id: 301, finishes: ['nonfoil'], games: ['paper'] },
  { card_faces: [{ oracle_id: 'o-wanderer' }], cardmarket_id: 401, finishes: ['nonfoil'], games: ['paper'] },
  { oracle_id: 'o-token', cardmarket_id: 501, finishes: ['nonfoil'], games: ['paper'] }
]

const jsonl = (rows: unknown[]) => gzipSync(rows.map((row) => JSON.stringify(row)).join('\n'))

/** What the stand-in serves. */
const scryfall = { updatedAt: '2026-10-07T09:01:59.000+00:00', failPrints: false }
const requests: string[] = []
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.url ?? '')
    if (req.url === '/bulk-data') {
      const file = (type: string, path: string, size: number) => ({
        type, updated_at: scryfall.updatedAt, jsonl_download_uri: `${base}${path}`, compressed_size: size
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [file('oracle_cards', '/oracle.jsonl.gz', 1000), file('default_cards', '/default.jsonl.gz', 3000)] }))
    } else if (req.url === '/oracle.jsonl.gz') {
      res.writeHead(200, { 'Content-Type': 'application/gzip' }).end(jsonl(ORACLE))
    } else if (req.url === '/default.jsonl.gz' && !scryfall.failPrints) {
      res.writeHead(200, { 'Content-Type': 'application/gzip' }).end(jsonl(PRINTS))
    } else {
      res.writeHead(500).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => server.close())

const dirs: string[] = []
afterEach(async () => {
  requests.length = 0
  Object.assign(scryfall, { updatedAt: '2026-10-07T09:01:59.000+00:00', failPrints: false })
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A fresh copy of the modules, with their own folder. */
async function setup(userData?: string) {
  vi.resetModules()
  const dir = userData ?? (await mkdtemp(join(tmpdir(), 'mtg-dreams-library-')))
  dirs.push(dir)
  const { setEnvironment, SERVICES } = await import('../environment')
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test', scryfallApi: base })
  return { dir, library: await import('./cardLibrary'), guide: await import('../priceGuide') }
}

const downloads = () => requests.filter((url) => url.endsWith('.gz'))

describe('the card library', () => {
  it('builds from Scryfall bulk data: playable cards with rules text, keywords and Cardmarket products', async () => {
    const { library } = await setup()
    expect(await library.refreshCardLibrary()).toBe(true)
    expect(library.libraryCard('flubs, the fool')).toMatchObject({
      name: 'Flubs, the Fool',
      manaCost: '{G}{U}{R}',
      colorIdentity: ['G', 'R', 'U'],
      text: expect.stringContaining('Otherwise, discard a card.'),
      legalities: { commander: 'legal', duel: 'legal' },
      // Gold-bordered and digital-only printings are left out; foil-only ones are negative.
      products: [101, -102]
    })
    expect(library.libraryCard('Valakut, the Molten Pinnacle')).toMatchObject({ products: [201], legalities: { commander: 'legal', modern: 'legal' } })
    expect(library.libraryCard('Fire')).toMatchObject({
      name: 'Fire // Ice',
      manaCost: '{1}{R} // {1}{U}',
      text: 'Fire deals 2 damage divided as you choose among one or two targets.\nTap target permanent.\nDraw a card.'
    })
    expect(library.libraryCard('Wanderer')?.products).toEqual([401])
    expect(library.libraryCard('Elemental')).toBeUndefined()
    expect(library.libraryCard('A-Flubs, the Fool')).toBeUndefined()
    expect(library.cardLibraryStatus()).toEqual({ state: 'ready', cards: 4, updatedAt: scryfall.updatedAt })
  })

  it('saves the library and loads it without downloading again', async () => {
    const { dir, library: first } = await setup()
    await first.refreshCardLibrary()
    requests.length = 0
    const { library } = await setup(dir)
    await library.ensureCardLibrary()
    expect(library.libraryCard('Flubs, the Fool')?.products).toEqual([101, -102])
    expect(requests).toEqual([])
  })

  it('downloads again only when Scryfall has newer card data', async () => {
    const { library } = await setup()
    await library.refreshCardLibrary()
    requests.length = 0
    expect(await library.refreshCardLibrary()).toBe(false)
    expect(downloads()).toEqual([])
    scryfall.updatedAt = '2026-10-14T09:00:00.000+00:00'
    expect(await library.refreshCardLibrary()).toBe(true)
    expect(downloads()).toEqual(['/oracle.jsonl.gz', '/default.jsonl.gz'])
  })

  it('keeps the current library when a download fails', async () => {
    const { library } = await setup()
    await library.refreshCardLibrary()
    scryfall.updatedAt = '2026-10-14T09:00:00.000+00:00'
    scryfall.failPrints = true
    await expect(library.refreshCardLibrary()).rejects.toThrow('Scryfall responded with HTTP 500.')
    expect(library.cardLibraryStatus()).toMatchObject({ state: 'ready', updatedAt: '2026-10-07T09:01:59.000+00:00' })
  })

  it('downloads a missing library on first use, and reports a failed first download', async () => {
    const { library } = await setup()
    expect(library.cardLibraryStatus()).toEqual({ state: 'missing' })
    await library.ensureCardLibrary()
    expect(library.libraryCard('Valakut, the Molten Pinnacle')).toBeDefined()

    const { library: offline } = await setup()
    scryfall.failPrints = true
    await expect(offline.ensureCardLibrary()).rejects.toThrow('Scryfall responded with HTTP 500.')
    expect(offline.cardLibraryStatus()).toEqual({ state: 'missing' })
  })

  it('prices a card at its cheapest printing, foil-only printings at their foil price', async () => {
    const { dir, library, guide } = await setup()
    await writeFile(
      join(dir, 'price-guide.json'),
      JSON.stringify({
        version: 1, createdAt: 0, fetchedAt: 0, lastModified: null,
        rows: { 101: [0.5, 1, 0.9, 2, 3, 2.5], 102: [0, 0, 0, 0.3, 0.4, 0.35], 201: [5, 6, 7, 0, 0, 0] }
      })
    )
    await guide.loadPriceGuide()
    await library.refreshCardLibrary()
    const flubs = library.libraryCard('Flubs, the Fool')!
    expect(library.cheapestPrice(flubs, 'trend')).toBe(0.4)
    expect(library.cheapestPrice(flubs, 'low')).toBe(0.3)
    expect(library.cheapestPrice(library.libraryCard('Valakut, the Molten Pinnacle')!, 'avg30')).toBe(7)
    expect(library.cheapestPrice(library.libraryCard('Fire // Ice')!, 'trend')).toBeNull()
  })

  it('reads what every card does', async () => {
    const { library } = await setup()
    expect(await library.libraryProfiles()).toEqual([])
    await library.refreshCardLibrary()
    const profiles = await library.libraryProfiles()
    expect(profiles).toHaveLength(4)
    const flubs = profiles.find((p) => p.card.name === 'Flubs, the Fool')!
    expect(flubs.profile.provides.map((s) => s.id)).toContain('extra-land-drop')
    expect(await library.libraryProfiles()).toBe(profiles)
  })

  it('also reads bulk data in its JSON-array form', async () => {
    const { library } = await setup()
    async function* lines(rows: unknown[]) {
      yield '['
      for (const row of rows) yield `${JSON.stringify(row)},`
      yield ']'
    }
    const cards = await library.buildCardLibrary(lines(ORACLE), lines(PRINTS))
    expect(cards.map((card) => card.name)).toEqual(['Fire // Ice', 'Flubs, the Fool', 'Valakut, the Molten Pinnacle', 'Wanderer // Wanderer'])
  })
})
