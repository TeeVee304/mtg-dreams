import { useMemo, useState, type ReactNode } from 'react'
import { bundledBasic } from '@shared/basics'
import type { CopyPool } from '@shared/copies'
import { nameKey } from '@shared/decklist'
import { holdsNoCopies, type DeckFormat } from '@shared/formats'
import type { CopyCaps } from '@shared/listModel'
import type { Board } from '@shared/sideboard'
import type { InventoryItem } from '@shared/types'
import { ui } from '@shared/text'
import type { CardList, LibraryActions } from '../stores/library'
import { useSettings } from '../stores/settings'
import { AddCardPanel } from './CardEditors'
import { CardSearch, type SearchChoice } from './CardSearch'
import { useToast } from './Toasts'

/** Props of {@link ListAddCards}. */
interface ListAddCardsProps {
  list: CardList
  inventory: Map<string, InventoryItem>
  pool: CopyPool
  actions: LibraryActions
  format: DeckFormat | null
  /** Copies of a card already in the list. */
  copiesOf: (name: string) => number
  capsFor: (name: string) => CopyCaps
  limitFor: (name: string) => string
  /** Whether the list's format allows a sideboard. */
  sideboardAllowed: boolean
  /** Whether Cards can go to the maybeboard (not in a swap table). */
  maybeboard?: boolean
  /** Shows the precon dialog (wishlists). */
  onAddPrecon: () => void
  /** Called with whether the add panel is open, so the page can hide its empty note. */
  onAdding: (adding: boolean) => void
}

/** What {@link useCardAdder} gives: the search options and its pick, and the panel a pick opens. */
interface CardAdder {
  /** Decks: the inventory, to search instead of Scryfall; undefined for wishlists. */
  choices: SearchChoice[] | undefined
  /** @param maybe - Picked to consider: it goes to the maybeboard, whatever you own. */
  pickCard: (name: string, maybe?: boolean) => void
  /** Copies, printing and board of the card picked; null when none is. */
  panel: ReactNode
}

/**
 * Adding cards to a list: a search pick (decks search the inventory) opens a panel for copies,
 * printing and board, within the copies the format and inventory allow; the maybeboard takes any
 * Card, as many as you like. Bundled basic lands go in at once.
 */
export function useCardAdder(props: Omit<ListAddCardsProps, 'onAddPrecon'>): CardAdder {
  const { list, inventory, pool, actions, format, copiesOf, capsFor, limitFor } = props
  const toast = useToast()
  const { bundleBasics } = useSettings()
  const isDeck = list.kind === 'deck'
  /** A Deck built from your copies: an Arena one takes any Card. */
  const paperDeck = isDeck && !holdsNoCopies(format)
  const noun = ui.terms.noun(isDeck)
  /** The Card picked, and whether it was picked for the maybeboard. */
  const [picked, setPicked] = useState<{ name: string; maybe: boolean } | null>(null)
  const adding = picked?.name ?? null
  const setAdding = (name: string | null, maybe = false) => {
    setPicked(name === null ? null : { name, maybe })
    props.onAdding(name !== null)
  }
  const boards: Board[] = picked?.maybe
    ? ['maybe']
    : ['main', ...(props.sideboardAllowed ? (['side'] as const) : []), ...(props.maybeboard ? (['maybe'] as const) : [])]

  const inventoryChoices = useMemo<SearchChoice[]>(
    () =>
      [...inventory.values()].map((item) => {
        const inOther = pool.inOtherDecks(list, nameKey(item.name))
        return { name: item.name, hint: ui.list.add.ownedHint(item.qty, Math.min(inOther, item.qty)) }
      }),
    [inventory, pool, list]
  )

  const pickCard = (name: string, maybe = false) => {
    if (maybe) {
      setAdding(name, true)
      return
    }
    const inList = copiesOf(name)
    if (capsFor(name).cap - inList <= 0) {
      toast(ui.list.add.full(limitFor(name), noun, inList), 'error')
      return
    }
    const generic = bundledBasic(name, bundleBasics)
    if (generic) {
      actions.addCards(list, [{ qty: 1, name: generic.info.name, foil: false }])
      toast(ui.list.add.addedOne(generic.info.name))
      return
    }
    setAdding(name)
  }

  const addCaps = adding ? capsFor(adding) : null
  const addInList = adding ? copiesOf(adding) : 0
  const addRoom = addCaps ? addCaps.cap - addInList : Infinity
  const addNote = [
    paperDeck && addCaps && (addCaps.inOtherDecks > 0 ? ui.list.add.free(addCaps.ownedCap, addCaps.ownedQty) : ui.list.add.youOwn(addCaps.ownedCap)),
    addInList > 0 && ui.list.add.alreadyIn(addInList, noun),
    format && addCaps && Number.isFinite(addCaps.formatCap) && ui.list.add.formatMax(format.label, addCaps.formatCap)
  ]
    .filter(Boolean)
    .join(' · ')

  const panel = adding && (
    <AddCardPanel
      key={`${adding}/${picked?.maybe}`}
      name={adding}
      maxQty={Number.isFinite(addRoom) ? addRoom : undefined}
      maxTitle={limitFor(adding)}
      note={addNote || undefined}
      actionLabel={picked?.maybe ? ui.list.add.addToMaybeboard : ui.list.add.addTo(isDeck)}
      boards={boards}
      onCancel={() => setAdding(null)}
      onAdd={(card, board) => {
        actions.addCards(list, [{ ...card, board }])
        setAdding(null)
        toast(ui.list.add.added(card.qty, card.name, board === 'main' ? null : ui.boards.inSentence[board]))
      }}
    />
  )
  return { choices: paperDeck ? inventoryChoices : undefined, pickCard, panel }
}

/** Adding cards to a list ({@link useCardAdder}): the search, and wishlists' precon button. */
export function ListAddCards(props: ListAddCardsProps) {
  const { choices, pickCard, panel } = useCardAdder(props)
  return (
    <>
      <div className="search-row">
        {props.list.kind === 'deck' ? (
          <>
            {/* A paper Deck adds from your Inventory; an Arena Deck, any Card. */}
            {choices ? (
              <CardSearch placeholder={ui.list.add.searchInventory} choices={choices} onPick={(name) => pickCard(name)} />
            ) : (
              <CardSearch placeholder={ui.list.add.searchAny} onPick={(name) => pickCard(name)} />
            )}
            <CardSearch placeholder={ui.list.add.searchMaybe} onPick={(name) => pickCard(name, true)} />
          </>
        ) : (
          <>
            <CardSearch placeholder={ui.list.add.searchAny} onPick={(name) => pickCard(name)} />
            <button type="button" onClick={props.onAddPrecon}>
              {ui.list.add.addPrecon}
            </button>
          </>
        )}
      </div>
      {panel}
    </>
  )
}
