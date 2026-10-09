import { beforeAll, describe, expect, it, vi } from 'vitest'

/** Electron as the IPC handlers see it: handlers recorded, the system browser and clipboard recorded. */
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  opened: [] as string[],
  copied: [] as string[]
}))
vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
  clipboard: { writeText: (text: string) => electron.copied.push(text) },
  dialog: {},
  ipcMain: { handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => electron.handlers.set(channel, listener) },
  nativeTheme: {},
  shell: { openExternal: async (url: string) => electron.opened.push(url), openPath: async () => '' }
}))

const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!(null, ...args)

beforeAll(async () => (await import('./ipc')).registerIpc())

describe('the app’s IPC handlers', () => {
  it('register every channel the preload script calls', async () => {
    const preload = (await import('node:fs')).readFileSync(new URL('../preload/index.ts', import.meta.url), 'utf8')
    const channels = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1])
    expect(channels.length).toBeGreaterThan(20)
    expect(channels.filter((channel) => !electron.handlers.has(channel))).toEqual([])
  })

  it('refuse malformed input before any work', () => {
    expect(() => invoke('list:create', 'binder', 'Burn', '')).toThrow('Invalid list kind.')
    expect(() => invoke('list:write', 'deck', 'Burn', 42)).toThrow('Invalid list text.')
    expect(() => invoke('scryfall:images', Array(76).fill('Sol Ring'))).toThrow('Invalid card names.')
    expect(() => invoke('history:track', [1, 2.5])).toThrow('Invalid product numbers.')
    expect(() => invoke('history:pricesAt', [1], Array(11).fill(0))).toThrow('Invalid periods.')
    expect(() => invoke('tokens:deck', ['x'.repeat(201)])).toThrow('Invalid card names.')
    expect(() => invoke('precons:deck', null)).toThrow('Invalid deck.')
  })

  it('open only https links on the allowed sites', async () => {
    for (const url of ['https://scryfall.com/card/x', 'https://www.cardmarket.com/en', 'http://scryfall.com', 'https://evil.example', 'not a url', 'https://scryfall.com.evil.example']) {
      await invoke('shell:openExternal', url)
    }
    expect(electron.opened).toEqual(['https://scryfall.com/card/x', 'https://www.cardmarket.com/en'])
  })

  it('copy text to the clipboard', async () => {
    await invoke('clipboard:write', 'Sol Ring')
    expect(electron.copied).toEqual(['Sol Ring'])
    expect(() => invoke('clipboard:write', {})).toThrow('Invalid text.')
  })
})
