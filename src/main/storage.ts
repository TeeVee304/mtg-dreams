import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CONFLICT_ERROR, type AppSettings, type ListFile, type LoadedData, type Theme } from '@shared/api'
import { fileNameProblem } from '@shared/filenames'
import { joinMeta, sameMeta, splitMeta, validMeta, type ListMeta } from '@shared/listMeta'
import { validSettings } from '@shared/settings'
import { TRADE_EXTENSION } from '@shared/trade'
import { ui } from '@shared/text'
import type { ListKind } from '@shared/types'
import { env } from './environment'
import { DATA_STEPS, DATA_VERSION, SETTINGS_STEPS, SETTINGS_VERSION, pendingSteps, readVersion } from './schema'

/**
 * File storage. Lists, inventory and trades are plain text files in a user-visible data directory
 * (default `Documents/MTG Dreams`): `decks/*.txt`, `lists/*.txt` (wishlists), `brews/*.txt`,
 * `inventory.txt`, `trades/*.mtgtrade`, and `lists.json`: the wishlist order and each list's personal
 * settings (see {@link splitMeta}), kept out of the list files. Settings are in `userData/settings.json`. Writes are atomic, serialized per file, and guarded
 * against external modification. `lists.json` and `settings.json` carry a schema version (see `./schema`):
 * older ones are upgraded on load, and a data folder saved by a newer app is read-only.
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
interface Settings extends Partial<Record<keyof AppSettings, unknown>> {
  /** Custom data directory. */
  dataDir?: string
  /** Settings schema version; see `./schema`. */
  schemaVersion?: unknown
}

/** Settings file path. */
const settingsPath = () => join(env().userData, 'settings.json')

/** Settings the app no longer has, dropped from the file on the next write. */
const RETIRED_SETTINGS = ['copies', 'inventorySortReverse']

/** In-memory settings, keyed by path; only the app writes the file. */
let settingsCache: { path: string; settings: Settings } | null = null

/** @returns The settings in `path`; null if it is missing or damaged. */
function readSettingsFile(path: string): Settings | null {
  try {
    const settings: unknown = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
    return typeof settings === 'object' && settings !== null && !Array.isArray(settings) ? (settings as Settings) : null
  } catch {
    return null
  }
}

/**
 * @returns Cached settings, from the file or, if it is damaged, from its backup (so a custom data
 * folder survives), upgraded to the latest version; `{}` if neither can be read.
 */
function readSettings(): Settings {
  const path = settingsPath()
  if (settingsCache?.path === path) return settingsCache.settings
  const settings = readSettingsFile(path) ?? readSettingsFile(`${path}.bak`) ?? {}
  for (const { step } of pendingSteps(readVersion(settings.schemaVersion), SETTINGS_STEPS)) step(settings as Record<string, unknown>)
  settingsCache = { path, settings }
  return settings
}

/**
 * Merges `patch` into the settings and writes atomically (temp + rename; a truncated file would
 * lose a custom data directory). Falls back to a direct write if the target is locked. A backup
 * beside it is what {@link readSettings} falls back on if the file is ever damaged. Stamps the
 * latest version, or keeps a newer one, whose settings this app keeps without reading.
 */
function writeSettings(patch: Partial<Settings>): void {
  const current = readSettings()
  const schemaVersion = Math.max(readVersion(current.schemaVersion), SETTINGS_VERSION)
  const settings: Settings = { ...current, ...patch, schemaVersion }
  for (const key of RETIRED_SETTINGS) delete (settings as Record<string, unknown>)[key]
  const path = settingsPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2))
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, JSON.stringify(settings, null, 2))
    rmSync(tmp, { force: true })
  }
  try {
    writeFileSync(`${path}.bak`, JSON.stringify(settings, null, 2))
  } catch {}
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

/** @returns Validated settings with defaults applied. */
export function getAppSettings(): AppSettings {
  return validSettings(readSettings())
}

/** @returns Stored theme; `system` if unset or invalid. */
export const getTheme = (): Theme => getAppSettings().theme

/** Persists a validated settings patch. */
export function updateAppSettings(patch: Partial<AppSettings>): void {
  writeSettings(patch)
}

/** Folder of each list kind. */
const LIST_FOLDERS: Record<ListKind, string> = { deck: 'decks', wishlist: 'lists', brew: 'brews' }
/** List kinds. */
const LIST_KINDS = Object.keys(LIST_FOLDERS) as ListKind[]
/** Directory of a list kind: `decks`, `lists` or `brews`. */
const listsDir = (kind: ListKind) => join(dataDir(), LIST_FOLDERS[kind])
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
  if (typeof raw !== 'string') throw new Error(ui.errors.notText)
  const name = raw.trim()
  const problem = fileNameProblem(name)
  if (problem) throw new Error(problem)
  return name
}

/** @throws Error if `raw` is not a {@link ListKind}. */
export function validateKind(raw: unknown): ListKind {
  if (!LIST_KINDS.includes(raw as ListKind)) throw new Error(ui.errors.invalid('list kind'))
  return raw as ListKind
}

/** List file path; validates the name. */
const listPath = (kind: ListKind, name: string) => join(listsDir(kind), `${validateListName(name)}.txt`)

/** Per-path write chains; writes enqueue synchronously, so they complete in call order. */
const writeChains = new Map<string, Promise<void>>()

/** Last text read or written per path, for external-change detection. */
const known = new Map<string, string>()

/** Whether the data folder was saved by a newer app, set by {@link loadData}: nothing in it is changed. */
let readOnly = false

/** @throws Error if the data folder is {@link readOnly}. */
function assertWritable(): void {
  if (readOnly) throw new Error(ui.errors.newerData)
}

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

/** Waits before each new try at renaming over a locked file (a sync client or antivirus holds it briefly). */
const RENAME_RETRY_MS = [50, 150, 400]

/**
 * Moves `tmp` over `path`, trying again while the target is locked. If it stays locked, copies the
 * old file to `<path>.bak` first and then writes over it directly, so a crash mid-write still leaves
 * the old text. Removes `tmp` either way.
 * @throws If the backup or the direct write fails; the file is then left as it was.
 */
async function replaceFile(tmp: string, path: string, text: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path)
      return
    } catch {
      if (attempt === RENAME_RETRY_MS.length) break
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS[attempt]))
    }
  }
  try {
    if (existsSync(path)) await copyFile(path, `${path}.bak`)
    await writeFile(path, text, 'utf8')
  } finally {
    await rm(tmp, { force: true })
  }
}

/**
 * Writes atomically (temp + rename, retried; a backed-up direct write if still locked), serialized per path.
 * @param guard - `check`: reject if the file differs from {@link known} (a deleted file is rewritten).
 * @throws Error prefixed with `CONFLICT_ERROR` on external modification; Error if {@link readOnly}.
 */
function writeText(path: string, text: string, guard: 'check' | 'force' | 'none' = 'none'): Promise<void> {
  if (readOnly) return Promise.reject(new Error(ui.errors.newerData))
  const previous = writeChains.get(path) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const expected = known.get(path)
      if (guard === 'check' && expected !== undefined) {
        const current = await readIfExists(path)
        if (current !== null && current !== expected) {
          throw new Error(`${CONFLICT_ERROR} ${ui.errors.changedOutside(basename(path))}`)
        }
      }
      await mkdir(dirname(path), { recursive: true })
      const tmp = `${path}.tmp`
      await writeFile(tmp, text, 'utf8')
      await replaceFile(tmp, path, text)
      known.set(path, text)
    })
  writeChains.set(path, next)
  return next
}

/** Last read of each data file: its text, with the size and change time the file had then. */
const reads = new Map<string, { size: number; mtimeMs: number; text: string }>()

/**
 * Reads a data file, reusing the last read while its size and change time are unchanged, so a reload
 * (on every window focus) reads only the files that changed.
 */
async function readText(path: string): Promise<string> {
  const { size, mtimeMs } = await stat(path)
  const last = reads.get(path)
  if (last && last.size === size && last.mtimeMs === mtimeMs) return last.text
  const text = await readFile(path, 'utf8')
  reads.set(path, { size, mtimeMs, text })
  return text
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
        const text = await readText(join(dir, file))
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

/** `lists.json`, as the app keeps it. */
interface ListsIndex {
  /** Data folder schema version; null if `lists.json` has none (missing, or from before versions). */
  schemaVersion: number | null
  /** Wishlist names, top first; null until known (no `lists.json` nor legacy order file yet). */
  wishlistOrder: string[] | null
  /** Personal settings by {@link metaKey}; lists without any have no entry. */
  lists: Record<string, ListMeta>
}

/** `lists.json` path. */
const indexPath = () => join(dataDir(), 'lists.json')
/** Wishlist order file from before `lists.json`, beside the wishlists. */
const legacyOrderPath = () => join(listsDir('wishlist'), 'order.json')
/** Key of a list in {@link ListsIndex.lists}. */
const metaKey = (kind: ListKind, name: string) => `${kind}/${name}`

/** `lists.json` of the data directory it was read from; read again by {@link loadData}. */
let indexCache: { dir: string; index: ListsIndex } | null = null

/**
 * Text the app last had for each list file (by path), with the file text it was split into: given back
 * as is while the file and its settings are unchanged, so reloading never reorders its headers.
 */
const appTexts = new Map<string, { file: string; text: string }>()

/** @returns `lists.json` from disk, else the legacy order file's order; empty if neither is readable. */
async function readIndex(): Promise<ListsIndex> {
  const parse = (raw: string | null): unknown => {
    try {
      return raw === null ? null : JSON.parse(raw)
    } catch {
      return null
    }
  }
  const names = (raw: unknown) => (Array.isArray(raw) ? raw.filter((name): name is string => typeof name === 'string') : null)
  const stored = parse(await readIfExists(indexPath()))
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const { schemaVersion, wishlistOrder, lists: rawLists } = stored as { schemaVersion?: unknown; wishlistOrder?: unknown; lists?: unknown }
    const lists: Record<string, ListMeta> = {}
    if (rawLists && typeof rawLists === 'object') {
      for (const [key, raw] of Object.entries(rawLists)) {
        const meta = validMeta(raw)
        if (Object.keys(meta).length > 0) lists[key] = meta
      }
    }
    return {
      schemaVersion: schemaVersion === undefined ? null : readVersion(schemaVersion),
      wishlistOrder: names(wishlistOrder) ?? names(parse(await readIfExists(legacyOrderPath()))),
      lists
    }
  }
  return { schemaVersion: null, wishlistOrder: names(parse(await readIfExists(legacyOrderPath()))), lists: {} }
}

/** @returns The data directory's `lists.json`, read once. */
async function listsIndex(): Promise<ListsIndex> {
  if (indexCache?.dir !== dataDir()) indexCache = { dir: dataDir(), index: await readIndex() }
  return indexCache.index
}

/**
 * Saves `lists.json` (without an order while none is known), then removes the legacy order file it
 * replaces. An index without a version gets the latest: this app wrote it.
 */
async function saveIndex(index: ListsIndex): Promise<void> {
  const lists = Object.fromEntries(Object.entries(index.lists).sort(([a], [b]) => a.localeCompare(b)))
  const order = index.wishlistOrder ? { wishlistOrder: index.wishlistOrder } : {}
  const schemaVersion = index.schemaVersion ?? DATA_VERSION
  await writeText(indexPath(), `${JSON.stringify({ schemaVersion, ...order, lists }, null, 2)}\n`)
  if (index.wishlistOrder) await rm(legacyOrderPath(), { force: true })
}

/** Sets a list's personal settings in `index`. @returns Whether they changed. */
function setMeta(index: ListsIndex, key: string, meta: ListMeta): boolean {
  if (sameMeta(index.lists[key] ?? {}, meta)) return false
  if (Object.keys(meta).length > 0) index.lists[key] = meta
  else delete index.lists[key]
  return true
}

/**
 * Writes a list's file without its personal settings, which go to `lists.json`.
 * @param text - The list as the app has it, personal headers included.
 */
async function writeListText(kind: ListKind, name: string, text: string, guard: 'check' | 'force' | 'none'): Promise<void> {
  const path = listPath(kind, name)
  const split = splitMeta(text)
  await writeText(path, split.text, guard)
  appTexts.set(path, { file: split.text, text })
  const index = await listsIndex()
  if (setMeta(index, metaKey(kind, validateListName(name)), split.meta)) await saveIndex(index)
}

/** Priority header of wishlists from before they had an order, e.g. `// Priority: High`. */
const LEGACY_PRIORITY = /^\/\/\s*priority\s*:\s*(\w*)\s*$/i

/**
 * @returns A first wishlist order from the priority headers wishlists had before (High, then Normal,
 * then Low, by name within each), removing the headers and updating `wishlists`. Errors while
 * migrating are ignored.
 */
async function orderFromPriorities(wishlists: ListFile[]): Promise<string[]> {
  const rank = (file: ListFile) => {
    const header = file.text.split('\n').map((line) => LEGACY_PRIORITY.exec(line.trim())).find(Boolean)
    const priority = header?.[1].toLowerCase()
    return priority === 'high' ? 0 : priority === 'low' ? 2 : 1
  }
  const order = [...wishlists]
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((file) => file.name)
  try {
    for (const file of wishlists) {
      const lines = file.text.split('\n')
      const kept = lines.filter((line) => !LEGACY_PRIORITY.test(line.trim()))
      if (kept.length === lines.length) continue
      file.text = kept.join('\n')
      await writeText(listPath('wishlist', file.name), file.text, 'check')
    }
  } catch {}
  return order
}

/**
 * Runs the data folder steps from `index`'s version to the latest, saving the version after each, so
 * a failed step runs again on the next load.
 * @returns The index after the steps.
 * @throws A step's error.
 */
async function upgradeData(index: ListsIndex): Promise<ListsIndex> {
  for (const { step, to } of pendingSteps(index.schemaVersion ?? 1, DATA_STEPS)) {
    await step(dataDir())
    indexCache = null
    index = await listsIndex()
    index.schemaVersion = to
    await saveIndex(index)
  }
  return index
}

/** Saves the wishlist order, top first. */
export async function writeWishlistOrder(names: string[]): Promise<void> {
  const index = await listsIndex()
  index.wishlistOrder = names
  await saveIndex(index)
}

/**
 * Reads all lists, trades and the inventory, creating list directories if needed, after upgrading an
 * older data folder. Each list comes with its personal settings from `lists.json` as headers; personal
 * headers found in a file (an old file, or one edited elsewhere) move to `lists.json`, overriding
 * what it had. A data folder saved by a newer app is read as it is, and becomes read-only.
 * @throws If the inventory exists but is unreadable (never skipped, so a save cannot blank it), or an
 * upgrade step fails.
 */
export async function loadData(): Promise<LoadedData> {
  const unreadable: string[] = []
  indexCache = null
  let index = await listsIndex()
  readOnly = (index.schemaVersion ?? 1) > DATA_VERSION
  if (!readOnly) index = await upgradeData(index)
  await Promise.all(LIST_KINDS.map((kind) => mkdir(listsDir(kind), { recursive: true })))
  const [folders, trades] = await Promise.all([
    Promise.all(LIST_KINDS.map((kind) => readFolder(listsDir(kind), '.txt', unreadable))),
    readFolder(tradesDir(), `.${TRADE_EXTENSION}`, unreadable)
  ])
  const files = Object.fromEntries(LIST_KINDS.map((kind, i) => [kind, folders[i]])) as Record<ListKind, ListFile[]>
  const inventory = existsSync(inventoryPath()) ? await readText(inventoryPath()) : ''
  known.set(inventoryPath(), inventory)

  // A `lists.json` from before versions gets one; a folder with lists gets a `lists.json`.
  let changed = existsSync(indexPath()) ? index.schemaVersion === null : LIST_KINDS.some((kind) => files[kind].length > 0)
  if (index.wishlistOrder === null) index.wishlistOrder = await orderFromPriorities(files.wishlist)
  const present = new Set<string>()
  for (const kind of LIST_KINDS) {
    for (const file of files[kind]) {
      const key = metaKey(kind, file.name)
      const path = listPath(kind, file.name)
      present.add(key)
      const split = splitMeta(file.text)
      let meta = index.lists[key] ?? {}
      if (Object.keys(split.meta).length > 0) {
        meta = { ...meta, ...split.meta }
        try {
          await writeText(path, split.text, 'check')
          changed = setMeta(index, key, meta) || changed
        } catch {}
      }
      const cached = appTexts.get(path)
      const same = cached !== undefined && cached.file === split.text && sameMeta(splitMeta(cached.text).meta, meta)
      file.text = same ? cached.text : joinMeta(split.text, meta)
    }
  }
  // Settings of lists gone from their folder go too, unless a file there could not be read.
  for (const key of Object.keys(index.lists)) {
    const kind = key.slice(0, key.indexOf('/')) as ListKind
    const skipped = unreadable.some((path) => path.startsWith(`${LIST_FOLDERS[kind]}/`))
    if (!present.has(key) && !skipped) {
      delete index.lists[key]
      changed = true
    }
  }
  if (changed) await saveIndex(index).catch(() => undefined)
  return {
    dataDir: dataDir(),
    decks: files.deck,
    wishlists: files.wishlist,
    brews: files.brew,
    inventory,
    trades,
    wishlistOrder: index.wishlistOrder,
    unreadable,
    readOnly
  }
}

/** Writes a friend's trade list, unguarded. */
export async function writeTrade(name: string, text: string): Promise<void> {
  await writeText(tradePath(name), text)
}

/** Moves a trade list to the Recycle Bin after pending writes. */
export async function deleteTrade(name: string): Promise<void> {
  assertWritable()
  const path = tradePath(name)
  await writeChains.get(path)?.catch(() => undefined)
  await env().trash(path)
  known.delete(path)
}

/** @throws Error if a list of that kind and name exists. */
export async function createList(kind: ListKind, name: string, text: string): Promise<void> {
  assertWritable()
  await mkdir(listsDir(kind), { recursive: true })
  const path = listPath(kind, name)
  if (existsSync(path)) throw new Error(ui.errors.listExists(ui.terms.kinds[kind], name.trim()))
  await writeListText(kind, name, text, 'none')
}

/** Writes a list, guarded unless `force`. @throws `CONFLICT_ERROR` on external modification. */
export async function writeList(kind: ListKind, name: string, text: string, force = false): Promise<void> {
  await writeListText(kind, name, text, force ? 'force' : 'check')
}

/** Renames a list after pending writes; case-only renames allowed. @throws Error if the target exists. */
export async function renameList(kind: ListKind, from: string, to: string): Promise<void> {
  assertWritable()
  const source = listPath(kind, from)
  const target = listPath(kind, to)
  const caseOnly = source.toLowerCase() === target.toLowerCase()
  if (!caseOnly && existsSync(target)) throw new Error(ui.errors.listExists(ui.terms.kinds[kind], to.trim()))
  await writeChains.get(source)?.catch(() => undefined)
  await rename(source, target)
  moveKnown(source, target)
  await moveMeta(kind, from, kind, validateListName(to), source, target)
}

/** Moves a list's personal settings, and the app's text of it, to its new name or kind. */
async function moveMeta(fromKind: ListKind, from: string, toKind: ListKind, to: string, source: string, target: string): Promise<void> {
  const text = appTexts.get(source)
  appTexts.delete(source)
  if (text) appTexts.set(target, text)
  const index = await listsIndex()
  const key = metaKey(fromKind, validateListName(from))
  const meta = index.lists[key]
  if (!meta) return
  delete index.lists[key]
  index.lists[metaKey(toKind, to)] = meta
  await saveIndex(index)
}

/** Moves a list to another kind after pending writes. @returns Final name, suffixed ` (n)` if taken. */
export async function moveList(from: ListKind, to: ListKind, name: string): Promise<string> {
  assertWritable()
  const source = listPath(from, name)
  await mkdir(listsDir(to), { recursive: true })
  const base = validateListName(name)
  let target = base
  for (let n = 2; existsSync(listPath(to, target)); n++) target = `${base} (${n})`
  await writeChains.get(source)?.catch(() => undefined)
  await rename(source, listPath(to, target))
  moveKnown(source, listPath(to, target))
  await moveMeta(from, name, to, target, source, listPath(to, target))
  return target
}

/** Moves a list to the Recycle Bin after pending writes. */
export async function deleteList(kind: ListKind, name: string): Promise<void> {
  assertWritable()
  const path = listPath(kind, name)
  await writeChains.get(path)?.catch(() => undefined)
  await env().trash(path)
  known.delete(path)
  appTexts.delete(path)
  const index = await listsIndex()
  if (setMeta(index, metaKey(kind, validateListName(name)), {})) await saveIndex(index)
}

/** Writes the inventory, guarded unless `force`. @throws `CONFLICT_ERROR` on external modification. */
export async function writeInventory(text: string, force = false): Promise<void> {
  await writeText(inventoryPath(), text, force ? 'force' : 'check')
}
