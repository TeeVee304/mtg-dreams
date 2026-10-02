import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setEnvironment, SERVICES } from './environment'
import { fetchJson, fetchLastModified } from './http'

setEnvironment({ userData: '', documents: '', appData: '', trash: async () => undefined, userAgent: 'MTGDreams/test', ...SERVICES })

/**
 * Tests against a local server standing in for Scryfall, MTGJSON and Cardmarket.
 *
 * @packageDocumentation
 */

const DATED = 'Wed, 30 Sep 2026 07:55:13 GMT'
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/hang') return
    if (req.url === '/dated') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Last-Modified': DATED })
      res.end(req.method === 'HEAD' ? undefined : '{"big":true}')
      return
    }
    if (req.url === '/html') {
      res.writeHead(503, { 'Content-Type': 'text/html' }).end('<h1>Down for maintenance</h1>')
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ua: req.headers['user-agent'] }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.closeAllConnections()
  server.close()
})

describe('fetchJson', () => {
  it('returns parsed JSON and identifies the app', async () => {
    expect(await fetchJson(`${base}/ok`, 'Scryfall')).toEqual({ status: 200, data: { ua: 'MTGDreams/test' }, lastModified: null })
  })

  it('gives up on a service that never answers, instead of waiting forever', async () => {
    const started = Date.now()
    await expect(fetchJson(`${base}/hang`, 'Scryfall', undefined, 200)).rejects.toThrow('Scryfall took too long to answer')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('reports non-JSON error pages by status', async () => {
    expect(await fetchJson(`${base}/html`, 'MTGJSON')).toEqual({ status: 503, data: null, lastModified: null })
  })

  it('passes on when the file last changed', async () => {
    expect((await fetchJson(`${base}/dated`, 'Cardmarket')).lastModified).toBe(DATED)
  })

  it('explains an unreachable service', async () => {
    await expect(fetchJson('http://127.0.0.1:1/', 'MTGJSON')).rejects.toThrow('Could not reach MTGJSON')
  })
})

describe('fetchLastModified', () => {
  it("reads a file's date without downloading it", async () => {
    expect(await fetchLastModified(`${base}/dated`, 'Cardmarket')).toBe(DATED)
    expect(await fetchLastModified(`${base}/ok`, 'Cardmarket')).toBeNull()
    await expect(fetchLastModified('http://127.0.0.1:1/', 'Cardmarket')).rejects.toThrow('Could not reach Cardmarket')
  })
})
