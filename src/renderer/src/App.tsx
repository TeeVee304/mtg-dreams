import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cardLines, parseList, serializeList } from '@shared/decklist'
import { bundledBasic } from '@shared/basics'
import { copiesToAdd } from '@shared/copies'
import { withCommander, withFormat } from '@shared/formats'
import { preconListName, type PreconEntry } from '@shared/precons'
import { entriesToLines } from '@shared/sideboard'
import { myTradeSide } from '@shared/trade'
import type { ListKind, PreconDeck } from '@shared/types'
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
import { WantedView } from './components/WantedView'
import { Sidebar, type View } from './components/Sidebar'
import { useToast } from './components/Toasts'
import { useCopyPool } from './hooks/useCopyPool'
import { cardCount, cleanError, totalCopies } from './lib/format'
import { sameList, useLibrary, type ListRef, type UndoResult } from './stores/library'
import { refreshStalePrintings, reloadPrices, requestPrintings } from './stores/printings'
import { useSettings } from './stores/settings'

/** Total copies across entries. */
const countCards = (entries: PreconEntry[]) => entries.reduce((sum, entry) => sum + entry.qty, 0)

/** @returns Identity of a page, for remembering its scroll position. */
function pageKey(view: View | null): string {
  if (view === null) return 'welcome'
  if (view.page === 'list') return `list/${view.list.kind}/${view.list.name}`
  if (view.page === 'trade') return `trade/${view.friend}`
  return view.page
}

/** Input types that do not take text (and have no native undo). */
const NOT_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])

/** @returns Whether `target` is a text field (native Ctrl+Z applies). */
function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) return !NOT_TEXT_INPUTS.has(target.type)
  return target instanceof HTMLElement && target.isContentEditable
}

/**
 * Root component: library state, navigation, dialogs and global effects. Background effects: price
 * prefetch for all lists (active first; bundled basics skipped), hourly stale-printings refresh,
 * price reload on `prices:updated`. Shortcuts: Ctrl+K focuses card search; Ctrl+Z undoes the
 * latest edit outside text fields. Removals and bulk edits toast with Undo. Each page keeps its
 * scroll position for the session; a page not opened yet starts at the top.
 */
export default function App() {
  const toast = useToast()
  const onError = useCallback((message: string) => toast(message, 'error'), [toast])
  const showUndone = useCallback((result: UndoResult) => toast(result.message, result.kind), [toast])
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
  const [importing, setImporting] = useState<{ replaceName?: string } | null>(null)

  useEffect(() => {
    void actions.reload(true)
    return window.api.onWindowFocus(() => void actions.reload())
  }, [actions])

  const openList = (list: ListRef) => setView({ page: 'list', list })

  const mainRef = useRef<HTMLElement>(null)
  /** Scroll position of each page left this session, by {@link pageKey}. */
  const scrolls = useRef(new Map<string, number>())
  const shownPage = useRef(pageKey(view))
  const currentPage = pageKey(view)
  useLayoutEffect(() => {
    if (shownPage.current === currentPage) return
    shownPage.current = currentPage
    if (mainRef.current) mainRef.current.scrollTop = scrolls.current.get(currentPage) ?? 0
  }, [currentPage])

  useEffect(() => {
    if (state.status !== 'ready') return
    if (view?.page === 'inventory' || view?.page === 'wanted') return
    if (view?.page === 'list' && state.lists.some((list) => sameList(list, view.list))) return
    if (view?.page === 'trade' && state.trades.some((trade) => trade.name === view.friend)) return
    const first = state.lists[0]
    setView(first ? { page: 'list', list: { kind: first.kind, name: first.name } } : null)
  }, [state.status, state.lists, state.trades, view])

  const { bundleBasics, copies } = useSettings()
  const pool = useCopyPool(state.lists)
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

  const myTrade = useMemo(() => myTradeSide(state.inventory, state.lists, copies), [state.inventory, state.lists, copies])

  useEffect(() => {
    const timer = setInterval(refreshStalePrintings, 60 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => window.api.onPricesUpdated(() => void reloadPrices()), [])

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

  /**
   * Creates a list from a precon. Decks also add their cards to the inventory. Commander decks get
   * the Commander format and their first commander.
   */
  const createFromPrecon = async (kind: ListKind, deck: PreconDeck, entries: PreconEntry[]) => {
    const name = preconListName(deck.name, state.lists.filter((list) => list.kind === kind).map((list) => list.name))
    const lines = entriesToLines(entries)
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
      <main
        className="main"
        ref={mainRef}
        onScroll={(event) => scrolls.current.set(shownPage.current, event.currentTarget.scrollTop)}
      >
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
        {view?.page === 'wanted' && (
          <WantedView
            lists={state.lists}
            inventory={state.inventory}
            trades={state.trades}
            actions={actions}
            onOpenList={openList}
            onOpenTrade={(friend) => setView({ page: 'trade', friend })}
            onNew={setCreating}
          />
        )}
        {list && (
          <ListView
            key={`${list.kind}/${list.name}`}
            list={list}
            inventory={state.inventory}
            pool={pool}
            actions={actions}
            onOpenList={openList}
          />
        )}
        {trade && (
          <TradeView
            key={trade.name}
            trade={trade}
            myTrade={myTrade}
            pool={pool}
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
            const missing = addToInventory ? copiesToAdd(cardLines(lines), state.inventory, pool) : []
            if (missing.length > 0) actions.addOwned(missing)
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
        <ShareTradeDialog inventory={state.inventory} lists={state.lists} onClose={() => setShareOpen(false)} />
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
            toast(
              `Imported ${name}'s trade list: ${cardCount(totalCopies(snapshot.haves))} they have, ${cardCount(totalCopies(snapshot.wants))} they want`
            )
          }}
        />
      )}
    </div>
  )
}
