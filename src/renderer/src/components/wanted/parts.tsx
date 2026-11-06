import { listId, type ListKey } from '@shared/copies'
import { listColor } from '@shared/listColor'
import { daysSince, type OrderStamp } from '@shared/ordered'
import type { ThemeColor } from '@shared/themes'
import type { WantedCard } from '@shared/wanted'
import { ui } from '@shared/text'
import { formatIsoDate } from '../../lib/format'
import type { CardList, ListRef } from '../../stores/library'
import { ListChip } from '../CardCells'
import { Icon } from '../Icon'

/**
 * Pieces shared by the Most Wanted tabs: the chips of the lists that want a card, the Bought
 * button, and the Ordered stamp with its button.
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

/** Stamps in motion, by card key. */
export interface StampMotion {
  /** Ordered stamps landing. */
  landing: ReadonlySet<string>
  /** Ordered stamps lifting off. */
  lifting: ReadonlySet<string>
  /** Acquired stamps showing, before their copies go to the Inventory. */
  acquiring: ReadonlySet<string>
  /** Acquired stamps lifting off: undone in time. */
  unacquiring: ReadonlySet<string>
}

/** Props of {@link BoughtButton}. */
interface BoughtButtonProps {
  card: WantedCard
  onBought: (card: WantedCard) => void
  /** Its Acquired stamp shows: clicking again undoes it. */
  pressed?: boolean
  disabled?: boolean
}

/** Marks a card's copies to buy as acquired; pressed while its stamp shows, when a click undoes it. */
export function BoughtButton({ card, onBought, pressed, disabled }: BoughtButtonProps) {
  return (
    <button
      type="button"
      className="bought-btn"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={() => onBought(card)}
      title={pressed ? ui.wanted.unacquireHint : ui.wanted.boughtHint(card.toBuy)}
      aria-label={ui.wanted.bought}
    >
      <Icon name="check" /> <span className="bought-label">{ui.wanted.bought}</span>
    </button>
  )
}

/** Props of {@link StampButton}. */
interface StampButtonProps {
  card: WantedCard
  /** Every copy still to buy is ordered: the button is pressed. */
  stamped: boolean
  onStamp: (card: WantedCard) => void
  /** The card is being acquired. */
  disabled?: boolean
}

/** Stamps a card's copies to buy as ordered, or removes the stamp. */
export function StampButton({ card, stamped, onStamp, disabled }: StampButtonProps) {
  return (
    <button
      type="button"
      className="stamp-btn"
      disabled={disabled}
      aria-pressed={stamped}
      onClick={() => onStamp(card)}
      title={stamped ? ui.wanted.unstampHint : ui.wanted.orderedHint(card.toBuy)}
      aria-label={ui.wanted.ordered}
    >
      <Icon name="stamp" /> <span className="bought-label">{ui.wanted.ordered}</span>
    </button>
  )
}

/** @returns How long ago a stamp was set, e.g. `Ordered 3 days ago`. */
export const orderedAgo = (stamp: OrderStamp, today: string) => ui.wanted.orderedAgo(daysSince(stamp.date, today))

/** Props of {@link OrderStampMark}. */
interface OrderStampMarkProps {
  stamp: OrderStamp
  /** Copies it covers. */
  qty: number
  today: string
  /** Just stamped: it lands with the stamp animation. */
  fresh: boolean
  /** An Acquired stamp lands over it: it fades back, still in view. */
  dim?: boolean
  /** It lifts off: its landing, backwards. */
  lifting?: boolean
}

/** The Acquired stamp, landing over a row as its copies go to the Inventory, or `lifting` off when undone. */
export function AcquiredStampMark({ qty, today, lifting }: { qty: number; today: string; lifting: boolean }) {
  return (
    <span className={`order-stamp acquired ${lifting ? 'lift' : 'fresh'}`}>
      <span className="order-stamp-word">{ui.wanted.bought}</span>
      <span className="order-stamp-line">{ui.wanted.stampLine(qty, formatIsoDate(today))}</span>
    </span>
  )
}

/** The Ordered stamp over a row whose copies to buy are all ordered. */
export function OrderStampMark({ stamp, qty, today, fresh, dim, lifting }: OrderStampMarkProps) {
  const motion = lifting ? ' lift' : fresh ? ' fresh' : ''
  return (
    <span className={`order-stamp${motion}${dim ? ' dim' : ''}`} title={orderedAgo(stamp, today)}>
      <span className="order-stamp-word">{ui.wanted.ordered}</span>
      <span className="order-stamp-line">{ui.wanted.stampLine(qty, formatIsoDate(stamp.date))}</span>
    </span>
  )
}
