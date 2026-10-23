import { describe, expect, it, vi } from 'vitest'
import { CONFLICT_ERROR, type LoadedData } from '@shared/api'
import { inventoryText } from './libraryCore'
import { LibraryStore, type LibraryIO } from './libraryStore'

const DATA: LoadedData = {
  dataDir: 'C:/Data',
  decks: [{ name: 'Elves', text: '4 Llanowar Elves\n' }],
  wishlists: [
    { name: 'Goblins', text: '4 Goblin Guide\n' },
    { name: 'Burn', text: '4 Lightning Bolt\n' }
  ],
  brews: [],
  inventory: '2 Sol Ring\n',
  trades: [],
  wishlistOrder: ['Goblins', 'Burn'],
  unreadable: []
}

const goblins = { kind: 'wishlist' as const, name: 'Goblins' }
const burn = { kind: 'wishlist' as const, name: 'Burn' }

/** Lets pending writes settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve))

/** A store over a fake file layer that records every write. */
async function loaded(data: LoadedData = DATA) {
  const io = {
    loadData: vi.fn(async () => data),
    createList: vi.fn(async () => {}),
    writeList: vi.fn(async (_kind: string, _name: string, _text: string, _force?: boolean) => {}),
    renameList: vi.fn(async () => {}),
    moveList: vi.fn(async (_from: string, _to: string, name: string) => name),
    deleteList: vi.fn(async () => {}),
    writeWishlistOrder: vi.fn(async () => {}),
    writeInventory: vi.fn(async (_text: string, _force?: boolean) => {}),
    writeTrade: vi.fn(async () => {}),
    deleteTrade: vi.fn(async () => {}),
    chooseDataDir: vi.fn(async () => null as string | null)
  } satisfies LibraryIO
  const onError = vi.fn()
  const onUndoable = vi.fn()
  let time = 0
  const store = new LibraryStore(io, { onError, onUndoable }, () => (time += 5000))
  await store.actions.reload(true)
  return { store, io, onError, onUndoable }
}

const text = (store: LibraryStore, name: string) => store.state.lists.find((list) => list.name === name)?.text

describe('library store', () => {
  it('loads the data folder and tells subscribers', async () => {
    const io = { loadData: async () => DATA } as unknown as LibraryIO
    const store = new LibraryStore(io, { onError: () => {}, onUndoable: () => {} })
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.getSnapshot().state.status).toBe('loading')
    await store.actions.reload(true)
    expect(listener).toHaveBeenCalled()
    expect(store.getSnapshot().state.lists.map((list) => list.name)).toEqual(['Elves', 'Goblins', 'Burn'])
  })

  it('shows a load failure as an error state, and later ones as messages', async () => {
    const io = { loadData: vi.fn().mockRejectedValue(new Error('Disk gone')) } as unknown as LibraryIO
    const onError = vi.fn()
    const store = new LibraryStore(io, { onError, onUndoable: () => {} })
    await store.actions.reload(true)
    expect(store.state).toMatchObject({ status: 'error', error: 'Disk gone' })
    expect(onError).not.toHaveBeenCalled()
    await store.actions.reload(true)
    expect(onError).toHaveBeenCalledWith('Disk gone')
  })

  it('applies an edit at once, writes it, and undoes it', async () => {
    const { store, io } = await loaded()
    store.actions.addCards(goblins, [{ name: 'Goblin Bushwhacker', qty: 2, foil: false }])
    expect(text(store, 'Goblins')).toBe('4 Goblin Guide\n2 Goblin Bushwhacker\n')
    expect(io.writeList).toHaveBeenLastCalledWith('wishlist', 'Goblins', '4 Goblin Guide\n2 Goblin Bushwhacker\n')
    expect(store.actions.undo()).toEqual({ message: 'Undone: Added 2× Goblin Bushwhacker', kind: 'info' })
    expect(text(store, 'Goblins')).toBe('4 Goblin Guide\n')
    expect(io.writeList).toHaveBeenLastCalledWith('wishlist', 'Goblins', '4 Goblin Guide\n')
    expect(store.actions.undo()).toEqual({ message: 'Nothing to undo', kind: 'info' })
  })

  it('offers Undo in a toast for announced edits, which undoes just that edit', async () => {
    const { store, onUndoable } = await loaded()
    const id = store.state.lists.find((list) => list.name === 'Burn')!.lines[0].id
    store.actions.removeCard(burn, id)
    expect(text(store, 'Burn')).toBe('')
    expect(onUndoable).toHaveBeenCalledWith('Removed Lightning Bolt', expect.any(Function))
    const [, undo] = onUndoable.mock.calls[0]
    expect(undo()).toEqual({ message: 'Undone: Removed Lightning Bolt', kind: 'info' })
    expect(text(store, 'Burn')).toBe('4 Lightning Bolt\n')
  })

  it('edits the inventory and undoes that too', async () => {
    const { store, io } = await loaded()
    store.actions.setOwned('Sol Ring', 3)
    expect(io.writeInventory).toHaveBeenLastCalledWith('3 Sol Ring\n')
    store.actions.undo()
    expect(inventoryText(store.state.inventory)).toBe('2 Sol Ring\n')
  })

  it('writes nothing for an edit that changes nothing', async () => {
    const { store, io } = await loaded()
    store.actions.setListColor(goblins, null)
    store.actions.setOwned('Sol Ring', 2)
    expect(io.writeList).not.toHaveBeenCalled()
    expect(io.writeInventory).not.toHaveBeenCalled()
  })

  it('turns a save rejected by an outside change into a conflict, and keeps mine on request', async () => {
    const { store, io, onError } = await loaded()
    io.writeList.mockRejectedValueOnce(new Error(`${CONFLICT_ERROR} "Goblins.txt" was changed by another program.`))
    store.actions.setListColor(goblins, 'R')
    await settle()
    expect(store.getSnapshot().conflict).toEqual({ target: { type: 'list', list: goblins }, name: '“Goblins”' })
    expect(onError).not.toHaveBeenCalled()

    // Reloads wait while the conflict is open.
    io.loadData.mockClear()
    await store.actions.reload()
    expect(io.loadData).not.toHaveBeenCalled()

    await store.actions.resolveConflict(true)
    expect(store.getSnapshot().conflict).toBeNull()
    expect(io.writeList).toHaveBeenLastCalledWith('wishlist', 'Goblins', '// Color: Red\n4 Goblin Guide\n', true)
  })

  it('takes the file from disk when the conflict is resolved the other way', async () => {
    const { store, io } = await loaded()
    io.writeList.mockRejectedValueOnce(new Error(`${CONFLICT_ERROR} changed`))
    store.actions.setListColor(goblins, 'R')
    await settle()
    await store.actions.resolveConflict(false)
    expect(text(store, 'Goblins')).toBe('4 Goblin Guide\n')
  })

  it('reports other save failures as messages', async () => {
    const { store, io, onError } = await loaded()
    io.writeInventory.mockRejectedValueOnce(new Error("Error invoking remote method 'inventory:write': Error: EPERM: locked"))
    store.actions.setOwned('Sol Ring', 5)
    await settle()
    expect(onError).toHaveBeenCalledWith('Could not save: EPERM: locked')
    expect(store.getSnapshot().conflict).toBeNull()
  })

  it('does not reload over a write still on its way', async () => {
    const { store, io } = await loaded()
    let finish!: () => void
    io.writeList.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
    store.actions.setListColor(goblins, 'R')
    io.loadData.mockClear()
    await store.actions.reload()
    expect(io.loadData).not.toHaveBeenCalled()
    finish()
    await settle()
    await store.actions.reload()
    expect(io.loadData).toHaveBeenCalledOnce()
  })

  it('reports unreadable files once', async () => {
    const { store, io, onError } = await loaded()
    io.loadData.mockResolvedValue({ ...DATA, unreadable: ['decks/Elves.txt'] })
    await store.actions.reload()
    await store.actions.reload()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('reorders wishlists and saves the order', async () => {
    const { store, io } = await loaded()
    store.actions.moveWishlist(burn, 0)
    expect(store.state.lists.map((list) => list.name)).toEqual(['Elves', 'Burn', 'Goblins'])
    expect(io.writeWishlistOrder).toHaveBeenCalledWith(['Burn', 'Goblins'])
  })

  it('keeps a renamed list’s undo steps, and drops a deleted one’s', async () => {
    const { store, io } = await loaded()
    store.actions.setListColor(goblins, 'R')
    await store.actions.renameList(goblins, ' Goblin horde ')
    expect(io.renameList).toHaveBeenCalledWith('wishlist', 'Goblins', 'Goblin horde')
    expect(store.actions.undo().message).toBe('Undone: Changed the color')
    expect(io.writeList).toHaveBeenLastCalledWith('wishlist', 'Goblin horde', '4 Goblin Guide\n')

    store.actions.setListColor(burn, 'R')
    await store.actions.deleteList(burn)
    expect(store.state.lists.map((list) => list.name)).toEqual(['Elves', 'Goblin horde'])
    expect(store.actions.undo()).toEqual({ message: 'Nothing to undo', kind: 'info' })
  })

  it('makes the upgrades of a deleted deck plain wishlists', async () => {
    const { store, io } = await loaded({
      ...DATA,
      wishlists: [{ name: 'More elves', text: '// Upgrade of: Elves\n1 Elvish Mystic\n' }],
      wishlistOrder: []
    })
    await store.actions.deleteList({ kind: 'deck', name: 'Elves' })
    expect(io.writeList).toHaveBeenLastCalledWith('wishlist', 'More elves', '1 Elvish Mystic\n')
  })

  it('clears undo when the data folder changes', async () => {
    const { store, io } = await loaded()
    store.actions.setListColor(goblins, 'R')
    io.chooseDataDir.mockResolvedValueOnce('D:/Other')
    expect(await store.actions.chooseDataDir()).toBe(true)
    expect(store.actions.undo()).toEqual({ message: 'Nothing to undo', kind: 'info' })
  })
})
