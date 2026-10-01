import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A fresh copy of the module with its own folder, and no price guide (prices come from `lookup`). */
async function setup(userData?: string) {
  vi.resetModules()
  const dir = userData ?? (await mkdtemp(join(tmpdir(), 'mtg-dreams-history-')))
  dirs.push(dir)
  const { setEnvironment, SERVICES } = await import('./environment')
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test', priceGuideUrl: 'http://127.0.0.1:9/none' })
  return { dir, history: await import('./priceHistory') }
}

const DAY = 24 * 60 * 60 * 1000
const prices: Record<number, [number, number]> = { 1: [10, 20], 2: [1, 0], 3: [0, 0] }
const lookup = (id: number) => prices[id]

describe('price history', () => {
  it('records each day once for the tracked versions, skipping ones without a price', async () => {
    const { history } = await setup()
    await history.trackPrices([2, 1, 3, 1]) // no guide yet: nothing recorded
    expect(await history.pricesAt([1], [0])).toBeNull()
    expect(await history.recordPrices(DAY, lookup)).toBe(true)
    expect(await history.recordPrices(DAY, lookup)).toBe(false) // already there
    const result = await history.pricesAt([1, 2, 3], [0])
    expect(result?.latest).toEqual({ date: DAY, prices: { 1: [10, 20], 2: [1, 0] } })
  })

  it('finds the snapshot in force at a moment, or the oldest when the history is shorter', async () => {
    const { history } = await setup()
    await history.trackPrices([1])
    for (const [day, price] of [[1, 10], [2, 11], [5, 15]]) await history.recordPrices(day * DAY, () => [price, 0])
    const result = await history.pricesAt([1], [4 * DAY, 2 * DAY, 0])
    expect(result?.latest.prices[1]).toEqual([15, 0])
    expect(result?.then.map((snapshot) => snapshot.date)).toEqual([2 * DAY, 2 * DAY, DAY])
  })

  it('adds versions tracked later to the current day, and ignores older guides', async () => {
    const { history } = await setup()
    await history.trackPrices([1])
    await history.recordPrices(2 * DAY, lookup)
    await history.trackPrices([1, 2])
    await history.recordPrices(2 * DAY, lookup)
    expect(await history.recordPrices(DAY, lookup)).toBe(false)
    expect((await history.pricesAt([1, 2], []))?.latest.prices).toEqual({ 1: [10, 20], 2: [1, 0] })
  })

  it('keeps baselines and history on disk', async () => {
    const first = await setup()
    await first.history.trackPrices([1])
    await first.history.recordPrices(DAY, lookup)
    await first.history.updateBaselines({ 'opt|||false': { at: DAY, prices: { trend: 0.2 } } }, [])
    await first.history.priceHistorySaved()
    expect(JSON.parse(await readFile(join(first.dir, 'price-history.json'), 'utf8')).tracked).toEqual([1])

    const again = await setup(first.dir)
    expect(await again.history.getBaselines()).toEqual({ 'opt|||false': { at: DAY, prices: { trend: 0.2 } } })
    await again.history.updateBaselines({}, ['opt|||false'])
    expect(await again.history.getBaselines()).toEqual({})
    expect((await again.history.pricesAt([1], []))?.latest.date).toBe(DAY)
  })
})
