import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearCacheMemory } from '../cacheFiles'
import { bracketFacts, findCombos } from './combos'
import { SERVICES, setEnvironment } from '../environment'
import { setWizardServices } from './services'

const variant = { id: '618-1537', uses: [{ card: { name: 'Kiki-Jiki, Mirror Breaker' } }, { card: { name: 'Zealous Conscripts' } }], produces: [] }
const requests: Array<{ url: string; body: any }> = []
let server: Server
let base = ''
let dir = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      requests.push({ url: req.url ?? '', body: JSON.parse(body || 'null') })
      const data = req.url === '/find-my-combos' ? { results: { included: [variant], almostIncluded: [] } } : { bracketTag: 'R', cards: [], combos: [] }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-spellbook-'))
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'MTGDreams/test' })
  setWizardServices({ spellbookApi: base })
  requests.length = 0
  clearCacheMemory()
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('Commander Spellbook client', () => {
  it('sends the deck and reads the combos, then answers the same cards from its cache', async () => {
    const search = await findCombos(['Kiki-Jiki, Mirror Breaker'], ['Zealous Conscripts', 'Lightning Bolt'])
    expect(search?.included.map((c) => c.id)).toEqual(['618-1537'])
    expect(requests[0].body).toEqual({ commanders: [{ card: 'Kiki-Jiki, Mirror Breaker' }], main: [{ card: 'Zealous Conscripts' }, { card: 'Lightning Bolt' }] })
    await findCombos(['Kiki-Jiki, Mirror Breaker'], ['Lightning Bolt', 'Zealous Conscripts'])
    clearCacheMemory()
    await findCombos(['Kiki-Jiki, Mirror Breaker'], ['Zealous Conscripts', 'Lightning Bolt'])
    expect(requests).toHaveLength(1)
  })

  it('reads bracket facts', async () => {
    expect(await bracketFacts([], ['Sol Ring'])).toMatchObject({ tag: 'R' })
    expect(requests[0].url).toBe('/estimate-bracket')
  })

  it('answers null when Commander Spellbook can’t be reached', async () => {
    setWizardServices({ spellbookApi: 'http://127.0.0.1:1' })
    expect(await findCombos([], ['Sol Ring'])).toBeNull()
  })
})
