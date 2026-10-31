import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseSavedImage, serveCardImage, sweepCardImages } from './cardImages'
import { setEnvironment, SERVICES } from './environment'

/**
 * Tests against a local server standing in for Scryfall's image host; a closed port stands in for no internet.
 *
 * @packageDocumentation
 */

const ID = '0a1b2c3d-0000-4000-8000-000000000000'
const OTHER = '0a2b2c3d-0000-4000-8000-000000000000'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

let dir = ''
let server: Server
let base = ''
/** Paths the server was asked for. */
const hits: string[] = []

/** Points the image host at `cardImagesUrl`. */
const imagesAt = (cardImagesUrl: string) =>
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test', cardImagesUrl })

const get = (url: string) => serveCardImage(new Request(url))

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-images-'))
  server = createServer((req, res) => {
    hits.push(req.url ?? '')
    if (req.url?.includes(ID)) res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(JPEG)
    else res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  imagesAt(base)
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

describe('saved card images', () => {
  it('read addresses as a file and the Scryfall image, refusing anything else', () => {
    expect(parseSavedImage(`card-image://scryfall/small/front/0/a/${ID}.jpg`)).toEqual({
      id: ID,
      file: `${ID}.jpg`,
      remote: `${base}/small/front/0/a/${ID}.jpg`
    })
    expect(parseSavedImage(`card-image://scryfall/small/back/0/a/${ID}.jpg`)?.file).toBe(`${ID}-back.jpg`)
    expect(parseSavedImage(`card-image://scryfall/small/front/1/a/${ID}.jpg`)).toBeNull()
    expect(parseSavedImage(`card-image://scryfall/normal/front/0/a/${ID}.jpg`)).toBeNull()
    expect(parseSavedImage(`card-image://scryfall/small/front/0/a/../../settings.json`)).toBeNull()
  })

  it('download once, even when shown twice at once, and are saved', async () => {
    const url = `card-image://scryfall/small/front/0/a/${ID}.jpg`
    const [first, second] = await Promise.all([get(url), get(url)])
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/jpeg')
    expect(Buffer.from(await second.arrayBuffer())).toEqual(JPEG)
    expect(hits).toEqual([`/small/front/0/a/${ID}.jpg`])
    expect(readdirSync(join(dir, 'images'))).toEqual([`${ID}.jpg`])
  })

  it('show offline once saved, and fail quietly when not', async () => {
    imagesAt('http://127.0.0.1:9')
    const saved = await get(`card-image://scryfall/small/front/0/a/${ID}.jpg`)
    expect(Buffer.from(await saved.arrayBuffer())).toEqual(JPEG)
    expect((await get(`card-image://scryfall/small/front/0/a/${OTHER}.jpg`)).status).toBe(504)
    expect((await get('card-image://scryfall/elsewhere.jpg')).status).toBe(404)
    imagesAt(base)
  })

  it('are not saved when Scryfall has none', async () => {
    expect((await get(`card-image://scryfall/small/front/0/a/${OTHER}.jpg`)).status).toBe(504)
    expect(existsSync(join(dir, 'images', `${OTHER}.jpg`))).toBe(false)
  })

  it('go when no cache holds their card, at most hourly unless forced', async () => {
    await mkdir(join(dir, 'images'), { recursive: true })
    writeFileSync(join(dir, 'images', `${ID}-back.jpg`), JPEG)
    writeFileSync(join(dir, 'images', `${OTHER}.jpg`), JPEG)
    await sweepCardImages(new Set([ID]))
    expect(readdirSync(join(dir, 'images')).sort()).toEqual([`${ID}-back.jpg`, `${ID}.jpg`])
    await sweepCardImages(new Set())
    expect(readdirSync(join(dir, 'images'))).toHaveLength(2)
    await sweepCardImages(new Set(), true)
    expect(readdirSync(join(dir, 'images'))).toEqual([])
  })
})
