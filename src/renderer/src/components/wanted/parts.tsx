import { listId, type ListKey } from '@shared/copies'
import { listColor } from '@shared/listColor'
import type { ThemeColor } from '@shared/themes'
import type { WantedCard } from '@shared/wanted'
import { ui } from '@shared/text'
import type { CardList, ListRef } from '../../stores/library'
import { ListChip } from '../CardCells'
import { Icon } from '../Icon'

/**
 * Pieces shared by the Most Wanted tabs: the chips of the lists that want a card, and the Bought
 * button.
 *
 * @packageDocumentation
 */

/** List display data. */
export interface ListMeta {
  color: ThemeColor | null
}

/** List chip input: a list wanting a card. */
export interface ChipList extends ListKey {
  /** Copies the list wants. */
  wants?: number
  /** Copies the list lacks. */
  missing?: number
}

/** @returns Color of every list, by {@link listId}. */
export function listMetas(lists: CardList[]): Map<string, ListMeta> {
  return new Map(lists.map((list) => [listId(list), { color: listColor(list.lines) }]))
}

/** Props of {@link ListChips}. */
interface ListChipsProps {
  lists: ChipList[]
  meta: Map<string, ListMeta>
  onOpenList: (list: ListRef) => void
}

/** The lists that want a card, as chips that open them. */
export function ListChips({ lists, meta, onOpenList }: ListChipsProps) {
  return (
    <div className="chips">
      {lists.map((list) => {
        const info = meta.get(listId(list))
        return (
          <ListChip
            key={listId(list)}
            color={info?.color ?? null}
            onClick={() => onOpenList(list)}
            title={ui.wanted.listChip(list.kind === 'deck', list.name, list.wants, list.missing)}
          >
            {list.kind === 'deck' && <Icon name="deck" />}
            {list.name}
            {list.missing !== undefined && list.missing > 1 && ` · ${list.missing}`}
          </ListChip>
        )
      })}
    </div>
  )
}

/** Marks a card's copies to buy as bought. */
export function BoughtButton({ card, onBought }: { card: WantedCard; onBought: (card: WantedCard) => void }) {
  return (
    <button type="button" className="bought-btn" onClick={() => onBought(card)} title={ui.wanted.boughtHint(card.toBuy)} aria-label={ui.wanted.bought}>
      <Icon name="check" /> <span className="bought-label">{ui.wanted.bought}</span>
    </button>
  )
}
