import { env } from './environment'

/**
 * Minimal client for Anthropic's Messages API, for the deckbuilding helper: sends the player's
 * own API key, retries when Claude is busy, and turns failures into plain words. Cancelling
 * rejects with {@link CancelledError}.
 *
 * @packageDocumentation
 */

/** API version header. */
const API_VERSION = '2023-06-01'
/** How long one reply may take: long tool calls carry a whole deck. */
const TIMEOUT_MS = 5 * 60_000
/** Retries after a rate limit, overload or server error. */
const RETRIES = 3
/** First retry delay; doubled for each retry unless the API says how long to wait. */
const RETRY_DELAY_MS = 2000
/** Longest wait the API's `retry-after` may ask for. */
const MAX_RETRY_AFTER_MS = 60_000
/** Statuses worth retrying: rate limit, server errors, overloaded. */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 529])

/** Prompt caching marker. */
export interface CacheControl {
  type: 'ephemeral'
}

/** A block of message content. */
export type ContentBlock =
  | { type: 'text'; text: string; cache_control?: CacheControl }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean; cache_control?: CacheControl }

/** One turn of the conversation. */
export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** A tool Claude may call. */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** Messages API request. */
export interface MessageRequest {
  model: string
  max_tokens: number
  system?: Array<{ type: 'text'; text: string; cache_control?: CacheControl }>
  tools?: ToolDefinition[]
  messages: Message[]
}

/** Tokens used by one request. */
export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Messages API response. */
export interface MessageResponse {
  id: string
  content: ContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'refusal' | 'pause_turn' | null
  usage: Usage
}

/** Request options. */
export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

/** The player stopped the request. */
export class CancelledError extends Error {
  constructor() {
    super('Stopped.')
    this.name = 'CancelledError'
  }
}

/** Headers for the player's key. */
const headers = (apiKey: string) => ({
  'x-api-key': apiKey,
  'anthropic-version': API_VERSION,
  'content-type': 'application/json',
  'User-Agent': env().userAgent
})

/** @returns The API's error message in plain words for the player. */
function errorMessage(status: number, body: any): string {
  const type: string = body?.error?.type ?? ''
  const detail: string = body?.error?.message ?? ''
  if (status === 401 || type === 'authentication_error') return "Claude didn't accept your API key. Check it, or create a new one at console.anthropic.com."
  if (status === 403 || type === 'permission_error') return `Your API key isn't allowed to do this${detail ? `: ${detail}` : '.'}`
  if (/credit balance/i.test(detail)) return 'Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.'
  if (status === 429) return 'Claude is getting too many requests from your account right now. Wait a minute and try again.'
  if (status === 529 || status >= 500) return 'Claude is overloaded right now. Try again in a few minutes.'
  if (status === 413) return 'The request was too large for Claude.'
  return `Claude couldn't handle the request${detail ? `: ${detail}` : ` (HTTP ${status}).`}`
}

/** Waits, or rejects when cancelled. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError())
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop)
      resolve()
    }, ms)
    const stop = () => {
      clearTimeout(timer)
      reject(new CancelledError())
    }
    signal?.addEventListener('abort', stop, { once: true })
  })
}

/** Sends one request; network failures become plain-words errors, cancelling a {@link CancelledError}. */
async function send(url: string, init: RequestInit, options: RequestOptions): Promise<{ status: number; body: any; retryAfter: string | null }> {
  if (options.signal?.aborted) throw new CancelledError()
  const timeout = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout })
    const text = await res.text()
    let body: any = null
    try {
      body = JSON.parse(text)
    } catch {}
    return { status: res.status, body, retryAfter: res.headers.get('retry-after') }
  } catch (error) {
    if (options.signal?.aborted) throw new CancelledError()
    throw new Error(
      (error as Error).name === 'TimeoutError' ? 'Claude took too long to answer. Try again.' : 'Could not reach Claude — are you offline?'
    )
  }
}

/**
 * Sends a Messages API request with the player's key, retrying while Claude is busy.
 * @throws Error in plain words on failure; {@link CancelledError} when cancelled.
 */
export async function createMessage(apiKey: string, request: MessageRequest, options: RequestOptions = {}): Promise<MessageResponse> {
  const retries = options.retries ?? RETRIES
  for (let attempt = 0; ; attempt++) {
    const { status, body, retryAfter } = await send(
      `${env().anthropicApi}/v1/messages`,
      { method: 'POST', headers: headers(apiKey), body: JSON.stringify(request) },
      options
    )
    if (status === 200 && Array.isArray(body?.content)) return body as MessageResponse
    if (!RETRY_STATUSES.has(status) || attempt >= retries) throw new Error(errorMessage(status, body))
    const asked = Number(retryAfter) * 1000
    const delay = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_RETRY_AFTER_MS) : (options.retryDelayMs ?? RETRY_DELAY_MS) * 2 ** attempt
    await wait(delay, options.signal)
  }
}

/**
 * Checks a key with a request that costs nothing: listing one model.
 * @throws Error in plain words if Claude rejects the key or can't be reached.
 */
export async function checkApiKey(apiKey: string, options: RequestOptions = {}): Promise<void> {
  const { status, body } = await send(`${env().anthropicApi}/v1/models?limit=1`, { method: 'GET', headers: headers(apiKey) }, options)
  if (status !== 200) throw new Error(errorMessage(status, body))
}
