import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/** Local MTGJSON stand-in, recording the decklists asked for. */
let server: Server
let base = ''
let dir = ''
let online = true
const asked: string[] = []

const INDEX = [
  { fileName: 'Hoard_ABC', name: 'Hoard', code: 'ABC', type: 'Commander Deck', releaseDate: '2025-01-01' },
  { fileName: 'Broken_ABC', name: 'Broken', code: 'ABC', type: 'Commander Deck', releaseDate: '2025-01-01' },
  { fileName: 'Theme_ABC', name: 'Theme', code: 'ABC', type: 'Theme Deck', releaseDate: '2025-01-01' }
]
const HOARD = {
  name: 'Hoard',
  code: 'ABC',
  type: 'Commander Deck',
  commander: [{ name: 'Korvold, Fae-Cursed King', count: 1, setCode: 'ABC', number: '1' }],
  mainBoard: [
    { name: 'Sol Ring', count: 1, setCode: 'ABC', number: '2' },
    { name: 'Forest', count: 10, setCode: 'ABC', number: '3', supertypes: ['Basic'], types: ['Land'] }
  ]
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const json = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    if (!online) return json(503, null)
    if (req.url === '/DeckList.json') return json(200, { data: INDEX })
    asked.push(req.url ?? '')
    if (req.url === '/decks/Hoard_ABC.json') return json(200, { data: HOARD })
    json(500, null)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-community-'))
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

/** Fresh modules over the stand-in, as after a restart. */
async function setup() {
  vi.resetModules()
  const { setEnvironment } = await import('../environment')
  setEnvironment({ userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'MTGDreams/test', scryfallApi: base, mtgjsonApi: base, priceGuideUrl: base })
  return import('./community')
}

describe('precons for the statistics', () => {
  it('fetches the Commander precons once, keeping the commanders and cards by name', async () => {
    const community = await setup()
    expect(community.communityDecks()).toBeNull()
    const decks = await community.loadCommunityDecks()
    expect(decks).toEqual([{ id: 'Hoard_ABC', name: 'Hoard', commanders: ['Korvold, Fae-Cursed King'], cards: ['Sol Ring', 'Forest'] }])
    expect(asked.sort()).toEqual(['/decks/Broken_ABC.json', '/decks/Hoard_ABC.json'])
    expect(community.communityDecks()).toBe(decks)
    expect(community.communityLoading()).toBe(false)
  })

  it('after a restart, reads them from its cache and only tries the missing ones again', async () => {
    asked.length = 0
    const community = await setup()
    expect((await community.loadCommunityDecks()).map((d) => d.id)).toEqual(['Hoard_ABC'])
    expect(asked).toEqual(['/decks/Broken_ABC.json'])
  })

  it('offline, uses the decks it has', async () => {
    online = false
    const community = await setup()
    expect((await community.loadCommunityDecks()).map((d) => d.id)).toEqual(['Hoard_ABC'])
    online = true
  })
})
