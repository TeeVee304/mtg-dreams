import { useState } from 'react'
import { capEntries, type DeckFormat } from '@shared/formats'
import { listColor } from '@shared/listColor'
import { listPriority, PRIORITIES } from '@shared/listPriority'
import { upgradeTarget } from '@shared/listUpgrade'
import type { ListAnalysis } from '@shared/listModel'
import { totalCopies } from '@shared/totals'
import type { CardLine } from '@shared/types'
import { cardCount } from '../lib/format'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import type { Row } from '../lib/summary'
import { useSettings } from '../stores/settings'
import { CardDialog } from './CardDialog'
import { ColorOptions } from './Controls'
import { ConfirmDialog, PromptDialog, TextEditorDialog } from './Dialogs'
import { Modal } from './Modal'
import { PreconDialog } from './PreconDialog'
import { useToast } from './Toasts'

/** Dialog open on a list page; `unown` confirms reducing inventory below other lists' needs. */
export type ListDialog =
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'text' }
  | { kind: 'card'; lineId: string }
  | { kind: 'precon' }
  | { kind: 'color' }
  | { kind: 'priority' }
  | { kind: 'upgrade' }
  | { kind: 'unown'; line: CardLine; inventoryQty: number; target: number }

/** Props of {@link ListDialogs}. */
interface ListDialogsProps {
  dialog: ListDialog | null
  onClose: () => void
  list: CardList
  /** All decks and wishlists. */
  lists: CardList[]
  format: DeckFormat | null
  analysis: ListAnalysis<Row>
  rows: Row[]
  actions: LibraryActions
  /** Format copy limit per card; Infinity without a format. */
  formatCap: (name: string) => number
  /** Max quantity of a line; undefined if unlimited. */
  maxFor: (line: CardLine) => number | undefined
  /** Limit reason per card. */
  limitFor: (name: string) => string
  /** Called with the new ref after a rename. */
  onOpenList: (list: ListRef) => void
}

/** Renders the active list page dialog. Precon imports into a formatted list are capped to format limits. */
export function ListDialogs(props: ListDialogsProps) {
  const { dialog, onClose, list, format, analysis, actions, maxFor, limitFor } = props
  const toast = useToast()
  const settings = useSettings()
  const isDeck = list.kind === 'deck'
  const noun = isDeck ? 'deck' : 'list'
  const cardRow = dialog?.kind === 'card' ? props.rows.find((row) => row.line.id === dialog.lineId) : undefined

  switch (dialog?.kind) {
    case 'rename':
      return (
        <PromptDialog
          title={`Rename ${noun}`}
          label="Name"
          initial={list.name}
          confirmLabel="Rename"
          onClose={onClose}
          onSubmit={async (value) => {
            if (value.trim() !== list.name) props.onOpenList(await actions.renameList(list, value))
            onClose()
          }}
        />
      )
    case 'delete':
      return (
        <ConfirmDialog
          title={`Delete ${noun}`}
          message={`Move “${list.name}” to the Recycle Bin? ${isDeck ? 'Its cards stay in your inventory.' : 'Your inventory is not affected.'}`}
          confirmLabel="Delete"
          danger
          onClose={onClose}
          onConfirm={async () => {
            await actions.deleteList(list)
            toast(`Deleted ${list.name}`)
          }}
        />
      )
    case 'text':
      return (
        <TextEditorDialog
          title={`Edit “${list.name}” as text`}
          initial={list.text}
          mode="list"
          onClose={onClose}
          onSave={(text) => actions.replaceListText(list, text)}
        />
      )
    case 'card':
      return cardRow ? (
        <CardDialog
          row={cardRow}
          format={format}
          issue={analysis.issueOf(cardRow)}
          maxQty={maxFor(cardRow.line)}
          maxTitle={limitFor(cardRow.line.name)}
          onUpdate={(patch) => actions.updateCard(list, cardRow.line.id, patch)}
          board={
            format?.commander
              ? undefined
              : {
                  side: cardRow.side,
                  onMove: () => {
                    actions.moveCards(list, cardRow.bundledIds ?? [cardRow.line.id], !cardRow.side)
                    onClose()
                    toast(`Moved ${cardRow.line.name} to the ${cardRow.side ? 'main deck' : 'sideboard'}`)
                  }
                }
          }
          commander={
            format?.commander
              ? {
                  leads: analysis.isCommander(cardRow),
                  canLead: analysis.canBeCommander(cardRow),
                  onMake: () => {
                    actions.setListCommander(list, cardRow.line.name)
                    toast(`${cardRow.flavorName ?? cardRow.line.name} now leads this ${noun}`)
                  }
                }
              : undefined
          }
          onClose={onClose}
        />
      ) : null
    case 'precon':
      return (
        <PreconDialog
          target={{ kind: 'list', listName: list.name }}
          onClose={onClose}
          onAdd={(deck, entries) => {
            const capped = capEntries(entries, props.formatCap, analysis.copiesOf)
            actions.addCards(list, capped.entries)
            onClose()
            const added = totalCopies(capped.entries)
            toast(
              `Added ${cardCount(added)} from ${deck.name}` +
                (capped.skipped > 0
                  ? ` · skipped ${capped.skipped} extra ${capped.skipped === 1 ? 'copy' : 'copies'} (${format?.label} limit)`
                  : '')
            )
          }}
        />
      )
    case 'unown':
      return (
        <ConfirmDialog
          title="Update inventory"
          message={
            `You have ${dialog.inventoryQty}× ${dialog.line.name} in your inventory. ` +
            (dialog.target === 0 ? 'Remove all of them?' : `Reduce it to ${dialog.target}?`) +
            ' Other wishlists using it lose those copies too.'
          }
          confirmLabel={dialog.target === 0 ? 'Remove all' : `Reduce to ${dialog.target}`}
          danger
          onClose={onClose}
          onConfirm={() => {
            actions.setOwned(dialog.line.name, dialog.target)
            onClose()
          }}
        />
      )
    case 'color':
      return (
        <Modal title={`${isDeck ? 'Deck' : 'List'} color`} size="medium" onClose={onClose}>
          <ColorOptions
            value={listColor(list.lines)}
            inherit={settings.color}
            onChange={(color) => {
              actions.setListColor(list, color)
              onClose()
            }}
          />
        </Modal>
      )
    case 'priority': {
      const current = listPriority(list.lines)
      return (
        <Modal title="List priority" onClose={onClose}>
          <p className="muted small">
            How much this list's missing cards count when deciding what to buy, in Most Wanted and the budget
            planner.
          </p>
          <div className="theme-options" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={current === option.id}
                className={`theme-option${current === option.id ? ' selected' : ''}`}
                onClick={() => {
                  actions.setListPriority(list, option.id)
                  onClose()
                }}
              >
                <span className="theme-label">{option.id === 'high' ? `★ ${option.label}` : option.label}</span>
                <span className="muted tiny">{option.hint}</span>
              </button>
            ))}
          </div>
        </Modal>
      )
    }
    case 'upgrade':
      return <UpgradeDialog list={list} lists={props.lists} actions={actions} onClose={onClose} />
    default:
      return null
  }
}

/** Props of {@link UpgradeDialog}. */
interface UpgradeDialogProps {
  list: CardList
  lists: CardList[]
  actions: LibraryActions
  onClose: () => void
}

/** Picks the deck a wishlist upgrades, or none. */
function UpgradeDialog({ list, lists, actions, onClose }: UpgradeDialogProps) {
  const toast = useToast()
  const current = upgradeTarget(list, lists)?.name ?? ''
  const [deck, setDeck] = useState(current)
  const decks = lists.filter((other) => other.kind === 'deck')
  const save = () => {
    if (deck !== current) {
      actions.setUpgradeOf(list, deck || null)
      toast(deck ? `“${list.name}” is now an upgrade of ${deck}` : `“${list.name}” is a plain wishlist again`)
    }
    onClose()
  }
  return (
    <Modal
      title="Upgrade of…"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <p className="muted small">
        Make this list the whole deck as you want it to be after an upgrade. It uses the deck’s copies of the
        cards they share, so it only needs copies of its own for the rest. Once you own every card, you can apply
        it to the deck.
      </p>
      <label className="field">
        <span>Deck</span>
        <select autoFocus value={deck} onChange={(event) => setDeck(event.target.value)}>
          <option value="">None: a plain wishlist</option>
          {decks.map((other) => (
            <option key={other.name} value={other.name}>
              {other.name}
            </option>
          ))}
        </select>
      </label>
      {decks.length === 0 && <p className="muted small">You have no decks yet.</p>}
    </Modal>
  )
}
