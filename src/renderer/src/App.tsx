import { useCallback, useEffect, useMemo, useState } from 'react'
import { totalCopies } from '@shared/totals'
import { myTradeSide } from '@shared/trade'
import { AppDialogs, type AppDialog } from './components/AppDialogs'
import { HistorySync } from './components/HistorySync'
import { HoverPreview } from './components/HoverPreview'
import { InventoryView } from './components/InventoryView'
import { ListView } from './components/ListView'
import { PriceProgress } from './components/PriceProgress'
import { Sidebar, type View } from './components/Sidebar'
import { useToast } from './components/Toasts'
import { TradeView } from './components/TradeView'
import { WantedView } from './components/wanted/WantedView'
import { Welcome } from './components/Welcome'
import { useCopyPool } from './hooks/useCopyPool'
import { usePrices } from './hooks/usePrices'
import { useScrollMemory } from './hooks/useScrollMemory'
import { useShortcuts } from './hooks/useShortcuts'
import { sameList, useLibrary, type ListRef, type UndoResult } from './stores/library'
import { useSettings } from './stores/settings'

/** @returns Identity of a page, for remembering its scroll position. */
function pageKey(view: View | null): string {
  if (view === null) return 'welcome'
  if (view.page === 'list') return `list/${view.list.kind}/${view.list.name}`
  if (view.page === 'trade') return `trade/${view.friend}`
  return view.page
}

/**
 * Root component: library state, navigation between pages, and the one dialog open at a time.
 * Prices stay current through {@link usePrices}; shortcuts come from {@link useShortcuts}; each
 * page keeps its scroll position for the session. Removals and bulk edits toast with Undo.
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
  const [dialog, setDialog] = useState<AppDialog | null>(null)

  useEffect(() => {
    void actions.reload(true)
    return window.api.onWindowFocus(() => void actions.reload())
  }, [actions])

  // A page whose list or trade is gone falls back to the first list.
  useEffect(() => {
    if (state.status !== 'ready') return
    if (view?.page === 'inventory' || view?.page === 'wanted') return
    if (view?.page === 'list' && state.lists.some((list) => sameList(list, view.list))) return
    if (view?.page === 'trade' && state.trades.some((trade) => trade.name === view.friend)) return
    const first = state.lists[0]
    setView(first ? { page: 'list', list: { kind: first.kind, name: first.name } } : null)
  }, [state.status, state.lists, state.trades, view])

  const openList = (list: ListRef) => setView({ page: 'list', list })
  const openTrade = (friend: string) => setView({ page: 'trade', friend })
  const scroll = useScrollMemory<HTMLElement>(pageKey(view))
  const { copies } = useSettings()
  const pool = useCopyPool(state.lists)
  const { pricedAt, refreshPrices } = usePrices(state.lists, state.inventory, view?.page === 'list' ? view.list : null)
  const myTrade = useMemo(() => myTradeSide(state.inventory, state.lists, copies, pool), [state.inventory, state.lists, copies, pool])
  useShortcuts(useCallback(() => showUndone(actions.undo()), [actions, showUndone]))

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
  const newList = (kind: 'deck' | 'wishlist') => setDialog({ kind: 'new-list', list: kind })

  return (
    <div className="app">
      <Sidebar
        lists={state.lists}
        inventory={state.inventory}
        view={view}
        onSelect={setView}
        onNew={newList}
        onSettings={() => setDialog({ kind: 'settings' })}
        pricedAt={pricedAt}
        onRefreshPrices={refreshPrices}
        trades={state.trades}
        myTrade={myTrade}
        onShareTrade={() => setDialog({ kind: 'share-trade' })}
        onImportTrade={() => setDialog({ kind: 'import-trade' })}
        onWizard={() => setDialog({ kind: 'wizard' })}
        wizardOpen={dialog?.kind === 'wizard'}
      />
      <main className="main" ref={scroll.ref} onScroll={scroll.onScroll}>
        <PriceProgress />
        {view?.page === 'inventory' && (
          <InventoryView
            inventory={state.inventory}
            lists={state.lists}
            actions={actions}
            onOpenList={openList}
            onAddPrecon={() => setDialog({ kind: 'precon', list: 'deck' })}
            onValueDetails={() => setDialog({ kind: 'value' })}
            startPasting={view.paste}
          />
        )}
        {view?.page === 'wanted' && (
          <WantedView
            lists={state.lists}
            inventory={state.inventory}
            trades={state.trades}
            actions={actions}
            onOpenList={openList}
            onOpenTrade={openTrade}
            onNew={newList}
          />
        )}
        {list && <ListView key={`${list.kind}/${list.name}`} list={list} inventory={state.inventory} pool={pool} actions={actions} onOpenList={openList} />}
        {trade && (
          <TradeView
            key={trade.name}
            trade={trade}
            myTrade={myTrade}
            pool={pool}
            lists={state.lists}
            actions={actions}
            onOpenList={openList}
            onUpdate={() => setDialog({ kind: 'import-trade', replaceName: trade.name })}
            onRenamed={openTrade}
          />
        )}
        {view === null && (
          <Welcome
            owned={totalCopies(state.inventory.values())}
            onPaste={() => setView({ page: 'inventory', paste: true })}
            onAddPrecon={() => setDialog({ kind: 'precon', list: 'deck' })}
            onNew={newList}
            onWizard={() => setDialog({ kind: 'wizard' })}
          />
        )}
      </main>
      <HoverPreview />
      <HistorySync ready={state.status === 'ready'} lists={state.lists} inventory={state.inventory} />
      <AppDialogs
        dialog={dialog}
        setDialog={setDialog}
        state={state}
        actions={actions}
        conflict={conflict}
        pool={pool}
        myTrade={myTrade}
        pricedAt={pricedAt}
        onRefreshPrices={refreshPrices}
        onOpenList={openList}
        onOpenTrade={openTrade}
      />
    </div>
  )
}
