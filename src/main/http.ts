import { env } from './environment'

/**
 * HTTP client for card-data services: sends the app User-Agent and enforces a timeout covering
 * the body read, so stalled connections cannot block request queues.
 *
 * @packageDocumentation
 */

/** Default request timeout. */
const TIMEOUT_MS = 30_000

/** Parsed HTTP response. */
export interface JsonResponse {
  status: number
  /** Parsed body; null if not JSON. */
  data: any
  /** `Last-Modified` header. */
  lastModified: string | null
}

/**
 * Sends a request and reads its body under one timeout. HTTP error statuses resolve normally.
 * @param service - Service name for error messages.
 * @throws Error with a user-facing message on network failure or timeout.
 */
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
    return await read(res)
  } catch (error) {
    throw new Error(
      (error as Error).name === 'TimeoutError'
        ? `${service} took too long to answer. Try again in a moment.`
        : `Could not reach ${service} — are you offline?`
    )
  }
}

/**
 * GETs JSON, or POSTs `body` as JSON when given.
 * @param service - Service name for error messages.
 * @throws Error on network failure or timeout.
 */
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
    } catch {}
    return { status: res.status, data, lastModified: res.headers.get('last-modified') }
  })
}

/** @returns `Last-Modified` from a HEAD request; null if absent or non-2xx. */
export function fetchLastModified(url: string, service: string): Promise<string | null> {
  return request(url, service, { method: 'HEAD' }, TIMEOUT_MS, async (res) =>
    res.ok ? res.headers.get('last-modified') : null
  )
}
