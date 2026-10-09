import { onPriceGuideSaved, refreshPriceGuide } from '../priceGuide'
import type { EngineCall, FromWorker, ToWorker } from './engine'

/**
 * The main process's side of the wizard's engine: forwards calls to the worker thread and their
 * answers back, answers the worker's requests for prices, and tells it when prices change. If the
 * worker stops, the calls waiting fail in plain words and the next call starts a new one, up to
 * {@link MAX_RESTARTS} times a minute.
 *
 * @packageDocumentation
 */

/** What the host needs of a worker thread; `node:worker_threads`' Worker fits. */
export interface WorkerLike {
  postMessage(message: ToWorker): void
  on(event: 'message', listener: (message: FromWorker) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  terminate(): Promise<number>
}

/** The engine, wherever it runs. */
export interface EngineHost {
  call: EngineCall
  /** Stops the worker. */
  close(): Promise<void>
}

/** Worker starts allowed per rolling minute, so a worker that keeps failing doesn't spin. */
const MAX_RESTARTS = 3
/** What a call that the stopped worker was running fails with. */
export const ENGINE_STOPPED = 'The Deck Wizard stopped unexpectedly. Try again.'

/** Starts the engine in workers made by `spawn`, one at a time. */
export function createEngineHost(spawn: () => WorkerLike): EngineHost {
  let worker: WorkerLike | null = null
  let nextId = 0
  const starts: number[] = []
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()

  const failAll = (message: string) => {
    for (const { reject } of pending.values()) reject(new Error(message))
    pending.clear()
  }

  const start = (): WorkerLike => {
    const now = Date.now()
    while (starts.length > 0 && now - starts[0] > 60_000) starts.shift()
    if (starts.length >= MAX_RESTARTS) throw new Error('The Deck Wizard keeps stopping. Restart MTG Dreams to try again.')
    starts.push(now)
    const started = spawn()
    started.on('message', (message) => {
      if (message.kind === 'refreshPrices') {
        refreshPriceGuide().then(
          () => started.postMessage({ kind: 'answer', id: message.id }),
          (error: Error) => started.postMessage({ kind: 'answer', id: message.id, error: error.message })
        )
        return
      }
      const call = pending.get(message.id)
      pending.delete(message.id)
      if (message.error !== undefined) call?.reject(new Error(message.error))
      else call?.resolve(message.result)
    })
    const stopped = () => {
      if (worker !== started) return
      worker = null
      failAll(ENGINE_STOPPED)
    }
    started.on('error', stopped)
    started.on('exit', stopped)
    return started
  }

  const unsubscribe = onPriceGuideSaved(() => worker?.postMessage({ kind: 'call', id: nextId++, method: 'pricesUpdated', args: [] }))

  const call: EngineCall = (method, ...args) =>
    new Promise((resolve, reject) => {
      try {
        worker ??= start()
      } catch (error) {
        return reject(error)
      }
      const id = nextId++
      pending.set(id, { resolve, reject })
      worker.postMessage({ kind: 'call', id, method, args })
    })

  return {
    call,
    async close() {
      unsubscribe()
      const current = worker
      worker = null
      failAll(ENGINE_STOPPED)
      await current?.terminate()
    }
  }
}
