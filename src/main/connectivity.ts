import { env } from './environment'

/**
 * Whether the online services can be reached. A request that cannot connect asks Scryfall, the
 * service the app leans on most, whether the internet is there: only when Scryfall can't be reached
 * either is the app offline, so one service being down is not mistaken for no internet. While offline,
 * Scryfall is asked again every {@link RETRY_MS} (and on {@link checkConnection}); any answer from any
 * service brings the app back online.
 *
 * Nothing is checked until {@link startConnectivity}, so tests of the service clients never reach Scryfall.
 *
 * @packageDocumentation
 */

/** How often Scryfall is asked again while offline. */
const RETRY_MS = 30_000
/** How long Scryfall has to answer a check. */
const CHECK_TIMEOUT_MS = 10_000

let started = false
let offline = false
let checking: Promise<boolean> | null = null
let retry: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(online: boolean) => void>()

/** Starts checking the connection when requests fail. */
export function startConnectivity(): void {
  started = true
}

/** @returns Whether the services are thought reachable; true until a check finds otherwise. */
export function isOnline(): boolean {
  return !offline
}

/** Calls `listener` when the app goes offline or comes back. @returns Unsubscribe. */
export function onConnectivityChange(listener: (online: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Records the connection state; on a change, starts or stops retrying and tells the listeners. */
function setOnline(online: boolean): void {
  if (offline === !online) return
  offline = !online
  if (online && retry) {
    clearInterval(retry)
    retry = null
  } else if (!online) {
    retry = setInterval(() => void checkConnection(), RETRY_MS)
    retry.unref?.()
  }
  for (const listener of listeners) listener(online)
}

/** A service answered (with any HTTP status). */
export function reachedService(): void {
  if (started) setOnline(true)
}

/**
 * A request could not connect or timed out. Resolves once the connection is checked, so the app's
 * state is known before the request's error reaches the renderer.
 */
export async function missedService(): Promise<void> {
  if (started && !offline) await checkConnection()
}

/**
 * Asks Scryfall whether it can be reached; any HTTP answer counts. Concurrent calls share one check.
 * @returns Whether the app is online.
 */
export function checkConnection(): Promise<boolean> {
  if (!started) return Promise.resolve(true)
  checking ??= askScryfall().finally(() => (checking = null))
  return checking
}

/** One check of {@link checkConnection}. */
async function askScryfall(): Promise<boolean> {
  try {
    const { scryfallApi, userAgent } = env()
    await fetch(scryfallApi, { method: 'HEAD', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    setOnline(true)
  } catch {
    setOnline(false)
  }
  return !offline
}
