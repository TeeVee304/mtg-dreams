import { env } from './environment'

// The one way the app talks to card-data services (Scryfall, MTGJSON, Cardmarket):
// HTTPS with the app's User-Agent, and a timeout so a stalled connection can't
// hold up a request queue forever.

const TIMEOUT_MS = 30_000

export interface JsonResponse {
  status: number
  /** The parsed body, or null when it isn't JSON (e.g. a proxy's error page). */
  data: any
  /** The server's Last-Modified header, if any. */
  lastModified: string | null
}

/** Sends one request; rejects only when the service can't be reached in time. */
async function request<T>(
  url: string,
  service: string,
  init: RequestInit,
  timeoutMs: number,
  read: (res: Response) => Promise<T>
): Promise<T> {
  const { userAgent } = env()
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': userAgent, Accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(timeoutMs)
    })
    // Reading the body is covered by the same timeout.
    return await read(res)
  } catch (error) {
    throw new Error(
      (error as Error).name === 'TimeoutError'
        ? `${service} took too long to answer. Try again in a moment.`
        : `Could not reach ${service} — are you offline?`
    )
  }
}

/** GETs (or, with a body, POSTs) JSON. */
export function fetchJson(url: string, service: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<JsonResponse> {
  const init: RequestInit =
    body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  return request(url, service, init, timeoutMs, async (res) => {
    const text = await res.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      // Not JSON: callers go by the status.
    }
    return { status: res.status, data, lastModified: res.headers.get('last-modified') }
  })
}

/** When a file last changed, without downloading it (null when the server doesn't say). */
export function fetchLastModified(url: string, service: string): Promise<string | null> {
  return request(url, service, { method: 'HEAD' }, TIMEOUT_MS, async (res) =>
    res.ok ? res.headers.get('last-modified') : null
  )
}
