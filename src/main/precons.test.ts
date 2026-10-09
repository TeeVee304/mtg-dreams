import { readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/** Local MTGJSON stand-in. */
let server: Server
let base = ''
let online = true
let dir = ''

const DECKS = [
  { fileName: 'OldDeck_ABC', name: 'Old Deck', code: 'ABC', type: 'Theme Deck', releaseDate: '1999-01-01' },
  { fileName: 'ArenaOnly_XYZ', name: 'Arena Only', code: 'XYZ', type: 'Arena Starter Deck', releaseDate: '2024-01-01' },
  { fileName: 'NewDeck_FDC', name: 'New Deck', code: 'FDC', type: 'Commander Deck', releaseDate: '2026-10-02' }
]
const DECK = {
  name: 'New Deck',
  code: 'FDC',
  type: 'Commander Deck',
  releaseDate: '2026-10-02',
  commander: [{ name: 'Atraxa', count: 1, setCode: 'FDC', number: '1', isFoil: true, identifiers: { scryfallId: 'a1' } }],
  mainBoard: [
    { name: 'Command Tower // Command Tower', count: 1, setCode: 'FDC', number: '2' },
    { name: 'Delver of Secrets // Insectile Aberration', count: 1, setCode: 'FDC', number: '3', side: 'b' },
    { name: 'Island', count: 30, setCode: 'FDC', number: '4', supertypes: ['Basic'], types: ['Land'] }
  ]
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const json = (status: number, body: unknown) =>
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    if (!online) return json(503, null)
    if (req.url === '/DeckList.json') return json(200, { data: DECKS })
    if (req.url === '/decks/NewDeck_FDC.json') return json(200, { data: DECK })
    json(404, {})
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-precons-'))
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

async function setup() {
  vi.resetModules()
  const { setEnvironment } = await import('./environment')
  setEnvironment({ userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'MTGDreams/test', scryfallApi: base, mtgjsonApi: base, priceGuideUrl: base })
  return import('./precons')
}

describe('precons', () => {
  it('lists paper decks newest first, and reads a decklist by board', async () => {
    const precons = await setup()
    expect((await precons.getPreconIndex()).map((d) => d.name)).toEqual(['New Deck', 'Old Deck'])
    const deck = await precons.getPrecon('NewDeck_FDC')
    expect(deck.cards).toEqual([
      expect.objectContaining({ name: 'Atraxa', board: 'commander', foil: true, scryfallId: 'a1' }),
      expect.objectContaining({ name: 'Command Tower', board: 'main' }),
      expect.objectContaining({ name: 'Island', qty: 30, basic: true })
    ])
    await expect(precons.getPrecon('../../secrets')).rejects.toThrow('Invalid deck name.')
    await vi.waitFor(() => expect(readdirSync(join(dir, 'precons')).filter((f) => f.endsWith('.json'))).toHaveLength(2))
  })

  it('works offline from its cache', async () => {
    online = false
    const precons = await setup()
    expect((await precons.getPreconIndex()).length).toBe(2)
    expect((await precons.getPrecon('NewDeck_FDC')).name).toBe('New Deck')
    online = true
  })
})
