import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { env } from './environment'

// Cache files in userData: Scryfall's card data, Cardmarket's price guide, precon
// decklists. All of them can be downloaded again, so they are read as JSON, written
// whole (to a temporary file, then renamed over the old one), and never fatal.

const pathOf = (name: string) => join(env().userData, name)

/** A cache file's contents, or null when it's missing or unreadable. */
export async function readCacheFile<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(pathOf(name), 'utf8')) as T
  } catch {
    return null
  }
}

/** Replaces a cache file. A failure only means it's downloaded again later. */
export async function writeCacheFile(name: string, data: unknown): Promise<void> {
  const path = pathOf(name)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(`${path}.tmp`, JSON.stringify(data))
    await rename(`${path}.tmp`, path)
  } catch {
    // Lost: downloaded again.
  }
}

/** The same, finished before returning (when the app quits). */
export function writeCacheFileNow(name: string, data: unknown): void {
  const path = pathOf(name)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data))
  } catch {
    // Lost: downloaded again.
  }
}
