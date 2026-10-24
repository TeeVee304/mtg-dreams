import { useMemo, useState, type ReactNode } from 'react'
import { bundledBasic } from '@shared/basics'
import type { CopyPool } from '@shared/copies'
import { nameKey } from '@shared/decklist'
import type { DeckFormat } from '@shared/formats'
import type { CopyCaps } from '@shared/listModel'
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
  /** Shows the precon dialog (wishlists). */
  onAddPrecon: () => void
  /** Called with whether the add panel is open, so the page can hide its empty note. */
  onAdding: (adding: boolean) => void
}

/** What {@link useCardAdder} gives: the search options and its pick, and the panel a pick opens. */
interface CardAdder {
  /** Decks: the inventory, to search instead of Scryfall; undefined for wishlists. */
  choices: SearchChoice[] | undefined
  pickCard: (name: string) => void
  /** Copies, printing and sideboard of the card picked; null when none is. */
  panel: ReactNode
}

/**
 * Adding cards to a list: a search pick (decks search the inventory) opens a panel for copies,
 * printing and sideboard, within the copies the format and inventory allow. Bundled basic lands go
 * in at once.
 */
export function useCardAdder(props: Omit<ListAddCardsProps, 'onAddPrecon'>): CardAdder {
  const { list, inventory, pool, actions, format, copiesOf, capsFor, limitFor } = props
  const toast = useToast()
  const { bundleBasics } = useSettings()
  const isDeck = list.kind === 'deck'
  const noun = ui.terms.noun(isDeck)
  const [adding, setAddingState] = useState<string | null>(null)
  const setAdding = (name: string | null) => {
    setAddingState(name)
    props.onAdding(name !== null)
  }

  const inventoryChoices = useMemo<SearchChoice[]>(
    () =>
      [...inventory.values()].map((item) => {
        const inOther = pool.inOtherDecks(list, nameKey(item.name))
        return { name: item.name, hint: ui.list.add.ownedHint(item.qty, Math.min(inOther, item.qty)) }
      }),
    [inventory, pool, list]
  )

  const pickCard = (name: string) => {
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
    isDeck && addCaps && (addCaps.inOtherDecks > 0 ? ui.list.add.free(addCaps.ownedCap, addCaps.ownedQty) : ui.list.add.youOwn(addCaps.ownedCap)),
    addInList > 0 && ui.list.add.alreadyIn(addInList, noun),
    format && addCaps && Number.isFinite(addCaps.formatCap) && ui.list.add.formatMax(format.label, addCaps.formatCap)
  ]
    .filter(Boolean)
    .join(' · ')

  const panel = adding && (
    <AddCardPanel
      key={adding}
      name={adding}
      maxQty={Number.isFinite(addRoom) ? addRoom : undefined}
      maxTitle={limitFor(adding)}
      note={addNote || undefined}
      actionLabel={ui.list.add.addTo(isDeck)}
      sideboardChoice={props.sideboardAllowed}
      onCancel={() => setAdding(null)}
      onAdd={(card, side) => {
        actions.addCards(list, [{ ...card, side }])
        setAdding(null)
        toast(ui.list.add.added(card.qty, card.name, side))
      }}
    />
  )
  return { choices: isDeck ? inventoryChoices : undefined, pickCard, panel }
}

/** Adding cards to a list ({@link useCardAdder}): the search, and wishlists' precon button. */
export function ListAddCards(props: ListAddCardsProps) {
  const { choices, pickCard, panel } = useCardAdder(props)
  return (
    <>
      <div className="search-row">
        {choices ? (
          <CardSearch placeholder={ui.list.add.searchInventory} choices={choices} onPick={pickCard} />
        ) : (
          <>
            <CardSearch placeholder={ui.list.add.searchAny} onPick={pickCard} />
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
