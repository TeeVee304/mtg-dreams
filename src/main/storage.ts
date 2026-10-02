import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CONFLICT_ERROR, type AppSettings, type ListFile, type LoadedData, type Theme } from '@shared/api'
import { DEFAULT_SORT, isSortKey } from '@shared/cards'
import { DEFAULT_DROP_ALERT_PERCENT, DEFAULT_PRICE_BASIS, isPriceBasis } from '@shared/pricing'
import { fileNameProblem } from '@shared/filenames'
import { DEFAULT_THEME_COLOR, isThemeColor } from '@shared/themes'
import { TRADE_EXTENSION } from '@shared/trade'
import type { ListKind } from '@shared/types'
import { env } from './environment'

/**
 * File storage. Lists, inventory and trades are plain text files in a user-visible data directory
 * (default `Documents/MTG Dreams`): `decks/*.txt`, `lists/*.txt`, `inventory.txt`, `trades/*.mtgtrade`.
 * Settings are in `userData/settings.json`. Writes are atomic, serialized per file, and guarded
 * against external modification.
 *
 * @packageDocumentation
 */

/** Default data directory name under Documents. */
const APP_FOLDER = 'MTG Dreams'
/** Legacy app folder names, newest first, migrated by {@link migrateFromOldName}. */
const OLD_APP_FOLDERS = ['MTG Dream', 'MTG Wishlist Tracker']
/** userData entries copied from a legacy settings folder. */
const CARRIED_OVER = ['settings.json', 'scryfall-cache.json', 'precons']

/** Raw settings file; values are validated by {@link getAppSettings}. */
interface Settings {
  /** Custom data directory. */
  dataDir?: string
  theme?: Theme
  color?: string
  bundleBasics?: boolean
  cardImages?: boolean
  cardView?: string
  tradeName?: string
  sort?: string
  priceBasis?: string
  dropAlertPercent?: number
}

/** Settings file path. */
const settingsPath = () => join(env().userData, 'settings.json')

/** In-memory settings, keyed by path; only the app writes the file. */
let settingsCache: { path: string; settings: Settings } | null = null

/** @returns Cached settings; `{}` if the file is missing or invalid. */
function readSettings(): Settings {
  const path = settingsPath()
  if (settingsCache?.path === path) return settingsCache.settings
  let settings: Settings = {}
  try {
    if (existsSync(path)) settings = JSON.parse(readFileSync(path, 'utf8')) as Settings
  } catch {}
  settingsCache = { path, settings }
  return settings
}

/**
 * Merges `patch` into the settings and writes atomically (temp + rename; a truncated file would
 * lose a custom data directory). Falls back to a direct write if the target is locked.
 */
function writeSettings(patch: Partial<Settings>): void {
  const settings = { ...readSettings(), ...patch }
  const path = settingsPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2))
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, JSON.stringify(settings, null, 2))
    rmSync(tmp, { force: true })
  }
  settingsCache = { path, settings }
}

/**
 * One-time migration from legacy app names. Without current settings, copies {@link CARRIED_OVER}
 * from the newest legacy userData folder. Without a custom data directory, renames the legacy
 * default data directory, or points settings at it if the rename fails. Errors are ignored.
 */
export function migrateFromOldName(): void {
  try {
    if (!existsSync(settingsPath())) {
      const old = OLD_APP_FOLDERS.map((name) => join(env().appData, name)).find((dir) =>
        existsSync(join(dir, 'settings.json'))
      )
      if (old) {
        mkdirSync(env().userData, { recursive: true })
        for (const item of CARRIED_OVER) {
          if (existsSync(join(old, item))) cpSync(join(old, item), join(env().userData, item), { recursive: true })
        }
        settingsCache = null
      }
    }
    if (readSettings().dataDir) return
    const newDir = join(env().documents, APP_FOLDER)
    const oldDir = OLD_APP_FOLDERS.map((name) => join(env().documents, name)).find((dir) => existsSync(dir))
    if (existsSync(newDir) || !oldDir) return
    try {
      renameSync(oldDir, newDir)
    } catch {
      writeSettings({ dataDir: oldDir })
    }
  } catch {}
}

/** @returns Configured data directory, or the default. */
export function dataDir(): string {
  return readSettings().dataDir ?? join(env().documents, APP_FOLDER)
}

/** Persists a custom data directory. */
export async function setDataDir(dir: string): Promise<void> {
  writeSettings({ dataDir: dir })
}

/** @returns Stored theme; `system` if unset or invalid. */
export function getTheme(): Theme {
  const theme = readSettings().theme
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}

/** @returns Validated settings with defaults applied. */
export function getAppSettings(): AppSettings {
  const settings = readSettings()
  return {
    theme: getTheme(),
    color: isThemeColor(settings.color) ? settings.color : DEFAULT_THEME_COLOR,
    bundleBasics: settings.bundleBasics ?? true,
    cardImages: settings.cardImages ?? true,
    cardView: settings.cardView === 'grid' ? 'grid' : 'table',
    tradeName: settings.tradeName ?? '',
    sort: isSortKey(settings.sort) ? settings.sort : DEFAULT_SORT,
    priceBasis: isPriceBasis(settings.priceBasis) ? settings.priceBasis : DEFAULT_PRICE_BASIS,
    dropAlertPercent:
      Number.isInteger(settings.dropAlertPercent) && settings.dropAlertPercent! >= 1 && settings.dropAlertPercent! <= 90
        ? settings.dropAlertPercent!
        : DEFAULT_DROP_ALERT_PERCENT
  }
}

/** Persists a validated settings patch. */
export function updateAppSettings(patch: Partial<AppSettings>): void {
  writeSettings(patch)
}

/** Directory of a list kind: `decks` or `lists`. */
const listsDir = (kind: ListKind) => join(dataDir(), kind === 'deck' ? 'decks' : 'lists')
/** Inventory file path. */
const inventoryPath = () => join(dataDir(), 'inventory.txt')
/** Trades directory. */
const tradesDir = () => join(dataDir(), 'trades')
/** Trade file path; validates the name. */
const tradePath = (name: string) => join(tradesDir(), `${validateListName(name)}.${TRADE_EXTENSION}`)

/**
 * Validates a list or trade name (used as file name).
 * @returns Trimmed name.
 * @throws Error with a user-facing message if invalid.
 */
export function validateListName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Name must be text.')
  const name = raw.trim()
  const problem = fileNameProblem(name)
  if (problem) throw new Error(problem)
  return name
}

/** @throws Error if `raw` is not a {@link ListKind}. */
export function validateKind(raw: unknown): ListKind {
  if (raw !== 'deck' && raw !== 'wishlist') throw new Error('Invalid list kind.')
  return raw
}

/** List file path; validates the name. */
const listPath = (kind: ListKind, name: string) => join(listsDir(kind), `${validateListName(name)}.txt`)

/** Per-path write chains; writes enqueue synchronously, so they complete in call order. */
const writeChains = new Map<string, Promise<void>>()

/** Last text read or written per path, for external-change detection. */
const known = new Map<string, string>()

/**
 * @returns File text; null if it does not exist.
 * @throws Other read errors.
 */
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Re-keys {@link known} after a rename or move. */
function moveKnown(from: string, to: string): void {
  const text = known.get(from)
  known.delete(from)
  if (text !== undefined) known.set(to, text)
}

/**
 * Writes atomically (temp + rename, direct-write fallback if locked), serialized per path.
 * @param guard - `check`: reject if the file differs from {@link known} (a deleted file is rewritten).
 * @throws Error prefixed with `CONFLICT_ERROR` on external modification.
 */
function writeText(path: string, text: string, guard: 'check' | 'force' | 'none' = 'none'): Promise<void> {
  const previous = writeChains.get(path) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const expected = known.get(path)
      if (guard === 'check' && expected !== undefined) {
        const current = await readIfExists(path)
        if (current !== null && current !== expected) {
          throw new Error(`${CONFLICT_ERROR} "${basename(path)}" was changed by another program.`)
        }
      }
      await mkdir(dirname(path), { recursive: true })
      const tmp = `${path}.tmp`
      await writeFile(tmp, text, 'utf8')
      try {
        await rename(tmp, path)
      } catch {
        await writeFile(path, text, 'utf8')
        await rm(tmp, { force: true })
      }
      known.set(path, text)
    })
  writeChains.set(path, next)
  return next
}

/**
 * Reads all files with `extension` in `dir`, sorted case-insensitively. Unreadable files (locked,
 * offline placeholders) are skipped and appended to `unreadable` as `folder/file`.
 */
async function readFolder(dir: string, extension: string, unreadable: string[]): Promise<ListFile[]> {
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((file) => file.toLowerCase().endsWith(extension))
  const read = await Promise.all(
    files.map(async (file) => {
      try {
        const text = await readFile(join(dir, file), 'utf8')
        known.set(join(dir, file), text)
        return { name: file.slice(0, -extension.length), text }
      } catch {
        unreadable.push(`${basename(dir)}/${file}`)
        return null
      }
    })
  )
  return read
    .filter((file): file is ListFile => file !== null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/**
 * Reads all lists, trades and the inventory, creating list directories if needed.
 * @throws If the inventory exists but is unreadable (never skipped, so a save cannot blank it).
 */
export async function loadData(): Promise<LoadedData> {
  const unreadable: string[] = []
  await Promise.all([mkdir(listsDir('deck'), { recursive: true }), mkdir(listsDir('wishlist'), { recursive: true })])
  const [decks, wishlists, trades] = await Promise.all([
    readFolder(listsDir('deck'), '.txt', unreadable),
    readFolder(listsDir('wishlist'), '.txt', unreadable),
    readFolder(tradesDir(), `.${TRADE_EXTENSION}`, unreadable)
  ])
  const inventory = existsSync(inventoryPath()) ? await readFile(inventoryPath(), 'utf8') : ''
  known.set(inventoryPath(), inventory)
  return { dataDir: dataDir(), decks, wishlists, inventory, trades, unreadable }
}

/** Writes a friend's trade list, unguarded. */
export async function writeTrade(name: string, text: string): Promise<void> {
  await writeText(tradePath(name), text)
}

/** Moves a trade list to the Recycle Bin after pending writes. */
export async function deleteTrade(name: string): Promise<void> {
  const path = tradePath(name)
  await writeChains.get(path)?.catch(() => undefined)
  await env().trash(path)
  known.delete(path)
}

/** @throws Error if a list of that kind and name exists. */
export async function createList(kind: ListKind, name: string, text: string): Promise<void> {
  await mkdir(listsDir(kind), { recursive: true })
  const path = listPath(kind, name)
  if (existsSync(path)) throw new Error(`A ${kind} called "${name.trim()}" already exists.`)
  await writeText(path, text)
}

/** Writes a list, guarded unless `force`. @throws `CONFLICT_ERROR` on external modification. */
export async function writeList(kind: ListKind, name: string, text: string, force = false): Promise<void> {
  await writeText(listPath(kind, name), text, force ? 'force' : 'check')
}

/** Renames a list after pending writes; case-only renames allowed. @throws Error if the target exists. */
export async function renameList(kind: ListKind, from: string, to: string): Promise<void> {
  const source = listPath(kind, from)
  const target = listPath(kind, to)
  const caseOnly = source.toLowerCase() === target.toLowerCase()
  if (!caseOnly && existsSync(target)) throw new Error(`A ${kind} called "${to.trim()}" already exists.`)
  await writeChains.get(source)?.catch(() => undefined)
  await rename(source, target)
  moveKnown(source, target)
}

/** Moves a list to another kind after pending writes. @returns Final name, suffixed ` (n)` if taken. */
export async function moveList(from: ListKind, to: ListKind, name: string): Promise<string> {
  const source = listPath(from, name)
  await mkdir(listsDir(to), { recursive: true })
  const base = validateListName(name)
  let target = base
  for (let n = 2; existsSync(listPath(to, target)); n++) target = `${base} (${n})`
  await writeChains.get(source)?.catch(() => undefined)
  await rename(source, listPath(to, target))
  moveKnown(source, listPath(to, target))
  return target
}

/** Moves a list to the Recycle Bin after pending writes. */
export async function deleteList(kind: ListKind, name: string): Promise<void> {
  const path = listPath(kind, name)
  await writeChains.get(path)?.catch(() => undefined)
  await env().trash(path)
  known.delete(path)
}

/** Writes the inventory, guarded unless `force`. @throws `CONFLICT_ERROR` on external modification. */
export async function writeInventory(text: string, force = false): Promise<void> {
  await writeText(inventoryPath(), text, force ? 'force' : 'check')
}
