import { createServer, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Printing, PrintingsResult } from '@shared/types'

/** Local Cardmarket price guide payload. */
const published = {
  lastModified: 'Wed, 30 Sep 2026 07:55:13 GMT',
  createdAt: '2026-09-30T09:54:57+0200',
  /** Status of the download itself (the date check always answers). */
  downloadStatus: 200,
  priceGuides: [
    { idProduct: 101, avg: 1, low: 0.2, trend: 1.1, avg1: 1, avg7: 1, avg30: 1.25, 'low-foil': 2, 'trend-foil': 3, 'avg30-foil': 3.5 },
    { idProduct: 102, avg: 5, low: 4, trend: 0, avg30: 6 }
  ]
}
const requests: string[] = []
let server: Server
let url = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.method ?? '')
    const body = JSON.stringify({ version: 1, createdAt: published.createdAt, priceGuides: published.priceGuides })
    const status = req.method === 'HEAD' ? 200 : published.downloadStatus
    res.writeHead(status, { 'Content-Type': 'application/json', 'Last-Modified': published.lastModified })
    res.end(req.method === 'HEAD' ? undefined : status === 200 ? body : '<h1>Unavailable</h1>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/price_guide_1.json`
})

afterAll(() => server.close())

const dirs: string[] = []
afterEach(async () => {
  requests.length = 0
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A fresh copy of the module, with its own folder; `guideUrl` defaults to the stand-in. */
async function setup(userData?: string, guideUrl = url) {
  vi.resetModules()
  const dir = userData ?? (await mkdtemp(join(tmpdir(), 'mtg-dreams-guide-')))
  dirs.push(dir)
  const { setEnvironment, SERVICES } = await import('./environment')
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test', priceGuideUrl: guideUrl })
  return { dir, guide: await import('./priceGuide') }
}

const printing = (cardmarketId: number | null, trend?: number): Printing => ({
  id: `p${cardmarketId}`,
  name: 'Sol Ring',
  set: 'cmm',
  setName: 'Commander Masters',
  collectorNumber: '1',
  rarity: 'uncommon',
  releasedAt: '2023-08-04',
  lang: 'en',
  finishes: ['nonfoil', 'foil'],
  cardmarketId,
  price: trend === undefined ? {} : { trend },
  priceFoil: {},
  imageSmall: null,
  imageNormal: null,
  imageBack: null,
  cardmarketUrl: null,
  labels: [],
  autoEligible: true
})

const result = (...printings: Printing[]): PrintingsResult => ({ name: 'Sol Ring', printings, fetchedAt: 0 })

describe('the price guide', () => {
  it('adds Cardmarket prices to printings, keeping Scryfall\'s trend where the guide has none', async () => {
    const { guide } = await setup()
    expect(await guide.refreshPriceGuide()).toBe(true)
    const scryfall = result(printing(101, 0.9), printing(102, 7), printing(999, 2), printing(null))
    const priced = await guide.withMarketPrices(scryfall)
    expect(priced.printings.map((p) => [p.price, p.priceFoil])).toEqual([
      [{ trend: 1.1, low: 0.2, avg30: 1.25 }, { trend: 3, low: 2, avg30: 3.5 }],
      [{ trend: 7, low: 4, avg30: 6 }, {}],
      [{ trend: 2 }, {}],
      [{}, {}]
    ])
    expect(priced.pricedAt).toBe(Date.parse(published.createdAt))
    expect(guide.priceGuideDate()).toBe(Date.parse(published.createdAt))
    expect(scryfall.printings[0].price).toEqual({ trend: 0.9 })
  })

  it('checks only the date when nothing new is published', async () => {
    const { guide } = await setup()
    await guide.refreshPriceGuide()
    requests.length = 0
    expect(await guide.refreshPriceGuide()).toBe(false)
    expect(requests).toEqual(['HEAD'])
  })

  it('downloads a newly published guide', async () => {
    const { guide } = await setup()
    await guide.refreshPriceGuide()
    const old = { ...published }
    published.lastModified = 'Thu, 01 Oct 2026 07:55:13 GMT'
    published.createdAt = '2026-10-01T09:54:57+0200'
    published.priceGuides = [{ ...old.priceGuides[0], trend: 1.5 }]
    try {
      expect(await guide.refreshPriceGuide()).toBe(true)
      expect((await guide.withMarketPrices(result(printing(101)))).printings[0].price.trend).toBe(1.5)
    } finally {
      Object.assign(published, old)
    }
  })

  it('keeps a compact copy, so prices survive a restart and work offline', async () => {
    const first = await setup()
    await first.guide.refreshPriceGuide()
    expect(existsSync(join(first.dir, 'price-guide.json'))).toBe(true)

    const offline = await setup(first.dir, 'http://127.0.0.1:1/price_guide_1.json')
    expect((await offline.guide.withMarketPrices(result(printing(101)))).printings[0].price.low).toBe(0.2)
    await expect(offline.guide.refreshPriceGuide()).rejects.toThrow('Could not reach Cardmarket')
  })

  it('leaves printings as they are without a guide, and keeps the old one when a download fails', async () => {
    const empty = await setup(undefined, 'http://127.0.0.1:1/price_guide_1.json')
    const scryfall = result(printing(101, 0.9))
    expect(await empty.guide.withMarketPrices(scryfall)).toBe(scryfall)

    const { guide } = await setup()
    await guide.refreshPriceGuide()
    const old = { ...published }
    published.lastModified = 'Fri, 02 Oct 2026 07:55:13 GMT'
    published.downloadStatus = 500
    try {
      await expect(guide.refreshPriceGuide()).rejects.toThrow('price guide is unavailable')
      expect((await guide.withMarketPrices(result(printing(101)))).printings[0].price.trend).toBe(1.1)
    } finally {
      Object.assign(published, old)
    }
  })
})
