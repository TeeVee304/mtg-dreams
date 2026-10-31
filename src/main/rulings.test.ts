import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** Local Scryfall stand-in: rulings by printing id. */
let server: Server
let base = ''
let online = true
let dir = ''
const hits: string[] = []

const BOLT = '00000000-0000-0000-0000-000000000001'
const OTHER_BOLT = '00000000-0000-0000-0000-000000000002'
const VANILLA = '00000000-0000-0000-0000-000000000003'

/** Rulings by `/cards/<id>/rulings`, oldest first as Scryfall lists them. */
const RULINGS: Record<string, unknown[]> = {
  [`/cards/${BOLT}/rulings`]: [
    { source: 'wotc', published_at: '2004-10-04', comment: 'The older ruling.' },
    { source: 'scryfall', published_at: '2021-03-19', comment: ' The newer ruling. ' },
    { source: 'wotc', published_at: '2022-01-01', comment: '' }
  ],
  [`/cards/${VANILLA}/rulings`]: []
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x')
    hits.push(url.pathname)
    const json = (status: number, data: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
    if (!online) return json(503, null)
    const found = RULINGS[url.pathname]
    return found ? json(200, { object: 'list', data: found }) : json(404, { object: 'error' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => server.close())

beforeEach(async () => {
  online = true
  hits.length = 0
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-rulings-'))
})

/** A fresh copy of the module, with an empty cache. */
async function setup() {
  vi.resetModules()
  const { setEnvironment } = await import('./environment')
  setEnvironment({ userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'MTGDreams/test', scryfallApi: base, mtgjsonApi: base, priceGuideUrl: base, edhrecJson: base, cardImagesUrl: base })
  return import('./rulings')
}

describe('card rulings', () => {
  it('lists the rulings newest first, skipping empty ones, and asks once per card', async () => {
    const { getRulings } = await setup()
    expect(await getRulings('Lightning Bolt', BOLT)).toEqual([
      { date: '2021-03-19', source: 'scryfall', text: 'The newer ruling.' },
      { date: '2004-10-04', source: 'wotc', text: 'The older ruling.' }
    ])
    // Another printing of the same card.
    expect(await getRulings('lightning bolt', OTHER_BOLT)).toHaveLength(2)
    expect(hits).toEqual([`/cards/${BOLT}/rulings`])
  })

  it('remembers a card with no rulings', async () => {
    const { getRulings } = await setup()
    expect(await getRulings('Grizzly Bears', VANILLA)).toEqual([])
    expect(await getRulings('Grizzly Bears', VANILLA)).toEqual([])
    expect(hits).toHaveLength(1)
  })

  it('answers null offline and caches nothing, so it finds the rulings once back online', async () => {
    const { getRulings } = await setup()
    online = false
    expect(await getRulings('Lightning Bolt', BOLT)).toBeNull()
    online = true
    expect(await getRulings('Lightning Bolt', BOLT)).toHaveLength(2)
  })

  it('keeps the rulings for the next start', async () => {
    const first = await setup()
    await first.getRulings('Lightning Bolt', BOLT)
    const restarted = await setup()
    online = false
    expect(await restarted.getRulings('Lightning Bolt', BOLT)).toHaveLength(2)
  })
})
