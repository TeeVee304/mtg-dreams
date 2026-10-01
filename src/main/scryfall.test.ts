import { createServer, type Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// A local stand-in for Scryfall, serving a few cards and counting requests.

const card = (name: string, set: string, collector: string, extra: Record<string, unknown> = {}) => ({
  id: `${set}-${collector}`,
  cardmarket_id: Number(collector),
  oracle_id: `oracle-${name.toLowerCase().replace(/\W+/g, '-')}`,
  name,
  set,
  set_name: set.toUpperCase(),
  collector_number: collector,
  rarity: 'rare',
  released_at: '2020-01-01',
  lang: 'en',
  finishes: ['nonfoil'],
  prices: { eur: '1.50', eur_foil: null },
  image_uris: { small: 'small.jpg', normal: 'normal.jpg' },
  purchase_uris: { cardmarket: 'https://www.cardmarket.com/x' },
  scryfall_uri: 'https://scryfall.com/x',
  type_line: 'Artifact',
  color_identity: [],
  cmc: 1,
  legalities: { commander: 'legal' },
  oracle_text: '',
  digital: false,
  ...extra
})

const CARDS = [
  card('Sol Ring', 'cmm', '1'),
  card('Sol Ring', 'c21', '2', { prices: { eur: '0.80', eur_foil: null } }),
  card('Sol Ring', 'prm', '3', { digital: true }),
  card('Grist, the Hunger Tide', 'mh2', '4', {
    type_line: 'Legendary Planeswalker — Grist',
    oracle_text: "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types."
  })
]

let server: Server
let base = ''
let failing = false
const hits: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x')
    hits.push(url.pathname)
    const json = (status: number, body: unknown) =>
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    if (failing) return json(500, { object: 'error' })
    if (url.pathname === '/cards/search') {
      const q = url.searchParams.get('q') ?? ''
      const exact = /^!"(.+)" game:paper$/.exec(q)?.[1]
      const oracle = /^oracleid:(\S+) game:paper$/.exec(q)?.[1]
      const found = CARDS.filter((c) => c.name === exact || c.oracle_id === oracle)
      return found.length ? json(200, { data: found, has_more: false, total_cards: found.length }) : json(404, { object: 'error' })
    }
    if (url.pathname === '/cards/named') {
      const fuzzy = (url.searchParams.get('fuzzy') ?? '').toLowerCase()
      const found = CARDS.find((c) => c.name.toLowerCase().startsWith(fuzzy.slice(0, 5)))
      return found ? json(200, found) : json(404, { object: 'error' })
    }
    if (url.pathname === '/cards/collection') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const names: string[] = JSON.parse(body).identifiers.map((i: { name: string }) => i.name)
        json(200, { data: CARDS.filter((c) => names.includes(c.name) && c.set !== 'prm') })
      })
      return
    }
    json(404, { object: 'error' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => server.close())

const roots: string[] = []
afterEach(async () => {
  failing = false
  hits.length = 0
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** A fresh copy of the Scryfall client with its own (empty) cache folder. */
async function setup(userData?: string) {
  vi.resetModules()
  const dir = userData ?? (await mkdtemp(join(tmpdir(), 'mtg-dreams-scryfall-')))
  roots.push(dir)
  mkdirSync(dir, { recursive: true })
  const { setEnvironment } = await import('./environment')
  setEnvironment({
    userData: dir,
    documents: dir,
    appData: dir,
    trash: async () => undefined,
    userAgent: 'MTGDreams/test',
    scryfallApi: base,
    mtgjsonApi: base,
    priceGuideUrl: base
  })
  return { dir, scryfall: await import('./scryfall') }
}

describe('RateLimitedQueue', () => {
  it('spaces requests out and lets interactive ones jump ahead', async () => {
    const { scryfall } = await setup()
    const queue = new scryfall.RateLimitedQueue(40)
    const order: string[] = []
    const started: number[] = []
    const job = (name: string) => async () => {
      order.push(name)
      started.push(Date.now())
    }
    const background = ['a', 'b', 'c'].map((name) => queue.run(job(name), 'low'))
    const urgent = queue.run(job('urgent'), 'high')
    queue.promote(background[2].job)
    await Promise.all([...background.map((b) => b.promise), urgent.promise])
    // "a" was already running; then the interactive job, then the promoted one.
    expect(order).toEqual(['a', 'urgent', 'c', 'b'])
    for (let i = 1; i < started.length; i++) expect(started[i] - started[i - 1]).toBeGreaterThanOrEqual(35)
  })
})

describe('getPrintings', () => {
  it('fetches paper printings once, then answers from the cache', async () => {
    const { scryfall } = await setup()
    const [first, again] = await Promise.all([scryfall.getPrintings('Sol Ring'), scryfall.getPrintings('sol ring')])
    expect(first).toBe(again) // one request for both
    expect(first.printings.map((p) => p.set)).toEqual(['cmm', 'c21']) // the digital printing is left out
    // Scryfall's EUR price is kept as the trend, the fallback for Cardmarket's price guide.
    expect(first.printings[1]).toMatchObject({ cardmarketId: 2, price: { trend: 0.8 }, priceFoil: {} })
    expect(first.card?.typeLine).toBe('Artifact')
    expect(await scryfall.getPrintings('Sol Ring')).toBe(first)
    expect(hits).toEqual(['/cards/search'])
  })

  it('recognises cards that can lead a Commander deck from their rules text', async () => {
    const { scryfall } = await setup()
    expect((await scryfall.getPrintings('Grist, the Hunger Tide')).card?.canBeCommander).toBe(true)
  })

  it('falls back to a fuzzy match for typos, and says when a card does not exist', async () => {
    const { scryfall } = await setup()
    const typo = await scryfall.getPrintings('Sol Rnig')
    expect(typo.name).toBe('Sol Ring')
    expect(typo.printings).toHaveLength(2)
    expect(await scryfall.getPrintings('Zzyzx the Unreal')).toMatchObject({ notFound: true, printings: [] })
  })

  it('keeps showing cached prices when a refresh fails', async () => {
    const { scryfall } = await setup()
    const cached = await scryfall.getPrintings('Sol Ring')
    failing = true
    const refreshed = await scryfall.getPrintings('Sol Ring', { force: true })
    expect(refreshed.printings).toEqual(cached.printings)
    expect(refreshed.staleError).toBe('Scryfall responded with HTTP 500.')
    await expect((await setup()).scryfall.getPrintings('Sol Ring')).rejects.toThrow('HTTP 500')
  })
})

describe('getCardInfos', () => {
  it('batches unknown cards into one collection request and reuses cached ones', async () => {
    const { scryfall } = await setup()
    await scryfall.getPrintings('Sol Ring')
    const infos = await scryfall.getCardInfos(['Sol Ring', 'Grist, the Hunger Tide'])
    expect(Object.keys(infos)).toEqual(['sol ring', 'grist, the hunger tide'])
    expect(infos['grist, the hunger tide']?.typeLine).toBe('Legendary Planeswalker — Grist')
    expect(hits).toEqual(['/cards/search', '/cards/collection'])
  })
})

describe('getCardImages', () => {
  it('pictures cached cards from their printings and the rest with one batch request, kept for later', async () => {
    const { scryfall } = await setup()
    await scryfall.getPrintings('Sol Ring')
    const images = await scryfall.getCardImages(['Sol Ring', 'Grist, the Hunger Tide', 'No Such Card'])
    expect(images).toEqual({ 'sol ring': 'small.jpg', 'grist, the hunger tide': 'small.jpg', 'no such card': null })
    await scryfall.getCardImages(['Grist, the Hunger Tide', 'No Such Card'])
    expect(hits).toEqual(['/cards/search', '/cards/collection'])
  })
})

describe('startup', () => {
  it('answers lookups made while the cache is loading from the cache, not the network', async () => {
    const first = await setup()
    await first.scryfall.getPrintings('Sol Ring')
    const { flushScryfallCache } = await import('./scryfallCache')
    flushScryfallCache()

    const restarted = await setup(first.dir)
    const { loadScryfallCache } = await import('./scryfallCache')
    hits.length = 0
    const lookup = restarted.scryfall.getPrintings('Sol Ring') // asked before the cache is read
    void loadScryfallCache()
    expect((await lookup).printings).toHaveLength(2)
    expect(hits).toEqual([])
  })
})
