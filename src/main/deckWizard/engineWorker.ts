import { env } from '../environment'
import { createEngineHost, type EngineHost } from './engineHost'
import { wizardServices } from './services'
import createWorker from './worker?nodeWorker'
import type { WorkerSetup } from './worker'

/**
 * Starts the wizard's engine in a worker thread, bundled by electron-vite from `worker.ts`, with
 * the app's paths and the wizard's services.
 *
 * @packageDocumentation
 */

/** @returns The engine, its worker started on the first call. */
export function startEngine(): EngineHost {
  return createEngineHost(() => {
    const { userData, documents, appData, userAgent, scryfallApi, mtgjsonApi, priceGuideUrl } = env()
    const workerData: WorkerSetup = {
      environment: { userData, documents, appData, userAgent, scryfallApi, mtgjsonApi, priceGuideUrl },
      services: wizardServices()
    }
    return createWorker({ workerData })
  })
}
