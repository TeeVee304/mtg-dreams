import { capEntries, type DeckFormat } from '@shared/formats'
import { listColor } from '@shared/listColor'
import type { ListAnalysis } from '@shared/listModel'
import { THEME_COLORS, type ThemeColor } from '@shared/themes'
import type { CardLine } from '@shared/types'
import { MANA_SYMBOLS, THEME_ICONS } from '../lib/artwork'
import { cardCount } from '../lib/format'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import type { Row } from '../lib/summary'
import { useSettings } from '../stores/settings'
import { CardDialog } from './CardDialog'
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
  | { kind: 'unown'; line: CardLine; inventoryQty: number; target: number }

/** Props of {@link ListDialogs}. */
interface ListDialogsProps {
  dialog: ListDialog | null
  onClose: () => void
  list: CardList
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
            const added = capped.entries.reduce((sum, e) => sum + e.qty, 0)
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
            ' This applies to every list.'
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
    case 'color': {
      const current = listColor(list.lines)
      const choose = (color: ThemeColor | null) => {
        actions.setListColor(list, color)
        onClose()
      }
      return (
        <Modal title={`${isDeck ? 'Deck' : 'List'} color`} size="medium" onClose={onClose}>
          <div className="color-options list-colors" role="radiogroup" aria-label="Color">
            <button
              type="button"
              role="radio"
              aria-checked={current === null}
              className={`color-option${current === null ? ' selected' : ''}`}
              onClick={() => choose(null)}
              title="Follow the app color (Settings)"
            >
              <img className="color-icon" src={THEME_ICONS[settings.color]} alt="" draggable={false} />
              <span className="color-label">Default</span>
            </button>
            {THEME_COLORS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={current === option.id}
                className={`color-option${current === option.id ? ' selected' : ''}`}
                onClick={() => choose(option.id)}
                title={`${option.label} (${option.look})`}
              >
                <img className="color-icon" src={THEME_ICONS[option.id]} alt="" draggable={false} />
                <span className="color-label">
                  <img className="color-mana" src={MANA_SYMBOLS[option.id]} alt="" draggable={false} />
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )
    }
    default:
      return null
  }
}
