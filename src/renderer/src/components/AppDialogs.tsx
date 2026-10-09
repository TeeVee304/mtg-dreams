import { copiesToAdd, type CopyPool } from '@shared/copies'
import { cardLines, parseList, serializeList } from '@shared/decklist'
import { withCommander, withFormat } from '@shared/formats'
import { preconListName, type PreconEntry } from '@shared/precons'
import { entriesToLines } from '@shared/sideboard'
import { totalCopies } from '@shared/totals'
import type { MyTradeSide } from '@shared/trade'
import type { ListKind, PreconDeck } from '@shared/types'
import { DeckWizardDialog } from '../features/deckWizard'
import { cardCount, cleanError } from '../lib/format'
import type { LibraryActions, LibraryState, ListRef } from '../stores/library'
import { CollectionValueDialog } from './CollectionValue'
import { ConflictDialog, NewListDialog } from './Dialogs'
import { PreconDialog } from './PreconDialog'
import { SettingsDialog } from './SettingsDialog'
import { useToast } from './Toasts'
import { ImportTradeDialog, ShareTradeDialog } from './TradeDialogs'

/** The dialog open over the app, if any. */
export type AppDialog =
  | { kind: 'new-list'; list: ListKind }
  | { kind: 'precon'; list: ListKind }
  | { kind: 'settings' }
  | { kind: 'value' }
  | { kind: 'share-trade' }
  | { kind: 'import-trade'; replaceName?: string }
  | { kind: 'wizard' }

/** Props of {@link AppDialogs}. */
interface AppDialogsProps {
  dialog: AppDialog | null
  setDialog: (dialog: AppDialog | null) => void
  state: LibraryState
  actions: LibraryActions
  conflict: { name: string } | null
  pool: CopyPool
  myTrade: MyTradeSide
  pricedAt: number | null
  onRefreshPrices: () => Promise<void>
  onOpenList: (list: ListRef) => void
  onOpenTrade: (friend: string) => void
}

/**
 * The app's dialogs, one at a time, plus the conflict prompt: new lists, precons, settings,
 * collection value, trade lists and the Deck Wizard. Each says what it did with a toast.
 */
export function AppDialogs(props: AppDialogsProps) {
  const { dialog, setDialog, state, actions, conflict, pool, myTrade, onOpenList, onOpenTrade } = props
  const toast = useToast()
  const close = () => setDialog(null)

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
    close()
    onOpenList(created)
    toast(
      kind === 'deck'
        ? `Created deck “${created.name}” and added its ${cardCount(totalCopies(entries))} to your inventory`
        : `Created “${created.name}” with ${cardCount(totalCopies(entries))}`
    )
  }

  const changeDataDir = () =>
    actions
      .chooseDataDir()
      .then((changed) => changed && toast('Data folder changed'))
      .catch((error) => toast(cleanError(error), 'error'))

  return (
    <>
      {dialog?.kind === 'new-list' && (
        <NewListDialog
          kind={dialog.list}
          onClose={close}
          onFromPrecon={() => setDialog({ kind: 'precon', list: dialog.list })}
          onWizard={dialog.list === 'wishlist' ? () => setDialog({ kind: 'wizard' }) : undefined}
          onCreate={async (name, text, formatId, addToInventory) => {
            const lines = withFormat(parseList(text), formatId)
            const created = await actions.createList(dialog.list, name, serializeList(lines))
            const missing = addToInventory ? copiesToAdd(cardLines(lines), state.inventory, pool) : []
            if (missing.length > 0) actions.addOwned(missing)
            close()
            onOpenList(created)
          }}
        />
      )}
      {dialog?.kind === 'precon' && (
        <PreconDialog
          target={{ kind: dialog.list === 'deck' ? 'new-deck' : 'new-list' }}
          onClose={close}
          onAdd={(deck, entries) => createFromPrecon(dialog.list, deck, entries)}
        />
      )}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          onClose={close}
          dataDir={state.dataDir}
          onOpenDataDir={() => void window.api.openDataDir()}
          onChangeDataDir={changeDataDir}
          pricedAt={props.pricedAt}
          onRefreshPrices={props.onRefreshPrices}
        />
      )}
      {dialog?.kind === 'value' && <CollectionValueDialog inventory={state.inventory} onClose={close} />}
      {dialog?.kind === 'wizard' && (
        <DeckWizardDialog
          onClose={close}
          wishlistNames={state.lists.filter((l) => l.kind === 'wishlist').map((l) => l.name)}
          onCreate={async (name, text, cards) => {
            const created = await actions.createList('wishlist', name, text)
            close()
            onOpenList(created)
            toast(`Created wishlist “${created.name}” with ${cardCount(cards)}`)
          }}
        />
      )}
      {dialog?.kind === 'share-trade' && <ShareTradeDialog myTrade={myTrade} onClose={close} />}
      {dialog?.kind === 'import-trade' && (
        <ImportTradeDialog
          existingNames={state.trades.map((t) => t.name)}
          replaceName={dialog.replaceName}
          onClose={close}
          onImport={async (snapshot) => {
            const name = await actions.saveTrade(snapshot)
            close()
            onOpenTrade(name)
            toast(
              `Imported ${name}'s trade list: ${cardCount(totalCopies(snapshot.haves))} they have, ${cardCount(totalCopies(snapshot.wants))} they want`
            )
          }}
        />
      )}
      {conflict && (
        <ConflictDialog
          name={conflict.name}
          onKeepMine={() => void actions.resolveConflict(true)}
          onLoadOther={() => void actions.resolveConflict(false)}
        />
      )}
    </>
  )
}
