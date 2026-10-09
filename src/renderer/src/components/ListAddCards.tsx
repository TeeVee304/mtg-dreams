import { useMemo, useState } from 'react'
import { bundledBasic } from '@shared/basics'
import type { CopyPool } from '@shared/copies'
import { nameKey } from '@shared/decklist'
import type { DeckFormat } from '@shared/formats'
import type { CopyCaps } from '@shared/listModel'
import type { InventoryItem } from '@shared/types'
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

/**
 * Adding cards to a list: search (decks search the inventory), then a panel for copies, printing
 * and sideboard, within the copies the format and inventory allow. Bundled basic lands go in at
 * once.
 */
export function ListAddCards(props: ListAddCardsProps) {
  const { list, inventory, pool, actions, format, copiesOf, capsFor, limitFor } = props
  const toast = useToast()
  const { bundleBasics } = useSettings()
  const isDeck = list.kind === 'deck'
  const noun = isDeck ? 'deck' : 'list'
  const [adding, setAddingState] = useState<string | null>(null)
  const setAdding = (name: string | null) => {
    setAddingState(name)
    props.onAdding(name !== null)
  }

  const inventoryChoices = useMemo<SearchChoice[]>(
    () =>
      [...inventory.values()].map((item) => {
        const inOther = pool.inOtherDecks(list, nameKey(item.name))
        return { name: item.name, hint: inOther > 0 ? `${item.qty} owned, ${Math.min(inOther, item.qty)} in other decks` : `${item.qty} owned` }
      }),
    [inventory, pool, list]
  )

  const pickCard = (name: string) => {
    const inList = copiesOf(name)
    if (capsFor(name).cap - inList <= 0) {
      toast(`${limitFor(name)}, and this ${noun} already has ${inList}.`, 'error')
      return
    }
    const generic = bundledBasic(name, bundleBasics)
    if (generic) {
      actions.addCards(list, [{ qty: 1, name: generic.info.name, foil: false }])
      toast(`Added 1× ${generic.info.name}`)
      return
    }
    setAdding(name)
  }

  const addCaps = adding ? capsFor(adding) : null
  const addInList = adding ? copiesOf(adding) : 0
  const addRoom = addCaps ? addCaps.cap - addInList : Infinity
  const addNote = [
    isDeck && addCaps && (addCaps.inOtherDecks > 0 ? `${addCaps.ownedCap} of your ${addCaps.ownedQty} free` : `You own ${addCaps.ownedCap}`),
    addInList > 0 && `${addInList} already in this ${noun}`,
    format && addCaps && Number.isFinite(addCaps.formatCap) && `${format.label}: max ${addCaps.formatCap}`
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className="search-row">
        {isDeck ? (
          <CardSearch placeholder="Add a card from your inventory…  (Ctrl+K)" choices={inventoryChoices} onPick={pickCard} />
        ) : (
          <>
            <CardSearch placeholder="Add a card to this list…  (Ctrl+K)" onPick={pickCard} />
            <button type="button" onClick={props.onAddPrecon}>
              Add precon…
            </button>
          </>
        )}
      </div>
      {adding && (
        <AddCardPanel
          key={adding}
          name={adding}
          maxQty={Number.isFinite(addRoom) ? addRoom : undefined}
          maxTitle={limitFor(adding)}
          note={addNote || undefined}
          actionLabel={isDeck ? 'Add to deck' : 'Add to list'}
          sideboardChoice={props.sideboardAllowed}
          onCancel={() => setAdding(null)}
          onAdd={(card, side) => {
            actions.addCards(list, [{ ...card, side }])
            setAdding(null)
            toast(`Added ${card.qty}× ${card.name}${side ? ' to the sideboard' : ''}`)
          }}
        />
      )}
    </>
  )
}
