import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiKeyStatus, readApiKey, removeApiKey, saveApiKey } from './apiKey'
import { setEnvironment, SERVICES, type SecretStore } from './environment'

/**
 * Tests with a temporary userData folder, a stand-in for Windows encryption, and a local server
 * standing in for Anthropic's API.
 *
 * @packageDocumentation
 */

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'
/** Stand-in encryption: reversible, but never the plain key. */
const SECRETS: SecretStore = {
  encrypt: (text) => Buffer.from(`enc:${[...text].reverse().join('')}`),
  decrypt: (data) => {
    const text = data.toString()
    if (!text.startsWith('enc:')) throw new Error('Not encrypted here.')
    return [...text.slice(4)].reverse().join('')
  }
}

let server: Server
let dir = ''
let base = ''
let accept = true
let checks = 0

/** Sets the environment, with or without encryption. */
const useEnvironment = (secrets?: SecretStore) =>
  setEnvironment({ ...SERVICES, userData: dir, documents: dir, appData: dir, trash: async () => undefined, userAgent: 'test', anthropicApi: base, ...(secrets && { secrets }) })

beforeAll(async () => {
  server = createServer((req, res) => {
    checks++
    const ok = accept && req.headers['x-api-key'] === KEY
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' }).end(ok ? '{"data":[]}' : '{"type":"error","error":{"type":"authentication_error"}}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  dir = await mkdtemp(join(tmpdir(), 'mtg-dreams-key-'))
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  useEnvironment(SECRETS)
  await removeApiKey()
  accept = true
  checks = 0
})

describe('the player’s API key', () => {
  it('is checked with Anthropic, then saved encrypted', async () => {
    expect(await apiKeyStatus()).toBe('missing')
    await saveApiKey(`  ${KEY}\n`)
    expect(checks).toBe(1)
    expect(await apiKeyStatus()).toBe('saved')
    expect(await readApiKey()).toBe(KEY)
    expect((await readFile(join(dir, 'anthropic-key.bin'))).toString()).not.toContain(KEY)
  })

  it('is not saved when it doesn’t look like a key, or Anthropic rejects it', async () => {
    await expect(saveApiKey('hello')).rejects.toThrow("That doesn't look like an Anthropic API key.")
    expect(checks).toBe(0)
    accept = false
    await expect(saveApiKey(KEY)).rejects.toThrow("Claude didn't accept your API key.")
    expect(await apiKeyStatus()).toBe('missing')
  })

  it('can be removed', async () => {
    await saveApiKey(KEY)
    await removeApiKey()
    expect(await apiKeyStatus()).toBe('missing')
    expect(await readApiKey()).toBeNull()
  })

  it('counts as missing when it can no longer be decrypted', async () => {
    await writeFile(join(dir, 'anthropic-key.bin'), KEY)
    expect(await readApiKey()).toBeNull()
    expect(await apiKeyStatus()).toBe('missing')
  })

  it('is never saved where this PC can’t encrypt it', async () => {
    useEnvironment()
    expect(await apiKeyStatus()).toBe('unavailable')
    await expect(saveApiKey(KEY)).rejects.toThrow("This PC can't store the key securely")
    expect(checks).toBe(0)
  })
})
