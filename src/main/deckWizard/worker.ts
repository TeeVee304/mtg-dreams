import { parentPort, workerData } from 'node:worker_threads'
import { setEnvironment, type Environment } from '../environment'
import { ENGINE, type FromWorker, type ToWorker } from './engine'
import { setWizardServices, type WizardServices } from './services'
import { setPriceRefresher } from './status'

/**
 * The worker thread that runs the wizard's engine: it answers calls from `engineHost.ts` one
 * message at a time, and asks the main process for a price guide when none is saved, as the main
 * process owns the guide's downloads.
 *
 * @packageDocumentation
 */

/** What the main process hands the worker at start. */
export interface WorkerSetup {
  environment: Omit<Environment, 'trash'>
  services: WizardServices
}

const port = parentPort!
const setup = workerData as WorkerSetup
// Files are never trashed from the worker.
setEnvironment({ ...setup.environment, trash: async () => undefined })
setWizardServices(setup.services)

let nextId = 0
/** Requests to the main process awaiting an answer, by id. */
const waiting = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
const send = (message: FromWorker) => port.postMessage(message)

setPriceRefresher(
  () =>
    new Promise<void>((resolve, reject) => {
      const id = nextId++
      waiting.set(id, { resolve, reject })
      send({ kind: 'refreshPrices', id })
    }).then(() => ENGINE.pricesUpdated())
)

port.on('message', async (message: ToWorker) => {
  if (message.kind === 'answer') {
    const request = waiting.get(message.id)
    waiting.delete(message.id)
    if (message.error) request?.reject(new Error(message.error))
    else request?.resolve()
    return
  }
  try {
    const method = ENGINE[message.method] as (...args: unknown[]) => unknown
    send({ kind: 'answer', id: message.id, result: await method(...message.args) })
  } catch (error) {
    send({ kind: 'answer', id: message.id, error: error instanceof Error ? error.message : String(error) })
  }
})
