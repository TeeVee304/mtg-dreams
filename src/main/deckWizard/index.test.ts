import { describe, expect, it, vi } from 'vitest'
import type { EngineHost } from './engineHost'
import { registerDeckWizard } from '.'

vi.mock('electron', () => ({ app: { isPackaged: true }, ipcMain: { handle: vi.fn() } }))

/** The wizard's IPC handlers over a recording engine. */
function setup() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const calls: Array<[string, unknown[]]> = []
  const engine: EngineHost = {
    call: (async (method: string, ...args: unknown[]) => {
      calls.push([method, args])
      return `${method} done`
    }) as EngineHost['call'],
    close: async () => undefined
  }
  registerDeckWizard({ engine, handle: (channel, listener) => handlers.set(channel, listener) })
  const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)!(null, ...args)
  return { handlers, calls, invoke }
}

const DECK = { picks: [{ name: 'Sol Ring', qty: 1, slot: 'ramp', reason: 'Mana.' }], summary: '' }

describe('the Deck Wizard’s IPC handlers', () => {
  it('registers one handler per wizard call, and passes checked input to the engine', async () => {
    const { handlers, calls, invoke } = setup()
    expect([...handlers.keys()].sort()).toEqual(
      ['build', 'edit', 'focus', 'ideas', 'plan', 'prepare', 'report', 'search', 'status', 'swap'].map((name) => `wizard:${name}`)
    )
    expect(await invoke('wizard:search', 'x'.repeat(300), { commanders: true, basis: 'nonsense' })).toBe('search done')
    expect(calls[0]).toEqual(['search', ['x'.repeat(200), { commander: undefined, commanders: true, basis: 'trend' }]])
    await invoke('wizard:swap', { commander: 'Flubs' }, DECK, 'Sol Ring', [])
    expect(calls[1]).toEqual(['swap', [{ commander: 'Flubs' }, DECK, 'Sol Ring', []]])
  })

  it('refuses malformed input before it reaches the engine', () => {
    const { calls, invoke } = setup()
    expect(() => invoke('wizard:focus', 42, [], 'trend')).toThrow('Invalid commander.')
    expect(() => invoke('wizard:focus', 'Flubs', ['a', 'b', 'c', 'd'], 'trend')).toThrow('Invalid card names.')
    expect(() => invoke('wizard:report', {}, { picks: 'nope' })).toThrow('Invalid deck.')
    expect(() => invoke('wizard:edit', {}, DECK, Array(21).fill('Bear'), [])).toThrow('Invalid card names.')
    expect(calls).toEqual([])
  })
})
