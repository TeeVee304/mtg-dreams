import { createSignal } from '../lib/signal'
import { retryFailedPrintings } from './printings'
import { retrySetGroups } from './setGroups'

/**
 * Whether the online services can be reached, as the main process finds when requests fail. Coming
 * back online loads again what failed while offline: the Cards and the set groups (the main process
 * checks the price guide itself).
 *
 * @packageDocumentation
 */

let online = true
const changes = createSignal()

/** Records the connection state; coming back online retries what failed. */
function setOnline(next: boolean): void {
  if (next === online) return
  online = next
  changes.emit()
  if (online) {
    retryFailedPrintings()
    retrySetGroups()
  }
}

/** Follows the main process's connection state, and has it check again when Windows reconnects. @returns Unsubscribe. */
export function watchConnectivity(): () => void {
  const unsubscribe = window.api.onConnectivityChange(setOnline)
  void window.api.isOnline().then(setOnline, () => undefined)
  const recheck = () => void window.api.checkConnection()
  window.addEventListener('online', recheck)
  return () => {
    unsubscribe()
    window.removeEventListener('online', recheck)
  }
}

/** Asks Scryfall now whether the internet is back. @returns Whether the app is online. */
export const checkConnection = () => window.api.checkConnection().catch(() => online)

/** @returns Whether the services can be reached, outside components; components use {@link useOnline}. */
export const isOnline = () => online

/** Hook re-rendering when the app goes offline or comes back. @returns Whether it is online. */
export function useOnline(): boolean {
  changes.useVersion()
  return online
}
