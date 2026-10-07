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

/** Silence allowed between chunks of a streamed download. */
const IDLE_TIMEOUT_MS = 60_000

/**
 * Streams a large text file line by line, gunzipping `.gz` files, without holding it in memory.
 * The timeout covers silence between chunks rather than the whole download. Stopping early
 * cancels the download.
 * @param service - Service name for error messages.
 * @param onBytes - Called with the (compressed) bytes received so far.
 * @throws Error with a user-facing message on network failure, HTTP error, a stalled or damaged download.
 */
export async function* fetchLines(
  url: string,
  service: string,
  onBytes?: (received: number) => void,
  idleTimeoutMs = IDLE_TIMEOUT_MS
): AsyncGenerator<string> {
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), idleTimeoutMs)
  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), idleTimeoutMs)
  }
  let received = 0
  try {
    const res = await fetch(url, { headers: { 'User-Agent': env().userAgent }, signal: controller.signal })
    if (!res.ok || !res.body) throw new HttpError(`${service} responded with HTTP ${res.status}.`)
    // A transfer encoding is undone by fetch already; a .gz file is not.
    const gzipped =
      !res.headers.get('content-encoding') &&
      (new URL(url).pathname.endsWith('.gz') || (res.headers.get('content-type') ?? '').includes('gzip'))
    let bytes: ReadableStream<Uint8Array> = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, out) {
          received += chunk.byteLength
          touch()
          onBytes?.(received)
          out.enqueue(chunk)
        }
      })
    )
    if (gzipped) bytes = bytes.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)
    let rest = ''
    for await (const text of bytes.pipeThrough(new TextDecoderStream())) {
      const lines = (rest + text).split(/\r?\n/)
      rest = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) yield line
    }
    if (rest.trim()) yield rest.replace(/\r$/, '')
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (controller.signal.aborted) throw new Error(`${service} stopped sending data. Try again in a moment.`)
    throw new Error(received > 0 ? `The download from ${service} broke off. Try again in a moment.` : `Could not reach ${service} — are you offline?`)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** HTTP error status, reported as is. */
class HttpError extends Error {}

/** @returns `Last-Modified` from a HEAD request; null if absent or non-2xx. */
export function fetchLastModified(url: string, service: string): Promise<string | null> {
  return request(url, service, { method: 'HEAD' }, TIMEOUT_MS, async (res) =>
    res.ok ? res.headers.get('last-modified') : null
  )
}
