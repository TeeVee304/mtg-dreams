import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkApiKey } from './anthropic'
import { env } from './environment'

/**
 * The player's Anthropic API key, which the deckbuilding helper needs. Checked with Anthropic
 * before saving, then stored encrypted for this Windows user (Electron `safeStorage`) in
 * userData; never stored in plain text, never sent to the renderer.
 *
 * @packageDocumentation
 */

/** Encrypted key file in userData. */
const FILE = 'anthropic-key.bin'
/** What an Anthropic API key looks like. */
const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/

/** `missing`: none saved; `saved`: ready; `unavailable`: this PC can't encrypt it. */
export type ApiKeyStatus = 'missing' | 'saved' | 'unavailable'

/** Path of the key file. */
const path = () => join(env().userData, FILE)

/** @returns The saved key; null if none, or if it can no longer be decrypted (e.g. another Windows user). */
export async function readApiKey(): Promise<string | null> {
  const secrets = env().secrets
  if (!secrets) return null
  try {
    return secrets.decrypt(await readFile(path()))
  } catch {
    return null
  }
}

/** @returns Whether a key is saved and usable. */
export async function apiKeyStatus(): Promise<ApiKeyStatus> {
  if (!env().secrets) return 'unavailable'
  return (await readApiKey()) ? 'saved' : 'missing'
}

/**
 * Checks the key with Anthropic and saves it encrypted, replacing any saved key.
 * @throws Error in plain words if it doesn't look like a key, Anthropic rejects it, or it can't be stored.
 */
export async function saveApiKey(raw: string): Promise<void> {
  const key = raw.trim()
  if (!KEY_RE.test(key)) throw new Error("That doesn't look like an Anthropic API key. Keys start with “sk-ant-”.")
  const secrets = env().secrets
  if (!secrets) throw new Error("This PC can't store the key securely, so MTG Dreams won't save it.")
  await checkApiKey(key)
  await mkdir(env().userData, { recursive: true })
  await writeFile(`${path()}.tmp`, secrets.encrypt(key))
  await rename(`${path()}.tmp`, path())
}

/** Deletes the saved key, if any. */
export async function removeApiKey(): Promise<void> {
  await rm(path(), { force: true })
}
