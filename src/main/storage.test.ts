import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Temp roots created per test (isolated profile and fresh storage module), removed afterwards. */
const roots: string[] = []

async function setup(root?: string) {
  vi.resetModules()
  const base = root ?? (await mkdtemp(join(tmpdir(), 'mtg-dreams-')))
  roots.push(base)
  const trashed: string[] = []
  const { setEnvironment, SERVICES } = await import('./environment')
  setEnvironment({
    userData: join(base, 'userData'),
    documents: join(base, 'Documents'),
    appData: join(base, 'AppData'),
    trash: async (path) => {
      trashed.push(path)
      await rm(path, { recursive: true })
    },
    userAgent: 'MTGDreams/test',
    ...SERVICES
  })
  mkdirSync(join(base, 'userData'), { recursive: true })
  const storage = await import('./storage')
  const data = join(base, 'Documents', 'MTG Dreams')
  return { base, data, storage, trashed }
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('lists on disk', () => {
  it('starts empty, creating the data folders in Documents', async () => {
    const { data, storage } = await setup()
    expect(await storage.loadData()).toEqual({ dataDir: data, decks: [], wishlists: [], inventory: '', trades: [], unreadable: [] })
    expect(readdirSync(data).sort()).toEqual(['decks', 'lists'])
  })

  it('creates, reads back sorted by name, and refuses duplicates', async () => {
    const { storage } = await setup()
    await storage.createList('deck', 'burn', '4 Lightning Bolt\n')
    await storage.createList('deck', 'Atraxa', '1 Sol Ring\n')
    await expect(storage.createList('deck', 'Burn', '')).rejects.toThrow('A deck called "Burn" already exists.')
    const loaded = await storage.loadData()
    expect(loaded.decks).toEqual([
      { name: 'Atraxa', text: '1 Sol Ring\n' },
      { name: 'burn', text: '4 Lightning Bolt\n' }
    ])
  })

  it('lands rapid writes in order, leaving no temporary files', async () => {
    const { data, storage } = await setup()
    await Promise.all(['1 A\n', '2 A\n', '3 A\n'].map((text) => storage.writeList('wishlist', 'Wants', text)))
    expect(readFileSync(join(data, 'lists', 'Wants.txt'), 'utf8')).toBe('3 A\n')
    expect(readdirSync(join(data, 'lists'))).toEqual(['Wants.txt'])
  })

  it('skips a file it cannot read and reports it, loading the rest', async () => {
    const { data, storage } = await setup()
    await storage.writeList('deck', 'Good', '1 Sol Ring\n')
    mkdirSync(join(data, 'decks', 'Broken.txt'))
    const loaded = await storage.loadData()
    expect(loaded.decks.map((d) => d.name)).toEqual(['Good'])
    expect(loaded.unreadable).toEqual(['decks/Broken.txt'])
  })

  it('renames (including a change of case only) without overwriting another list', async () => {
    const { data, storage } = await setup()
    await storage.writeList('deck', 'Burn', '')
    await storage.writeList('deck', 'Elves', '')
    await expect(storage.renameList('deck', 'Burn', 'Elves')).rejects.toThrow('already exists')
    await storage.renameList('deck', 'Burn', 'BURN')
    expect(readdirSync(join(data, 'decks')).sort()).toEqual(['BURN.txt', 'Elves.txt'])
  })

  it('moves a wishlist to Decks under a free name', async () => {
    const { storage } = await setup()
    await storage.writeList('deck', 'Burn', 'old\n')
    await storage.writeList('wishlist', 'Burn', 'new\n')
    expect(await storage.moveList('wishlist', 'deck', 'Burn')).toBe('Burn (2)')
    const loaded = await storage.loadData()
    expect(loaded.decks.map((d) => [d.name, d.text])).toEqual([
      ['Burn', 'old\n'],
      ['Burn (2)', 'new\n']
    ])
    expect(loaded.wishlists).toEqual([])
  })

  it('sends deleted lists and trade lists to the Recycle Bin', async () => {
    const { data, storage, trashed } = await setup()
    await storage.writeList('deck', 'Burn', '')
    await storage.writeTrade('Ana', '{}')
    expect((await storage.loadData()).trades).toEqual([{ name: 'Ana', text: '{}' }])
    await storage.deleteList('deck', 'Burn')
    await storage.deleteTrade('Ana')
    expect(trashed).toEqual([join(data, 'decks', 'Burn.txt'), join(data, 'trades', 'Ana.mtgtrade')])
  })

  it('refuses to overwrite a list another program changed, unless forced', async () => {
    const { data, storage } = await setup()
    const file = join(data, 'decks', 'Burn.txt')
    await storage.writeList('deck', 'Burn', '4 Lightning Bolt\n')
    writeFileSync(file, '4 Lava Spike\n')
    await expect(storage.writeList('deck', 'Burn', '3 Lightning Bolt\n')).rejects.toThrow(/^Changed outside MTG Dreams:/)
    expect(readFileSync(file, 'utf8')).toBe('4 Lava Spike\n')
    await storage.writeList('deck', 'Burn', '3 Lightning Bolt\n', true)
    expect(readFileSync(file, 'utf8')).toBe('3 Lightning Bolt\n')
    await storage.writeList('deck', 'Burn', '2 Lightning Bolt\n')
    expect(readFileSync(file, 'utf8')).toBe('2 Lightning Bolt\n')
  })

  it('accepts outside changes once it has read them again', async () => {
    const { data, storage } = await setup()
    await storage.writeInventory('4 Island\n')
    writeFileSync(join(data, 'inventory.txt'), '5 Island\n')
    expect((await storage.loadData()).inventory).toBe('5 Island\n')
    await storage.writeInventory('6 Island\n')
    expect(readFileSync(join(data, 'inventory.txt'), 'utf8')).toBe('6 Island\n')
  })

  it('treats an inventory that appeared outside the app as a change', async () => {
    const { data, storage } = await setup()
    await storage.loadData()
    writeFileSync(join(data, 'inventory.txt'), '1 Sol Ring\n')
    await expect(storage.writeInventory('4 Island\n')).rejects.toThrow(/^Changed outside MTG Dreams:/)
  })

  it('keeps guarding a list after it is renamed or moved, and writes a deleted one again', async () => {
    const { data, storage } = await setup()
    await storage.writeList('wishlist', 'Wants', '1 A\n')
    await storage.renameList('wishlist', 'Wants', 'Needs')
    writeFileSync(join(data, 'lists', 'Needs.txt'), '1 B\n')
    await expect(storage.writeList('wishlist', 'Needs', '2 A\n')).rejects.toThrow(/^Changed outside/)
    await storage.writeList('wishlist', 'Needs', '2 A\n', true)
    const moved = await storage.moveList('wishlist', 'deck', 'Needs')
    writeFileSync(join(data, 'decks', `${moved}.txt`), '1 C\n')
    await expect(storage.writeList('deck', moved, '3 A\n')).rejects.toThrow(/^Changed outside/)

    await storage.writeList('deck', 'Gone', '1 A\n')
    await rm(join(data, 'decks', 'Gone.txt'))
    await storage.writeList('deck', 'Gone', '2 A\n')
    expect(readFileSync(join(data, 'decks', 'Gone.txt'), 'utf8')).toBe('2 A\n')
  })

  it('validates names before touching the disk', async () => {
    const { storage } = await setup()
    expect(() => storage.validateListName('  Burn  ')).not.toThrow()
    expect(storage.validateListName('  Burn  ')).toBe('Burn')
    expect(() => storage.validateListName('a/b')).toThrow('cannot contain')
    expect(() => storage.validateListName('nul')).toThrow('reserved')
    expect(() => storage.validateKind('sideboard')).toThrow('Invalid list kind.')
  })
})

describe('settings', () => {
  it('defaults, saves, and survives a restart; bad values fall back', async () => {
    const first = await setup()
    expect(first.storage.getAppSettings()).toEqual({ theme: 'system', color: 'W', bundleBasics: true, copies: 'separate', cardImages: true, cardView: 'table', tradeName: '', sort: 'file', priceBasis: 'trend', dropAlertPercent: 15 })
    first.storage.updateAppSettings({ theme: 'dark', color: 'G', sort: 'mana' })
    const settingsFile = join(first.base, 'userData', 'settings.json')
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toMatchObject({ theme: 'dark', color: 'G', sort: 'mana' })

    writeFileSync(settingsFile, JSON.stringify({ theme: 'neon', color: 'teal', sort: 'price', bundleBasics: false, copies: 'some' }))
    const restarted = await setup(first.base)
    expect(restarted.storage.getAppSettings()).toEqual({ theme: 'system', color: 'W', bundleBasics: false, copies: 'separate', cardImages: true, cardView: 'table', tradeName: '', sort: 'file', priceBasis: 'trend', dropAlertPercent: 15 })
  })

  it('uses a chosen data folder', async () => {
    const { base, storage } = await setup()
    const elsewhere = join(base, 'OneDrive', 'Cards')
    await storage.setDataDir(elsewhere)
    await storage.writeInventory('4 Island\n')
    expect(readFileSync(join(elsewhere, 'inventory.txt'), 'utf8')).toBe('4 Island\n')
    expect((await storage.loadData()).dataDir).toBe(elsewhere)
  })

  it('replaces the settings file whole, leaving no temporary file', async () => {
    const first = await setup()
    const elsewhere = join(first.base, 'OneDrive', 'Cards')
    await first.storage.setDataDir(elsewhere)
    first.storage.updateAppSettings({ theme: 'dark' })
    expect(readdirSync(join(first.base, 'userData'))).toEqual(['settings.json'])
    const restarted = await setup(first.base)
    expect(restarted.storage.dataDir()).toBe(elsewhere)
    expect(restarted.storage.getTheme()).toBe('dark')
  })

  it('carries settings, caches and data over from "MTG Dream"', async () => {
    const base = await mkdtemp(join(tmpdir(), 'mtg-dreams-'))
    const oldProfile = join(base, 'AppData', 'MTG Dream')
    mkdirSync(join(oldProfile, 'precons'), { recursive: true })
    writeFileSync(join(oldProfile, 'settings.json'), JSON.stringify({ color: 'G', sort: 'mana' }))
    writeFileSync(join(oldProfile, 'scryfall-cache.json'), '{"version":6}')
    writeFileSync(join(oldProfile, 'precons', 'index.json'), '{}')
    mkdirSync(join(base, 'AppData', 'MTG Wishlist Tracker'), { recursive: true })
    writeFileSync(join(base, 'AppData', 'MTG Wishlist Tracker', 'settings.json'), JSON.stringify({ color: 'R' }))
    mkdirSync(join(base, 'Documents', 'MTG Dream', 'decks'), { recursive: true })
    writeFileSync(join(base, 'Documents', 'MTG Dream', 'decks', 'Burn.txt'), '4 Lightning Bolt\n')

    const { storage, data } = await setup(base)
    storage.migrateFromOldName()
    expect(storage.getAppSettings()).toMatchObject({ color: 'G', sort: 'mana' })
    expect(readFileSync(join(base, 'userData', 'scryfall-cache.json'), 'utf8')).toBe('{"version":6}')
    expect(existsSync(join(base, 'userData', 'precons', 'index.json'))).toBe(true)
    expect(data).toBe(join(base, 'Documents', 'MTG Dreams'))
    expect((await storage.loadData()).decks).toEqual([{ name: 'Burn', text: '4 Lightning Bolt\n' }])
    expect(existsSync(join(base, 'Documents', 'MTG Dream'))).toBe(false)
    expect(existsSync(join(oldProfile, 'settings.json'))).toBe(true)
  })

  it('carries settings and data over from the oldest name', async () => {
    const base = await mkdtemp(join(tmpdir(), 'mtg-dreams-'))
    mkdirSync(join(base, 'AppData', 'MTG Wishlist Tracker'), { recursive: true })
    writeFileSync(join(base, 'AppData', 'MTG Wishlist Tracker', 'settings.json'), JSON.stringify({ theme: 'light' }))
    mkdirSync(join(base, 'Documents', 'MTG Wishlist Tracker', 'lists'), { recursive: true })
    writeFileSync(join(base, 'Documents', 'MTG Wishlist Tracker', 'lists', 'Old.txt'), '1 Sol Ring\n')
    const { storage } = await setup(base)
    storage.migrateFromOldName()
    expect(storage.getAppSettings().theme).toBe('light')
    expect(existsSync(join(base, 'Documents', 'MTG Wishlist Tracker'))).toBe(false)
    expect((await storage.loadData()).wishlists).toEqual([{ name: 'Old', text: '1 Sol Ring\n' }])
  })
})
