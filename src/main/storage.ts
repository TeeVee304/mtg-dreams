import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CONFLICT_ERROR, type AppSettings, type ListFile, type LoadedData, type Theme } from '../shared/api'
import { DEFAULT_SORT, isSortKey } from '../shared/cards'
import { DEFAULT_DROP_ALERT_PERCENT, DEFAULT_PRICE_BASIS, isPriceBasis } from '../shared/pricing'
import { fileNameProblem } from '../shared/filenames'
import { DEFAULT_THEME_COLOR, isThemeColor } from '../shared/themes'
import { TRADE_EXTENSION } from '../shared/trade'
import type { ListKind } from '../shared/types'
import { env } from './environment'

// Decks and wishlists live as plain Goldfish-format .txt files in a
// user-visible folder (default: Documents/MTG Dreams) so they can be edited by
// hand, synced or backed up. App settings live in userData.

const APP_FOLDER = 'MTG Dreams'
/** The app's earlier names, newest first: their settings and data folders are carried over. */
const OLD_APP_FOLDERS = ['MTG Dream', 'MTG Wishlist Tracker']
/** What's worth bringing from an old settings folder: the settings, and caches that save re-downloading. */
const CARRIED_OVER = ['settings.json', 'scryfall-cache.json', 'precons']

interface Settings {
  dataDir?: string
  theme?: Theme
  color?: string
  bundleBasics?: boolean
  tradeName?: string
  sort?: string
  priceBasis?: string
  dropAlertPercent?: number
}

const settingsPath = () => join(env().userData, 'settings.json')

// Settings are read once and kept in memory: only the app writes them.
let settingsCache: { path: string; settings: Settings } | null = null

function readSettings(): Settings {
  const path = settingsPath()
  if (settingsCache?.path === path) return settingsCache.settings
  let settings: Settings = {}
  try {
    if (existsSync(path)) settings = JSON.parse(readFileSync(path, 'utf8')) as Settings
  } catch {
    // Unreadable: use the defaults.
  }
  settingsCache = { path, settings }
  return settings
}

function writeSettings(patch: Partial<Settings>): void {
  const settings = { ...readSettings(), ...patch }
  const path = settingsPath()
  // Written to a temporary file first: a crash mid-write must not leave a truncated
  // file, which would read as defaults and lose a custom data folder.
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2))
  try {
    renameSync(tmp, path)
  } catch {
    // Something (antivirus, a sync client) briefly locks the target.
    writeFileSync(path, JSON.stringify(settings, null, 2))
    rmSync(tmp, { force: true })
  }
  settingsCache = { path, settings }
}

/**
 * The app used to be called "MTG Dream", and before that "MTG Wishlist Tracker".
 * On the first launch under the new name, copies the newest old settings and caches
 * over, and renames the default data folder; if the folder can't be moved (e.g.
 * it's open elsewhere), keeps using it where it is.
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
  } catch {
    // Nothing to migrate.
  }
}

export function dataDir(): string {
  return readSettings().dataDir ?? join(env().documents, APP_FOLDER)
}

export async function setDataDir(dir: string): Promise<void> {
  writeSettings({ dataDir: dir })
}

export function getTheme(): Theme {
  const theme = readSettings().theme
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}

export function getAppSettings(): AppSettings {
  const settings = readSettings()
  return {
    theme: getTheme(),
    color: isThemeColor(settings.color) ? settings.color : DEFAULT_THEME_COLOR,
    bundleBasics: settings.bundleBasics ?? true,
    tradeName: settings.tradeName ?? '',
    sort: isSortKey(settings.sort) ? settings.sort : DEFAULT_SORT,
    priceBasis: isPriceBasis(settings.priceBasis) ? settings.priceBasis : DEFAULT_PRICE_BASIS,
    dropAlertPercent:
      Number.isInteger(settings.dropAlertPercent) && settings.dropAlertPercent! >= 1 && settings.dropAlertPercent! <= 90
        ? settings.dropAlertPercent!
        : DEFAULT_DROP_ALERT_PERCENT
  }
}

export function updateAppSettings(patch: Partial<AppSettings>): void {
  writeSettings(patch)
}

const listsDir = (kind: ListKind) => join(dataDir(), kind === 'deck' ? 'decks' : 'lists')
const inventoryPath = () => join(dataDir(), 'inventory.txt')
const tradesDir = () => join(dataDir(), 'trades')
const tradePath = (name: string) => join(tradesDir(), `${validateListName(name)}.${TRADE_EXTENSION}`)

/** Validates a list name, which doubles as its file name. Returns the trimmed name. */
export function validateListName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Name must be text.')
  const name = raw.trim()
  const problem = fileNameProblem(name)
  if (problem) throw new Error(problem)
  return name
}

export function validateKind(raw: unknown): ListKind {
  if (raw !== 'deck' && raw !== 'wishlist') throw new Error('Invalid list kind.')
  return raw
}

const listPath = (kind: ListKind, name: string) => join(listsDir(kind), `${validateListName(name)}.txt`)

// Serialise writes per file so a slow write can't land after a newer one. A write joins
// its file's queue straight away (before any await), so writes land in the order made.
const writeChains = new Map<string, Promise<void>>()

// What each file held when the app last read or wrote it, by path. A save first checks
// the file still holds that: if another program changed it meanwhile (e.g. OneDrive
// syncing an edit made on another PC), the save is refused rather than overwrite it.
const known = new Map<string, string>()

/** The file's text, or null if there is no such file. */
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Carries what's known about a file over to its new path (rename, move). */
function moveKnown(from: string, to: string): void {
  const text = known.get(from)
  known.delete(from)
  if (text !== undefined) known.set(to, text)
}

/**
 * Replaces a file's text. With `guard`, refuses (CONFLICT_ERROR) if the file changed
 * since the app last read or wrote it; a file deleted meanwhile is simply written again.
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
        // Sync clients (OneDrive, Dropbox) sometimes lock the target briefly.
        await writeFile(path, text, 'utf8')
        await rm(tmp, { force: true })
      }
      known.set(path, text)
    })
  writeChains.set(path, next)
  return next
}

/**
 * Reads every file with this extension in a folder, by name. A file that can't be read
 * (locked by another program, or an offline OneDrive placeholder) is skipped and added
 * to `unreadable`, so one bad file can't stop the rest from loading.
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

export async function loadData(): Promise<LoadedData> {
  const unreadable: string[] = []
  await Promise.all([mkdir(listsDir('deck'), { recursive: true }), mkdir(listsDir('wishlist'), { recursive: true })])
  const [decks, wishlists, trades] = await Promise.all([
    readFolder(listsDir('deck'), '.txt', unreadable),
    readFolder(listsDir('wishlist'), '.txt', unreadable),
    readFolder(tradesDir(), `.${TRADE_EXTENSION}`, unreadable)
  ])
  // The inventory is never skipped: the next save would replace it with an empty one.
  const inventory = existsSync(inventoryPath()) ? await readFile(inventoryPath(), 'utf8') : ''
  known.set(inventoryPath(), inventory)
  return { dataDir: dataDir(), decks, wishlists, inventory, trades, unreadable }
}

export async function writeTrade(name: string, text: string): Promise<void> {
  await writeText(tradePath(name), text)
}

/** Moves a friend's trade list to the Recycle Bin. */
export async function deleteTrade(name: string): Promise<void> {
  const path = tradePath(name)
  await writeChains.get(path)?.catch(() => undefined)
  await env().trash(path)
  known.delete(path)
}

export async function createList(kind: ListKind, name: string, text: string): Promise<void> {
  await mkdir(listsDir(kind), { recursive: true })
  const path = listPath(kind, name)
  if (existsSync(path)) throw new Error(`A ${kind} called "${name.trim()}" already exists.`)
  await writeText(path, text)
}

/** Saves a list's text; with `force`, even if it changed outside the app since. */
export async function writeList(kind: ListKind, name: string, text: string, force = false): Promise<void> {
  await writeText(listPath(kind, name), text, force ? 'force' : 'check')
}

export async function renameList(kind: ListKind, from: string, to: string): Promise<void> {
  const source = listPath(kind, from)
  const target = listPath(kind, to)
  const caseOnly = source.toLowerCase() === target.toLowerCase()
  if (!caseOnly && existsSync(target)) throw new Error(`A ${kind} called "${to.trim()}" already exists.`)
  await writeChains.get(source)?.catch(() => undefined)
  await rename(source, target)
  moveKnown(source, target)
}

/** Moves a list to the other section (e.g. a completed wishlist becomes a deck). Returns its final name. */
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

/** Moves the file to the Recycle Bin rather than deleting it permanently. */
export async function deleteList(kind: ListKind, name: string): Promise<void> {
  const path = listPath(kind, name)
  await writeChains.get(path)?.catch(() => undefined)
  await env().trash(path)
  known.delete(path)
}

/** Saves the inventory; with `force`, even if it changed outside the app since. */
export async function writeInventory(text: string, force = false): Promise<void> {
  await writeText(inventoryPath(), text, force ? 'force' : 'check')
}
