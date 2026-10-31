import { createServer, type Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Tests against a local Scryfall stand-in that serves fixture cards and counts requests.
 *
 * @packageDocumentation
 */

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
  }),
  card('Lightning Bolt', 'a25', '141', { type_line: 'Instant' }),
  card('Thunderbolt', 'wth', '115', { type_line: 'Instant' }),
  card('Potential Horizon', 'yfra', '1', { digital: true, games: ['arena'], legalities: { historic: 'legal' } })
]

/** Printings in other languages, found only by searches that ask for them. */
const FOREIGN = [
  card('Lightning Bolt', 'clb', '187', { lang: 'es', printed_name: 'Relámpago' }),
  card('Lightning Bolt', 'sta', '42', { lang: 'ja', printed_name: '稲妻' }),
  card('Thunderbolt', 'wth', '115', { lang: 'pt', printed_name: 'Relâmpago' })
]

/** Scryfall's name matching: case and accents aside. */
const bare = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

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
    if (url.pathname === '/cards/search' && url.searchParams.get('include_multilingual') === 'true') {
      const names = [...(url.searchParams.get('q') ?? '').matchAll(/!"([^"]+)"/g)].map((match) => bare(match[1]))
      const found = FOREIGN.filter((c) => names.includes(bare(String((c as Record<string, unknown>).printed_name))))
      return found.length ? json(200, { data: found, has_more: false, total_cards: found.length }) : json(404, { object: 'error' })
    }
    if (url.pathname === '/cards/search') {
      const q = url.searchParams.get('q') ?? ''
      const game = / game:(\w+)$/.exec(q)?.[1]
      const exact = /^!"(.+)" game:\w+$/.exec(q)?.[1]
      const oracle = /^oracleid:(\S+) game:\w+$/.exec(q)?.[1]
      const games = (c: (typeof CARDS)[number]) => ((c as Record<string, unknown>).games as string[] | undefined) ?? ['paper', 'arena']
      const found = CARDS.filter((c) => (c.name === exact || c.oracle_id === oracle) && games(c).includes(game ?? 'paper'))
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
        const ids: Array<{ name?: string; set?: string; collector_number?: string }> = JSON.parse(body).identifiers
        const wanted = (c: (typeof CARDS)[number]) =>
          ids.some((id) => (id.name ? id.name === c.name : id.set === c.set && id.collector_number === c.collector_number))
        json(200, { data: CARDS.filter((c) => wanted(c) && c.set !== 'prm') })
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
    priceGuideUrl: base,
    edhrecJson: base,
    cardImagesUrl: base
  })
  return { dir, scryfall: await import('./scryfall'), resolver: await import('./cardResolver') }
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
    expect(order).toEqual(['a', 'urgent', 'c', 'b'])
    for (let i = 1; i < started.length; i++) expect(started[i] - started[i - 1]).toBeGreaterThanOrEqual(35)
  })
})

describe('getPrintings', () => {
  it('fetches paper printings once, then answers from the cache', async () => {
    const { scryfall } = await setup()
    const [first, again] = await Promise.all([scryfall.getPrintings('Sol Ring'), scryfall.getPrintings('sol ring')])
    expect(first).toBe(again)
    expect(first.printings.map((p) => p.set)).toEqual(['cmm', 'c21'])
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

  it('keeps the MTG Arena printings of a card never printed on paper, marked digital', async () => {
    const { scryfall } = await setup()
    const arena = await scryfall.getPrintings('Potential Horizon')
    expect(arena.card?.legalities).toEqual({ historic: 'legal' })
    expect(arena.printings).toMatchObject([{ set: 'yfra', digital: true }])
    // A card printed on paper keeps only its paper printings.
    expect((await scryfall.getPrintings('Sol Ring')).printings.some((p) => p.digital)).toBe(false)
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

describe('names in other languages', () => {
  it('finds a card by a name printed in another language, and not a near English one', async () => {
    const { scryfall } = await setup()
    const bolt = await scryfall.getPrintings('Relámpago')
    expect(bolt).toMatchObject({ name: 'Lightning Bolt', lang: 'es' })
    expect(bolt.printings.map((p) => p.set)).toEqual(['a25'])
    expect(hits).not.toContain('/cards/named')
    expect(await scryfall.getPrintings('稲妻')).toMatchObject({ name: 'Lightning Bolt', lang: 'ja' })
  })

  it('stores a Card found by another name once: its English name needs no lookup after', async () => {
    const { scryfall } = await setup()
    await scryfall.getPrintings('Relámpago')
    hits.length = 0
    const bolt = await scryfall.getPrintings('Lightning Bolt')
    expect(bolt.name).toBe('Lightning Bolt')
    expect(bolt.lang).toBeUndefined()
    expect(hits).toEqual([])
  })
})

describe('card resolver', () => {
  it('resolves names in any language and printings, asking Scryfall in batches, then from the cache', async () => {
    const { resolver } = await setup()
    const queries = [
      { name: 'Sol Ring' },
      { name: 'Relámpago' },
      { name: '稲妻' },
      { set: 'A25', collector: '141' },
      { name: 'Zzyzx the Unreal' },
      { name: 'sol ring' }
    ]
    expect(await resolver.resolveCards(queries)).toEqual([
      { name: 'Sol Ring' },
      { name: 'Lightning Bolt', lang: 'es' },
      { name: 'Lightning Bolt', lang: 'ja' },
      { name: 'Lightning Bolt', set: 'a25', collector: '141' },
      null,
      { name: 'Sol Ring' }
    ])
    // One request for English names and printings, one search for the rest, one fuzzy try for the unknown name.
    expect(hits).toEqual(['/cards/collection', '/cards/search', '/cards/named'])
    hits.length = 0
    expect(await resolver.resolveCards(queries)).toHaveLength(6)
    expect(hits).toEqual([])
  })

  it('answers from cards already looked up, without asking Scryfall', async () => {
    const { scryfall, resolver } = await setup()
    await scryfall.getPrintings('Sol Ring')
    hits.length = 0
    expect(await resolver.resolveCards([{ name: 'SOL RING' }, { set: 'cmm', collector: '1' }])).toEqual([
      { name: 'Sol Ring' },
      { name: 'Sol Ring', set: 'cmm', collector: '1' }
    ])
    expect(hits).toEqual([])
  })

  it('marks a name without its accents that two cards print as a near match', async () => {
    const { resolver } = await setup()
    const [relampago] = await resolver.resolveCards([{ name: 'Relampago' }])
    expect(relampago).toMatchObject({ name: 'Lightning Bolt', fuzzy: true })
  })

  it('answers nothing while offline, and asks again later', async () => {
    const { resolver } = await setup()
    failing = true
    expect(await resolver.resolveCards([{ name: 'Sol Ring' }])).toEqual([null])
    failing = false
    expect(await resolver.resolveCards([{ name: 'Sol Ring' }])).toEqual([{ name: 'Sol Ring' }])
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

  it("reads a reversible card's name, type and mana value from its front face", async () => {
    const { scryfall } = await setup()
    const face = { name: 'Krark, the Thumbless', mana_cost: '{1}{R}', cmc: 2, type_line: 'Legendary Creature — Goblin Wizard', colors: ['R'], oracle_text: '' }
    const info = scryfall.toCardInfo({
      name: 'Krark, the Thumbless // Krark, the Thumbless',
      layout: 'reversible_card',
      color_identity: ['R'],
      card_faces: [face, face]
    })
    expect(info).toMatchObject({ name: 'Krark, the Thumbless', typeLine: 'Legendary Creature — Goblin Wizard', manaValue: 2, manaCost: '{1}{R}' })
    expect(info.faces).toEqual([{ name: 'Krark, the Thumbless', manaCost: '{1}{R}', typeLine: 'Legendary Creature — Goblin Wizard', text: '' }])
  })

  it("keeps each face's cost, type line, rules text and stats for the card's dialog", async () => {
    const { scryfall } = await setup()
    const bears = scryfall.toCardInfo({ name: 'Grizzly Bears', mana_cost: '{1}{G}', cmc: 2, type_line: 'Creature — Bear', power: '2', toughness: '2' })
    expect(bears.faces).toEqual([{ name: 'Grizzly Bears', manaCost: '{1}{G}', typeLine: 'Creature — Bear', text: '', pt: '2/2' }])
    const delver = scryfall.toCardInfo({
      name: 'Delver of Secrets // Insectile Aberration',
      layout: 'transform',
      card_faces: [
        { name: 'Delver of Secrets', mana_cost: '{U}', type_line: 'Creature — Human Wizard', oracle_text: 'At the beginning of your upkeep, look at the top card of your library.', power: '1', toughness: '1' },
        { name: 'Insectile Aberration', mana_cost: '', type_line: 'Creature — Human Insect', oracle_text: 'Flying', power: '3', toughness: '2' }
      ]
    })
    expect(delver.faces?.map((face) => [face.name, face.manaCost, face.pt])).toEqual([
      ['Delver of Secrets', '{U}', '1/1'],
      ['Insectile Aberration', undefined, '3/2']
    ])
    const nissa = scryfall.toCardInfo({ name: 'Nissa', mana_cost: '{3}{G}', type_line: 'Legendary Planeswalker — Nissa', oracle_text: '+1: Untap a land.', loyalty: '4' })
    expect(nissa.faces?.[0].loyalty).toBe('4')
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
    const lookup = restarted.scryfall.getPrintings('Sol Ring')
    void loadScryfallCache()
    expect((await lookup).printings).toHaveLength(2)
    expect(hits).toEqual([])
  })
})
