import { useCallback, useEffect, useMemo, useState } from 'react'
import { cardLines, parseList, serializeCard, serializeList } from '../../shared/decklist'
import { bundledBasic } from '../../shared/basics'
import { withCommander, withFormat } from '../../shared/formats'
import { preconListName, type PreconEntry } from '../../shared/precons'
import { myTradeSide } from '../../shared/trade'
import type { ListKind, PreconDeck } from '../../shared/types'
import { CARD_SEARCH_ID } from './components/CardSearch'
import { ConflictDialog, NewListDialog } from './components/Dialogs'
import { HistorySync } from './components/HistorySync'
import { HoverPreview } from './components/HoverPreview'
import { InventoryView } from './components/InventoryView'
import { CollectionValueDialog } from './components/CollectionValue'
import { ListView } from './components/ListView'
import { PreconDialog } from './components/PreconDialog'
import { PriceProgress } from './components/PriceProgress'
import { SettingsDialog } from './components/SettingsDialog'
import { ImportTradeDialog, ShareTradeDialog } from './components/TradeDialogs'
import { TradeView } from './components/TradeView'
import { Sidebar, type View } from './components/Sidebar'
import { useToast } from './components/Toasts'
import { cardCount, cleanError } from './format'
import { sameList, useLibrary, type ListRef, type UndoResult } from './library'
import { refreshStalePrintings, reloadPrices, requestPrintings } from './printings'
import { useSettings } from './settings'

const countCards = (entries: PreconEntry[]) => entries.reduce((sum, entry) => sum + entry.qty, 0)

const NOT_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])

/** Whether keys go to a text field, which has its own Ctrl+Z. */
function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) return !NOT_TEXT_INPUTS.has(target.type)
  return target instanceof HTMLElement && target.isContentEditable
}

export default function App() {
  const toast = useToast()
  const onError = useCallback((message: string) => toast(message, 'error'), [toast])
  const showUndone = useCallback((result: UndoResult) => toast(result.message, result.kind), [toast])
  // Removals and bulk edits say what they did, with an Undo button; Ctrl+Z undoes any edit.
  const onUndoable = useCallback(
    (label: string, undo: () => UndoResult) => toast(label, 'info', { label: 'Undo', run: () => showUndone(undo()) }),
    [toast, showUndone]
  )
  const { state, actions, conflict } = useLibrary({ onError, onUndoable })
  const [view, setView] = useState<View | null>(null)
  const [creating, setCreating] = useState<ListKind | null>(null)
  const [precon, setPrecon] = useState<ListKind | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [valueOpen, setValueOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Importing a trade list; `replaceName` when updating a friend's list.
  const [importing, setImporting] = useState<{ replaceName?: string } | null>(null)

  useEffect(() => {
    void actions.reload(true)
    return window.api.onWindowFocus(() => void actions.reload())
  }, [actions])

  const openList = (list: ListRef) => setView({ page: 'list', list })

  // Keep the view pointing at something that exists.
  useEffect(() => {
    if (state.status !== 'ready') return
    if (view?.page === 'inventory') return
    if (view?.page === 'list' && state.lists.some((list) => sameList(list, view.list))) return
    if (view?.page === 'trade' && state.trades.some((trade) => trade.name === view.friend)) return
    const first = state.lists[0]
    setView(first ? { page: 'list', list: { kind: first.kind, name: first.name } } : null)
  }, [state.status, state.lists, state.trades, view])

  // Warm prices for every deck and wishlist in the background, the open one first.
  // Bundled basic lands need no lookups at all.
  const { bundleBasics } = useSettings()
  const active = view?.page === 'list' ? view.list : null
  const namesKey = useMemo(
    () =>
      [...state.lists]
        .sort((a, b) => Number(active !== null && sameList(b, active)) - Number(active !== null && sameList(a, active)))
        .flatMap((list) => cardLines(list.lines).map((line) => line.name))
        .filter((name) => !bundledBasic(name, bundleBasics))
        .join('\n'),
    [state.lists, active, bundleBasics]
  )
  useEffect(() => {
    for (const name of namesKey.split('\n')) if (name) requestPrintings(name)
  }, [namesKey])

  // Your side of every trade, shown in the sidebar and on each friend's page.
  const myTrade = useMemo(
    () => myTradeSide(state.inventory, state.lists.filter((list) => list.kind === 'wishlist')),
    [state.inventory, state.lists]
  )

  // Card versions (Scryfall) are refreshed weekly; checked hourly.
  useEffect(() => {
    const timer = setInterval(refreshStalePrintings, 60 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // New Cardmarket prices are announced by the main process.
  useEffect(() => window.api.onPricesUpdated(() => void reloadPrices()), [])

  // Ctrl+K focuses the card search; Ctrl+Z undoes the latest edit, except while typing in a
  // text field, where it undoes the typing as usual.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        document.getElementById(CARD_SEARCH_ID)?.focus()
      } else if (key === 'z' && !event.shiftKey && !isTyping(event.target)) {
        event.preventDefault()
        showUndone(actions.undo())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, showUndone])

  /** New deck or wishlist from a precon. A deck is something you own, so its cards join the inventory. */
  const createFromPrecon = async (kind: ListKind, deck: PreconDeck, entries: PreconEntry[]) => {
    const name = preconListName(deck.name, state.lists.filter((list) => list.kind === kind).map((list) => list.name))
    // Commander precons start out in the Commander format, led by their (first) commander.
    const lines = parseList(entries.map(serializeCard).join('\n'))
    const format = deck.type === 'Commander Deck' ? 'commander' : null
    const leader = format ? deck.cards.find((card) => card.board === 'commander')?.name : undefined
    const text = serializeList(withCommander(withFormat(lines, format), leader ?? null))
    const created = await actions.createList(kind, name, text)
    if (kind === 'deck') actions.addOwned(entries)
    setPrecon(null)
    openList(created)
    toast(
      kind === 'deck'
        ? `Created deck “${created.name}” and added its ${cardCount(countCards(entries))} to your inventory`
        : `Created “${created.name}” with ${cardCount(countCards(entries))}`
    )
  }

  if (state.status === 'loading') return <div className="splash">Loading…</div>
  if (state.status === 'error') {
    return (
      <div className="splash">
        <p>Could not read your data folder.</p>
        <p className="warn">{state.error}</p>
      </div>
    )
  }

  const list = view?.page === 'list' ? state.lists.find((l) => sameList(l, view.list)) : undefined
  const trade = view?.page === 'trade' ? state.trades.find((t) => t.name === view.friend) : undefined
  const wishlists = state.lists.filter((l) => l.kind === 'wishlist')

  return (
    <div className="app">
      <Sidebar
        lists={state.lists}
        inventory={state.inventory}
        view={view}
        dataDir={state.dataDir}
        onSelect={setView}
        onNew={setCreating}
        onSettings={() => setSettingsOpen(true)}
        onCollectionValue={() => setValueOpen(true)}
        trades={state.trades}
        myTrade={myTrade}
        onShareTrade={() => setShareOpen(true)}
        onImportTrade={() => setImporting({})}
        onOpenDataDir={() => void window.api.openDataDir()}
        onChangeDataDir={() =>
          actions
            .chooseDataDir()
            .then((changed) => changed && toast('Data folder changed'))
            .catch((error) => onError(cleanError(error)))
        }
      />
      <main className="main">
        <PriceProgress />
        {view?.page === 'inventory' && (
          <InventoryView
            inventory={state.inventory}
            lists={state.lists}
            actions={actions}
            onOpenList={openList}
            onAddPrecon={() => setPrecon('deck')}
          />
        )}
        {list && (
          <ListView
            key={`${list.kind}/${list.name}`}
            list={list}
            inventory={state.inventory}
            actions={actions}
            onOpenList={openList}
          />
        )}
        {trade && (
          <TradeView
            key={trade.name}
            trade={trade}
            myTrade={myTrade}
            actions={actions}
            onOpenList={openList}
            onUpdate={() => setImporting({ replaceName: trade.name })}
            onRenamed={(name) => setView({ page: 'trade', friend: name })}
          />
        )}
        {view === null && (
          <div className="empty welcome">
            <h1>Welcome to MTG Dreams</h1>
            <p className="muted">
              Build decks from the cards you own, and plan wishlists with live Cardmarket prices.
            </p>
            <div className="welcome-actions">
              <button type="button" className="primary" onClick={() => setCreating('deck')}>
                New deck
              </button>
              <button type="button" onClick={() => setCreating('wishlist')}>
                New wishlist
              </button>
            </div>
          </div>
        )}
      </main>
      <HoverPreview />
      <HistorySync ready={state.status === 'ready'} lists={state.lists} inventory={state.inventory} />
      {creating && (
        <NewListDialog
          kind={creating}
          onClose={() => setCreating(null)}
          onFromPrecon={() => {
            setPrecon(creating)
            setCreating(null)
          }}
          onCreate={async (name, text, formatId, addToInventory) => {
            const lines = withFormat(parseList(text), formatId)
            const created = await actions.createList(creating, name, serializeList(lines))
            if (addToInventory) {
              actions.addOwned(
                cardLines(lines).map((line) => ({ name: line.name, qty: line.qty })),
                true
              )
            }
            setCreating(null)
            openList(created)
          }}
        />
      )}
      {precon && (
        <PreconDialog
          target={{ kind: precon === 'deck' ? 'new-deck' : 'new-list' }}
          onClose={() => setPrecon(null)}
          onAdd={(deck, entries) => createFromPrecon(precon, deck, entries)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {conflict && (
        <ConflictDialog
          name={conflict.name}
          onKeepMine={() => void actions.resolveConflict(true)}
          onLoadOther={() => void actions.resolveConflict(false)}
        />
      )}
      {valueOpen && <CollectionValueDialog inventory={state.inventory} onClose={() => setValueOpen(false)} />}
      {shareOpen && (
        <ShareTradeDialog inventory={state.inventory} wishlists={wishlists} onClose={() => setShareOpen(false)} />
      )}
      {importing && (
        <ImportTradeDialog
          existingNames={state.trades.map((t) => t.name)}
          replaceName={importing.replaceName}
          onClose={() => setImporting(null)}
          onImport={async (snapshot) => {
            const name = await actions.saveTrade(snapshot)
            setImporting(null)
            setView({ page: 'trade', friend: name })
            toast(`Imported ${name}'s trade list: ${cardCount(snapshot.haves.length)} they have, ${snapshot.wants.length} they want`)
          }}
        />
      )}
    </div>
  )
}
