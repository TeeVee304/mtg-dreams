import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { env } from './environment'

/**
 * JSON cache files under userData (Scryfall data, price guide, precons). All are re-downloadable,
 * so I/O failures are swallowed.
 *
 * @packageDocumentation
 */

/** Absolute path of a cache file. */
const pathOf = (name: string) => join(env().userData, name)

/** Cache writes have stopped: the caches are being cleared and the app restarts. */
let frozen = false

/** Stops every cache write for the rest of the session (see `caches.ts`). */
export function freezeCacheFiles(): void {
  frozen = true
}

/** @returns Whether cache writes have stopped. */
export const cacheFilesFrozen = () => frozen

/**
 * @param name - Path relative to userData.
 * @returns Parsed contents; null if missing or invalid.
 */
export async function readCacheFile<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(pathOf(name), 'utf8')) as T
  } catch {
    return null
  }
}

/** Writes a cache file atomically (temp file + rename). Errors are ignored; nothing is written once frozen. */
export async function writeCacheFile(name: string, data: unknown): Promise<void> {
  const path = pathOf(name)
  if (frozen) return
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(`${path}.tmp`, JSON.stringify(data))
    await rename(`${path}.tmp`, path)
  } catch {}
}

/** Synchronous, non-atomic {@link writeCacheFile} for use during quit. Errors are ignored. */
export function writeCacheFileNow(name: string, data: unknown): void {
  const path = pathOf(name)
  if (frozen) return
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data))
  } catch {}
}

/** Cache files and folders of earlier versions of the app, which nothing reads any more. */
export const RETIRED_CACHES = ['card-library.json', 'deckWizard', 'spellbook', 'bracket-cards.json']

/**
 * @param folder - Path relative to userData.
 * @returns Names of the files and folders in a cache folder; none if it is missing.
 */
export async function cacheEntries(folder: string): Promise<string[]> {
  try {
    return await readdir(pathOf(folder))
  } catch {
    return []
  }
}

/** Deletes cache files and folders, with what they hold. Errors are ignored. */
export async function removeCacheEntries(names: string[]): Promise<void> {
  await Promise.all(names.map((name) => rm(pathOf(name), { recursive: true, force: true }).catch(() => undefined)))
}

/** A cached answer from a service, with when it was fetched. */
interface Cached<T> {
  fetchedAt: number
  data: T
}

/** Cached answers read or written this session, by file name. */
const memory = new Map<string, Cached<unknown>>()

/**
 * Serves a cache file while younger than `ttlMs`, from memory once read; otherwise fetches the
 * data and caches it, serving the stale copy if the fetch fails.
 * @param name - Path relative to userData.
 * @throws The fetch error when nothing is cached.
 */
export async function cachedFetch<T>(name: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const copy = (memory.get(name) as Cached<T> | undefined) ?? (await readCacheFile<Cached<T>>(name))
  if (copy) memory.set(name, copy)
  if (copy && Date.now() - copy.fetchedAt < ttlMs) return copy.data
  try {
    const fresh: Cached<T> = { fetchedAt: Date.now(), data: await fetch() }
    memory.set(name, fresh)
    await writeCacheFile(name, fresh)
    return fresh.data
  } catch (error) {
    if (copy) return copy.data
    throw error
  }
}

/** Forgets the cached answers held in memory, so the next reads come from disk (tests). */
export function clearCacheMemory(): void {
  memory.clear()
}
