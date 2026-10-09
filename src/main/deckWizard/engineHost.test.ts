import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from './engine'
import { createEngineHost, ENGINE_STOPPED, type WorkerLike } from './engineHost'

/** The price guide, as the host sees it: a refresh, and news of a newer guide. */
const prices = vi.hoisted(() => ({ refresh: vi.fn(async () => true), saved: [] as Array<() => void> }))
vi.mock('../priceGuide', () => ({
  refreshPriceGuide: prices.refresh,
  onPriceGuideSaved: (listener: () => void) => {
    prices.saved.push(listener)
    return () => prices.saved.splice(prices.saved.indexOf(listener), 1)
  }
}))

/** A stand-in worker: records what it's sent, and answers when told. */
class FakeWorker extends EventEmitter implements WorkerLike {
  sent: ToWorker[] = []
  postMessage(message: ToWorker) {
    this.sent.push(message)
  }
  reply(message: FromWorker) {
    this.emit('message', message)
  }
  async terminate() {
    return 0
  }
}

/** A host over fake workers, with the workers it started. */
function setup() {
  const workers: FakeWorker[] = []
  const host = createEngineHost(() => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  return { host, workers }
}

describe('the engine host', () => {
  it('starts the worker on the first call, and passes calls and answers through', async () => {
    const { host, workers } = setup()
    expect(workers).toHaveLength(0)
    const status = host.call('search', 'flubs', { commanders: true, basis: 'trend' })
    expect(workers[0].sent).toEqual([{ kind: 'call', id: 0, method: 'search', args: ['flubs', { commanders: true, basis: 'trend' }] }])
    workers[0].reply({ kind: 'answer', id: 0, result: [{ name: 'Flubs, the Fool' }] })
    expect(await status).toEqual([{ name: 'Flubs, the Fool' }])
    const failing = host.call('plan', {})
    workers[0].reply({ kind: 'answer', id: 1, error: 'Choose a commander first.' })
    await expect(failing).rejects.toThrow('Choose a commander first.')
    expect(workers).toHaveLength(1)
    await host.close()
  })

  it('gets prices for the worker, and tells it when they change', async () => {
    const { host, workers } = setup()
    host.call('status').catch(() => undefined)
    workers[0].reply({ kind: 'refreshPrices', id: 7 })
    await vi.waitFor(() => expect(workers[0].sent.at(-1)).toEqual({ kind: 'answer', id: 7 }))
    expect(prices.refresh).toHaveBeenCalled()
    for (const listener of prices.saved) listener()
    expect(workers[0].sent.at(-1)).toMatchObject({ kind: 'call', method: 'pricesUpdated', args: [] })
    await host.close()
    expect(prices.saved).toHaveLength(0)
  })

  it('fails the waiting calls when the worker stops, and starts a new one on the next call', async () => {
    const { host, workers } = setup()
    const waiting = host.call('status')
    workers[0].emit('exit', 1)
    await expect(waiting).rejects.toThrow(ENGINE_STOPPED)
    host.call('status').catch(() => undefined)
    expect(workers).toHaveLength(2)
    await host.close()
  })

  it('gives up on a worker that keeps stopping', async () => {
    const { host, workers } = setup()
    for (let i = 0; i < 3; i++) {
      const call = host.call('status')
      workers[i].emit('error', new Error('crash'))
      await expect(call).rejects.toThrow(ENGINE_STOPPED)
    }
    await expect(host.call('status')).rejects.toThrow('keeps stopping')
    expect(workers).toHaveLength(3)
  })
})
