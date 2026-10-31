import { describe, expect, it } from 'vitest'
import type { LoadedData } from '@shared/api'
import { parseInventory, parseList, serializeList } from '@shared/decklist'
import { upgradeOf, upgradeVariant } from '@shared/listUpgrade'
import { parseTradeText, serializeSnapshot } from '@shared/trade'
import {
  LOADING,
  MAX_HISTORY,
  MERGE_WITHIN_MS,
  UndoHistory,
  inOrder,
  inventoryText,
  mergeLoaded,
  relinkedUpgrades,
  renamedTrade,
  renamedVersionUpgrades,
  savedTrade,
  toCardList,
  unreadableMessage,
  withBundledQty,
  withFewerCopies,
  withCopies,
  withAddedOwned,
  withMovedWishlist,
  withOwned,
  type CardList,
  type ChangeTarget,
  type HistoryEntry
} from './libraryCore'

const data = (patch: Partial<LoadedData> = {}): LoadedData => ({
  dataDir: 'C:/Data',
  decks: [{ name: 'Elves', text: '4 Llanowar Elves\n' }],
  wishlists: [
    { name: 'Goblins', text: '4 Goblin Guide\n' },
    { name: 'Burn', text: '4 Lightning Bolt\n' }
  ],
  brews: [],
  inventory: '2 Sol Ring\n',
  // Saved as the app saves them: JSON, with the date they were made.
  trades: [{ name: 'Dani', text: serializeSnapshot(parseTradeText('4 Lightning Bolt', 'Dani', new Date(0))) }],
  wishlistOrder: ['Goblins', 'Burn'],
  unreadable: [],
  readOnly: false,
  ...patch
})

const list = (kind: CardList['kind'], name: string, text: string) => toCardList(kind, { name, text })
const names = (lists: CardList[]) => lists.map((l) => `${l.kind}/${l.name}`)

describe('loading', () => {
  it('orders decks by name, wishlists by their order, then brews by name', () => {
    const lists = [list('brew', 'b', ''), list('wishlist', 'Zed', ''), list('deck', 'B', ''), list('wishlist', 'Ann', ''), list('deck', 'a', '')]
    expect(names(inOrder(lists, ['Zed']))).toEqual(['deck/a', 'deck/B', 'wishlist/Zed', 'wishlist/Ann', 'brew/b'])
  })

  it('reads the files into a ready state', () => {
    const state = mergeLoaded(LOADING, data())!
    expect(state.status).toBe('ready')
    expect(names(state.lists)).toEqual(['deck/Elves', 'wishlist/Goblins', 'wishlist/Burn'])
    expect(inventoryText(state.inventory)).toBe('2 Sol Ring\n')
    expect(state.trades.map((trade) => trade.name)).toEqual(['Dani'])
  })

  it('reports no change when nothing changed, unless forced', () => {
    const state = mergeLoaded(LOADING, data())!
    expect(mergeLoaded(state, data())).toBeNull()
    expect(mergeLoaded(state, data(), true)).not.toBeNull()
  })

  it('keeps the objects of unchanged files, so memoized figures survive a reload', () => {
    const state = mergeLoaded(LOADING, data())!
    const next = mergeLoaded(state, data({ wishlists: [{ name: 'Goblins', text: '1 Goblin Guide\n' }, data().wishlists[1]] }))!
    expect(next.lists[0]).toBe(state.lists[0])
    expect(next.lists[1]).not.toBe(state.lists[1])
    expect(next.lists[2]).toBe(state.lists[2])
    expect(next.inventory).toBe(state.inventory)
    expect(next.trades).toBe(state.trades)
  })

  it('sees a new wishlist order, and a new data folder, as changes', () => {
    const state = mergeLoaded(LOADING, data())!
    expect(names(mergeLoaded(state, data({ wishlistOrder: ['Burn', 'Goblins'] }))!.lists)).toEqual([
      'deck/Elves',
      'wishlist/Burn',
      'wishlist/Goblins'
    ])
    expect(mergeLoaded(state, data({ dataDir: 'D:/Other' }))?.dataDir).toBe('D:/Other')
  })

  it('names the first unreadable file and counts the rest', () => {
    expect(unreadableMessage(['decks/Burn.txt'])).toMatch(/^Could not read decks\/Burn\.txt, so it is hidden/)
    expect(unreadableMessage(['a.txt', 'b.txt', 'c.txt'])).toMatch(/^Could not read a\.txt and 2 more, so they are hidden/)
  })
})

describe('undo history', () => {
  const burn: ChangeTarget = { type: 'list', list: { kind: 'wishlist', name: 'Burn' } }
  const inventory: ChangeTarget = { type: 'inventory' }
  const lines = parseList('1 Sol Ring')
  /** Current text of every target, as the test sets it. */
  const texts = new Map<string, string | null>()
  const key = (target: ChangeTarget) => (target.type === 'list' ? target.list.name : 'inventory')
  const current = (target: ChangeTarget) => texts.get(key(target)) ?? null
  const isEntry = (value: unknown): value is HistoryEntry => typeof value === 'object' && value !== null && 'id' in value

  it('merges quick unannounced edits to the same target into one step', () => {
    const history = new UndoHistory()
    expect(history.record(burn, lines, 'a', { label: 'One' }, 1000)).toBe(1)
    expect(history.record(burn, lines, 'b', { label: 'Two' }, 1000 + MERGE_WITHIN_MS - 1)).toBeNull()
    expect(history.size).toBe(1)
    const merged = history.take(() => 'b')
    expect(isEntry(merged) && merged.label).toBe('Two')
    expect(isEntry(merged) && merged.before).toBe(lines)
  })

  it('starts a new step for another target, or after a pause', () => {
    const history = new UndoHistory()
    history.record(burn, lines, 'a', { label: 'One' }, 1000)
    expect(history.record(inventory, new Map(), 'b', { label: 'Two' }, 1001)).toBe(2)
    expect(history.record(inventory, new Map(), 'c', { label: 'Three' }, 1001 + MERGE_WITHIN_MS)).toBe(3)
    expect(history.size).toBe(3)
  })

  it('never merges an announced edit, so its toast undoes exactly it', () => {
    const history = new UndoHistory()
    history.record(burn, lines, 'a', { label: 'Edit' }, 1000)
    expect(history.record(burn, lines, 'b', { label: 'Removed', announce: true }, 1001)).toBe(2)
    expect(history.record(burn, lines, 'c', { label: 'Edit' }, 1002)).toBe(3)
  })

  it('skips steps whose target changed since, and stops when none is left', () => {
    const history = new UndoHistory()
    history.record(burn, lines, 'old', { label: 'Old' }, 0)
    history.record(burn, lines, 'stale', { label: 'Stale' }, 5000)
    texts.set('Burn', 'old')
    const taken = history.take(current)
    expect(isEntry(taken) && taken.label).toBe('Old')
    expect(history.take(current)).toEqual({ message: 'Nothing to undo', kind: 'info' })
  })

  it('undoes a toast step only while it is the latest and still applies', () => {
    const history = new UndoHistory()
    const first = history.record(burn, lines, 'a', { label: 'First', announce: true }, 0)!
    history.record(inventory, new Map(), 'b', { label: 'Second' }, 1)
    expect(history.take(current, first)).toEqual({ message: 'You changed more since. Press Ctrl+Z to undo step by step.', kind: 'error' })
    expect(history.take(current, 99)).toEqual({ message: 'That change can no longer be undone.', kind: 'error' })
    texts.set('inventory', 'changed')
    expect(history.take(current, 2)).toEqual({ message: 'That change can no longer be undone.', kind: 'error' })
  })

  it('follows a renamed list and forgets a deleted one', () => {
    const history = new UndoHistory()
    history.record(burn, lines, 'a', { label: 'Edit' }, 0)
    history.retarget({ kind: 'wishlist', name: 'Burn' }, { kind: 'deck', name: 'Fire' })
    const taken = history.take(() => 'a')
    expect(isEntry(taken) && taken.target).toEqual({ type: 'list', list: { kind: 'deck', name: 'Fire' } })
    history.record(burn, lines, 'a', { label: 'Edit' }, 0)
    history.retarget({ kind: 'wishlist', name: 'Burn' }, null)
    expect(history.size).toBe(0)
  })

  it(`keeps the latest ${MAX_HISTORY} steps`, () => {
    const history = new UndoHistory()
    for (let i = 0; i < MAX_HISTORY + 5; i++) history.record(burn, lines, String(i), { label: `Step ${i}`, announce: true }, i)
    expect(history.size).toBe(MAX_HISTORY)
    history.clear()
    expect(history.size).toBe(0)
  })
})

describe('list edits', () => {
  it('moves a wishlist within the order, clamped to its ends', () => {
    const lists = [list('deck', 'Elves', ''), list('wishlist', 'A', ''), list('wishlist', 'B', ''), list('wishlist', 'C', '')]
    expect(names(withMovedWishlist(lists, { kind: 'wishlist', name: 'C' }, 0)!)).toEqual(['deck/Elves', 'wishlist/C', 'wishlist/A', 'wishlist/B'])
    expect(names(withMovedWishlist(lists, { kind: 'wishlist', name: 'A' }, 99)!)).toEqual(['deck/Elves', 'wishlist/B', 'wishlist/C', 'wishlist/A'])
    expect(withMovedWishlist(lists, { kind: 'wishlist', name: 'A' }, 0)).toBeNull()
    expect(withMovedWishlist(lists, { kind: 'wishlist', name: 'Gone' }, 0)).toBeNull()
  })

  it('collapses a bundled basic into one plain line where its first line was', () => {
    const lines = parseList('1 Sol Ring\n2 Island [DOM] (F)\n3 Island [M21]')
    const ids = lines.filter((line) => line.kind === 'card' && line.name === 'Island').map((line) => line.id)
    expect(serializeList(withBundledQty(lines, ids, 7))).toBe('1 Sol Ring\n7 Island\n')
  })

  it('takes copies of a card off its last lines, never off the swaps of a version', () => {
    const lines = parseList('2 Forest [M21]\n3 Forest\n1 Sol Ring\n// Version: Lands\n\n// Lands in\n2 Forest')
    expect(serializeList(withFewerCopies(lines, 'forest', 4))).toBe('1 Forest [M21]\n1 Sol Ring\n// Version: Lands\n\n// Lands in\n2 Forest\n')
    expect(serializeList(withFewerCopies(lines, 'Sol Ring', 1))).not.toContain('Sol Ring')
  })

  it('relinks the upgrades of a renamed or deleted deck', () => {
    const lists = [
      list('deck', 'Elves', '1 Llanowar Elves'),
      list('wishlist', 'More elves', '// Upgrade of: Elves\n1 Elvish Mystic'),
      list('wishlist', 'Other', '// Upgrade of: Goblins\n1 Goblin Guide'),
      list('deck', 'Not a wishlist', '// Upgrade of: Elves\n1 Sol Ring')
    ]
    const renamed = relinkedUpgrades(lists, 'elves', 'Forest friends')
    expect(renamed.map(({ list }) => list.name)).toEqual(['More elves'])
    expect(serializeList(renamed[0].lines)).toBe('// Upgrade of: Forest friends\n1 Elvish Mystic\n')
    expect(serializeList(relinkedUpgrades(lists, 'Elves', null)[0].lines)).toBe('1 Elvish Mystic\n')
  })

  it('lets the upgrades of a renamed version follow it', () => {
    const lists = [
      list('wishlist', 'Counters plan', '// Upgrade of: Elves\n// Upgrade version: Counters\n1 Hardened Scales'),
      list('wishlist', 'Base plan', '// Upgrade of: Elves\n1 Sol Ring')
    ]
    const followers = renamedVersionUpgrades(lists, 'Elves', 'Counters', ' Proliferate ')
    expect(followers.map(({ list }) => list.name)).toEqual(['Counters plan'])
    expect(upgradeOf(followers[0].lines)).toBe('Elves')
    expect(upgradeVariant(followers[0].lines)).toBe('Proliferate')
  })
})

describe('inventory edits', () => {
  const inventory = parseInventory('2 Sol Ring\n1 Lightning Bolt')

  it('sets how many are owned, and announces a removal', () => {
    const more = withOwned(inventory, 'sol ring', 3)
    expect(inventoryText(more.inventory)).toBe('1 Lightning Bolt\n3 Sol Ring\n')
    expect(more.change).toEqual({ label: 'Changed how many Sol Ring you own' })
    const none = withOwned(inventory, 'Sol Ring', 0)
    expect(inventoryText(none.inventory)).toBe('1 Lightning Bolt\n')
    expect(none.change).toEqual({ label: 'Removed Sol Ring from your Inventory', announce: true })
    expect(inventoryText(inventory)).toBe('1 Lightning Bolt\n2 Sol Ring\n')
  })

  it('adds copies with their printing, finish and language', () => {
    const added = withAddedOwned(inventory, [{ name: 'Sol Ring', qty: 2, set: 'c21', collector: '263', foil: true, lang: 'de' }])
    expect(added.cards).toBe(2)
    expect(added.inventory.get('sol ring')?.copies).toEqual([
      { qty: 2, foil: false },
      { qty: 2, set: 'c21', collector: '263', foil: true, lang: 'de' }
    ])
  })

  it('replaces a card’s copies, and drops it when none are left', () => {
    expect(inventoryText(withCopies(inventory, 'Sol Ring', []).inventory)).toBe('1 Lightning Bolt\n')
    expect(withCopies(inventory, 'Sol Ring', []).change.label).toBe('Changed the Versions of Sol Ring you own')
  })
})

describe('trade lists', () => {
  const dani = { ...parseTradeText('4 Lightning Bolt', 'Dani'), name: 'Dani' }
  const sam = { ...parseTradeText('1 Sol Ring', 'Sam'), name: 'Sam' }

  it('replaces a trade list of the same name in any case, keeping its file name', () => {
    const { saved, replaced } = savedTrade([dani], { ...dani, name: 'DANI' })
    expect(saved.name).toBe('Dani')
    expect(replaced).toBe(dani)
    expect(savedTrade([dani], sam).replaced).toBeUndefined()
  })

  it('renames only to a free, valid name', () => {
    expect(renamedTrade([dani, sam], 'Dani', 'Daniela')?.renamed.name).toBe('Daniela')
    expect(renamedTrade([dani, sam], 'Dani', 'Dani')).toBeNull()
    expect(() => renamedTrade([dani, sam], 'Dani', 'sam')).toThrow('You already have a Trade list called "sam".')
    expect(() => renamedTrade([dani], 'Dani', '  ')).toThrow('Please enter a name.')
  })
})
