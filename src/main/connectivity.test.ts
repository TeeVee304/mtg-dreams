import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkConnection, isOnline, missedService, onConnectivityChange, reachedService, startConnectivity } from './connectivity'
import { setEnvironment, SERVICES } from './environment'
import { fetchJson } from './http'

/**
 * Tests against a local server standing in for Scryfall; a closed port stands in for no internet.
 * The tests share the module's state and run in order.
 *
 * @packageDocumentation
 */

/** Nothing listens here. */
const CLOSED = 'http://127.0.0.1:9'
let server: Server
let base = ''
/** Requests the server got. */
let requests = 0
/** What the listener was told, in order. */
const changes: boolean[] = []

/** Points Scryfall at `scryfallApi`. */
const scryfallAt = (scryfallApi: string) =>
  setEnvironment({ userData: '', documents: '', appData: '', trash: async () => undefined, userAgent: 'MTGDreams/test', ...SERVICES, scryfallApi })

beforeAll(async () => {
  server = createServer((_req, res) => {
    requests += 1
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  onConnectivityChange((online) => changes.push(online))
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('connectivity', () => {
  it('checks nothing until started', async () => {
    scryfallAt(CLOSED)
    await missedService()
    expect(await checkConnection()).toBe(true)
    expect(isOnline()).toBe(true)
    expect(changes).toEqual([])
  })

  it('stays online when another service fails but Scryfall answers', async () => {
    startConnectivity()
    scryfallAt(base)
    await expect(fetchJson(`${CLOSED}/edhrec.json`, 'EDHREC')).rejects.toThrow('Could not reach EDHREC')
    expect(isOnline()).toBe(true)
    expect(requests).toBe(1)
    expect(changes).toEqual([])
  })

  it('goes offline before the error reaches the caller when Scryfall cannot be reached either', async () => {
    scryfallAt(CLOSED)
    await expect(fetchJson(`${CLOSED}/cards`, 'Scryfall')).rejects.toThrow('Could not reach Scryfall')
    expect(isOnline()).toBe(false)
    expect(changes).toEqual([false])
  })

  it('does not check again for each failure while offline', async () => {
    scryfallAt(base)
    const before = requests
    await expect(fetchJson(`${CLOSED}/cards`, 'Scryfall')).rejects.toThrow()
    expect(requests).toBe(before)
    expect(isOnline()).toBe(false)
  })

  it('shares one check between concurrent calls, and comes back online when Scryfall answers', async () => {
    const before = requests
    expect(await Promise.all([checkConnection(), checkConnection()])).toEqual([true, true])
    expect(requests).toBe(before + 1)
    expect(isOnline()).toBe(true)
    expect(changes).toEqual([false, true])
  })

  it('comes back online when any service answers', async () => {
    scryfallAt(CLOSED)
    await missedService()
    expect(isOnline()).toBe(false)
    reachedService()
    expect(isOnline()).toBe(true)
    expect(changes).toEqual([false, true, false, true])
  })
})
