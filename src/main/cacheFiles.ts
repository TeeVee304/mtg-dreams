import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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

/** Writes a cache file atomically (temp file + rename). Errors are ignored. */
export async function writeCacheFile(name: string, data: unknown): Promise<void> {
  const path = pathOf(name)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(`${path}.tmp`, JSON.stringify(data))
    await rename(`${path}.tmp`, path)
  } catch {}
}

/** Synchronous, non-atomic {@link writeCacheFile} for use during quit. Errors are ignored. */
export function writeCacheFileNow(name: string, data: unknown): void {
  const path = pathOf(name)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data))
  } catch {}
}
