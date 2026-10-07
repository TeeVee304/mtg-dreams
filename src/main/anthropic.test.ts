import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CancelledError, checkApiKey, createMessage, type MessageRequest } from './anthropic'
import { setEnvironment, SERVICES } from './environment'

/**
 * Tests against a local server standing in for Anthropic's API.
 *
 * @packageDocumentation
 */

/** A scripted reply; `hang` never answers. */
type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | { hang: true }

let server: Server
let replies: Reply[] = []
let received: Array<{ url: string; headers: IncomingHttpHeaders; body: any }> = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => {
      received.push({ url: req.url ?? '', headers: req.headers, body: data ? JSON.parse(data) : null })
      const reply = replies.shift() ?? { status: 500 }
      if ('hang' in reply) return
      res.writeHead(reply.status, { 'Content-Type': 'application/json', ...reply.headers }).end(JSON.stringify(reply.body ?? {}))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  setEnvironment({ ...SERVICES, userData: '', documents: '', appData: '', trash: async () => undefined, userAgent: 'MTGDreams/test', anthropicApi: base })
})

afterAll(() => {
  server.closeAllConnections()
  server.close()
})

beforeEach(() => {
  replies = []
  received = []
})

const REQUEST: MessageRequest = { model: 'claude-sonnet-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] }
const OK = { id: 'msg_1', content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 2 } }
const error = (type: string, message: string) => ({ type: 'error', error: { type, message } })

describe('sending a message', () => {
  it('sends the player’s key and the API version, and returns the reply', async () => {
    replies = [{ status: 200, body: OK }]
    expect(await createMessage('sk-ant-test', REQUEST)).toEqual(OK)
    expect(received[0]).toMatchObject({
      url: '/v1/messages',
      headers: { 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01', 'user-agent': 'MTGDreams/test' },
      body: REQUEST
    })
  })

  it('waits and tries again while Claude is busy', async () => {
    replies = [{ status: 429, body: error('rate_limit_error', 'slow down') }, { status: 529, body: error('overloaded_error', 'busy') }, { status: 200, body: OK }]
    expect(await createMessage('sk-ant-test', REQUEST, { retryDelayMs: 1 })).toEqual(OK)
    expect(received).toHaveLength(3)
  })

  it('gives up after a few tries, in plain words', async () => {
    replies = [{ status: 529 }, { status: 529 }]
    await expect(createMessage('sk-ant-test', REQUEST, { retries: 1, retryDelayMs: 1 })).rejects.toThrow('Claude is overloaded right now.')
    expect(received).toHaveLength(2)
  })

  it('explains a rejected key or an empty account at once, without retrying', async () => {
    replies = [{ status: 401, body: error('authentication_error', 'invalid x-api-key') }]
    await expect(createMessage('sk-ant-bad', REQUEST)).rejects.toThrow("Claude didn't accept your API key.")
    replies = [{ status: 400, body: error('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.') }]
    await expect(createMessage('sk-ant-test', REQUEST)).rejects.toThrow('Your Anthropic account is out of credit.')
    replies = [{ status: 400, body: error('invalid_request_error', 'messages: field required') }]
    await expect(createMessage('sk-ant-test', REQUEST)).rejects.toThrow("Claude couldn't handle the request: messages: field required")
    expect(received).toHaveLength(3)
  })

  it('stops when cancelled, even while waiting for an answer or to retry', async () => {
    replies = [{ hang: true }]
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await expect(createMessage('sk-ant-test', REQUEST, { signal: controller.signal })).rejects.toBeInstanceOf(CancelledError)
    replies = [{ status: 529 }]
    const retrying = new AbortController()
    setTimeout(() => retrying.abort(), 50)
    await expect(createMessage('sk-ant-test', REQUEST, { signal: retrying.signal, retryDelayMs: 10_000 })).rejects.toBeInstanceOf(CancelledError)
  })

  it('gives up on a reply that never comes, and explains an unreachable service', async () => {
    replies = [{ hang: true }]
    await expect(createMessage('sk-ant-test', REQUEST, { timeoutMs: 100 })).rejects.toThrow('Claude took too long to answer.')
    setEnvironment({ ...SERVICES, userData: '', documents: '', appData: '', trash: async () => undefined, userAgent: 'x', anthropicApi: 'http://127.0.0.1:1' })
    await expect(createMessage('sk-ant-test', REQUEST)).rejects.toThrow('Could not reach Claude — are you offline?')
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    setEnvironment({ ...SERVICES, userData: '', documents: '', appData: '', trash: async () => undefined, userAgent: 'MTGDreams/test', anthropicApi: base })
  })
})

describe('checking a key', () => {
  it('lists one model, which costs nothing', async () => {
    replies = [{ status: 200, body: { data: [] } }, { status: 401, body: error('authentication_error', 'invalid x-api-key') }]
    await checkApiKey('sk-ant-good')
    expect(received[0]).toMatchObject({ url: '/v1/models?limit=1', headers: { 'x-api-key': 'sk-ant-good' } })
    await expect(checkApiKey('sk-ant-bad')).rejects.toThrow("Claude didn't accept your API key.")
  })
})
