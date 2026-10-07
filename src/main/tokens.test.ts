import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/** Local Scryfall `/cards/collection` stand-in. */
let server: Server
let base = ''
let online = true
let dir = ''
const requests: unknown[] = []

const CARDS: Record<string, unknown> = {
  'Smothering Tithe': {
    id: 'c1',
    name: 'Smothering Tithe',
    all_parts: [
      { component: 'combo_piece', id: 'c1', name: 'Smothering Tithe', type_line: 'Enchantment' },
      { component: 'token', id: 't1', name: 'Treasure', type_line: 'Token Artifact — Treasure' }
    ]
  },
  'Delver of Secrets // Insectile Aberration': { id: 'c2', name: 'Delver of Secrets // Insectile Aberration' }
}
const TOKENS: Record<string, unknown> = {
  t1: { id: 't1', name: 'Treasure', type_line: 'Token Artifact — Treasure', colors: [], oracle_text: 'Sac: add mana.', image_uris: { small: 'https://img/t1s.jpg?1', normal: 'https://img/t1n.jpg?1' } }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const json = (status: number, data: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
      if (!online) return json(503, null)
      const { identifiers } = JSON.parse(body) as { identifiers: Array<{ name?: string; id?: string }> }
      requests.push(identifiers)
      const data = identifiers
        .map((i) => (i.id ? TOKENS[i.id] : Object.entries(CARDS).find(([name]) => name.split(' // ')[0] === i.name)?.[1]))
        .filter(Boolean)
      json(200, { data, not_found: [] })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-tokens-'))
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

async function setup() {
  vi.resetModules()
  const { setEnvironment } = await import('./environment')
  setEnvironment({ userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'MTGDreams/test', scryfallApi: base, mtgjsonApi: base, priceGuideUrl: base, anthropicApi: base })
  return import('./tokens')
}

describe('getDeckTokens', () => {
  it('links cards to the tokens they make, fetching each token card once', async () => {
    online = true
    const tokens = await setup()
    const data = await tokens.getDeckTokens(['Smothering Tithe', 'Delver of Secrets', 'Unknown Card'])
    expect(data.available).toBe(true)
    expect(data.makers).toEqual({ 'Smothering Tithe': [{ id: 't1', kind: 'token' }], 'Delver of Secrets': [], 'Unknown Card': [] })
    expect(data.tokens.t1).toEqual({
      id: 't1', name: 'Treasure', typeLine: 'Token Artifact — Treasure', colors: [], text: 'Sac: add mana.',
      imageSmall: 'https://img/t1s.jpg', imageNormal: 'https://img/t1n.jpg', imageBack: null
    })
    expect(requests).toHaveLength(2)
  })

  it('serves the cache without requests, and offline', async () => {
    const tokens = await setup()
    await new Promise((resolve) => setTimeout(resolve, 50))
    requests.length = 0
    online = false
    const data = await tokens.getDeckTokens(['Smothering Tithe'])
    expect(data).toMatchObject({ available: true, makers: { 'Smothering Tithe': [{ id: 't1', kind: 'token' }] } })
    expect(requests).toHaveLength(0)
    expect((await tokens.getDeckTokens(['Brand New Card'])).available).toBe(false)
  })
})
