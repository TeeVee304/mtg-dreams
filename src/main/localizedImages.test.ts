import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** Local Scryfall stand-in: printings by set, number and language, and language searches. */
let server: Server
let base = ''
let online = true
let dir = ''
const hits: string[] = []

const printing = (set: string, collector: string, status: string) => ({
  set,
  collector_number: collector,
  image_status: status,
  image_uris: { normal: `https://cards.scryfall.io/normal/${set}-${collector}.jpg?1` }
})

/** Printings by `/cards/<set>/<number>/<lang>`. */
const PRINTINGS: Record<string, unknown> = {
  '/cards/clb/187/es': printing('clb', '187', 'highres_scan'),
  '/cards/m11/149/de': {
    ...printing('m11', '149', 'highres_scan'),
    name: 'Lightning Bolt',
    printed_name: 'Blitzschlag',
    type_line: 'Instant',
    printed_type_line: 'Spontanzauber',
    printed_text: 'Blitzschlag fügt einem Ziel deiner Wahl 3 Schadenspunkte zu.'
  },
  '/cards/a25/141/de': printing('a25', '141', 'placeholder')
}
/** Search results, newest first, by language. */
const SEARCHES: Record<string, unknown[]> = {
  de: [printing('sta', '42', 'placeholder'), printing('m10', '146', 'highres_scan')]
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x')
    hits.push(url.pathname)
    const json = (status: number, data: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
    if (!online) return json(503, null)
    if (url.pathname === '/cards/search') {
      const lang = /lang:(\w+)/.exec(url.searchParams.get('q') ?? '')?.[1] ?? ''
      const found = url.searchParams.get('include_multilingual') === 'true' ? SEARCHES[lang] : undefined
      return found ? json(200, { data: found, has_more: false }) : json(404, { object: 'error' })
    }
    const found = PRINTINGS[url.pathname]
    return found ? json(200, found) : json(404, { object: 'error' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => server.close())

beforeEach(async () => {
  online = true
  hits.length = 0
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-localized-'))
})

/** A fresh copy of the module, with an empty cache. */
async function setup() {
  vi.resetModules()
  const { setEnvironment } = await import('./environment')
  setEnvironment({ userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'MTGDreams/test', scryfallApi: base, mtgjsonApi: base, priceGuideUrl: base, edhrecJson: base, cardImagesUrl: base })
  return import('./localizedImages')
}

describe('card images in another language', () => {
  it("shows the printing's own scan in that language", async () => {
    const { getLocalizedImage } = await setup()
    expect(await getLocalizedImage({ name: 'Lightning Bolt', lang: 'es', set: 'clb', collector: '187' })).toEqual({
      imageNormal: 'https://cards.scryfall.io/normal/clb-187.jpg',
      imageBack: null
    })
    expect(hits).toEqual(['/cards/clb/187/es'])
  })

  it('keeps the text printed on that printing, when Scryfall has it', async () => {
    const { getLocalizedImage } = await setup()
    const image = await getLocalizedImage({ name: 'Lightning Bolt', lang: 'de', set: 'm11', collector: '149' })
    expect(image?.faces).toEqual([
      { name: 'Blitzschlag', typeLine: 'Spontanzauber', text: 'Blitzschlag fügt einem Ziel deiner Wahl 3 Schadenspunkte zu.' }
    ])
  })

  it('takes the newest printing scanned in that language, past placeholders', async () => {
    const { getLocalizedImage } = await setup()
    const image = await getLocalizedImage({ name: 'Lightning Bolt', lang: 'de', set: 'a25', collector: '141' })
    expect(image?.imageNormal).toBe('https://cards.scryfall.io/normal/m10-146.jpg')
    expect(hits).toEqual(['/cards/a25/141/de', '/cards/search'])
    // A printing never made in that language.
    const other = await getLocalizedImage({ name: 'Lightning Bolt', lang: 'de', set: 'sld', collector: '7' })
    expect(other?.imageNormal).toBe('https://cards.scryfall.io/normal/m10-146.jpg')
  })

  it('remembers a language with no scan, asking Scryfall once', async () => {
    const { getLocalizedImage } = await setup()
    expect(await getLocalizedImage({ name: 'Lightning Bolt', lang: 'ko' })).toBeNull()
    expect(await getLocalizedImage({ name: 'lightning bolt', lang: 'ko' })).toBeNull()
    expect(hits).toEqual(['/cards/search'])
  })

  it('caches nothing offline, so it finds the image once back online', async () => {
    const { getLocalizedImage } = await setup()
    online = false
    expect(await getLocalizedImage({ name: 'Lightning Bolt', lang: 'es', set: 'clb', collector: '187' })).toBeNull()
    online = true
    expect(await getLocalizedImage({ name: 'Lightning Bolt', lang: 'es', set: 'clb', collector: '187' })).not.toBeNull()
  })
})
