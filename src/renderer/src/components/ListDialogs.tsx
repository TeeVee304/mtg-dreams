import { useState } from 'react'
import { capEntries, listCommanders, type DeckFormat } from '@shared/formats'
import { listColor } from '@shared/listColor'
import { stripMeta, withMetaOf } from '@shared/listMeta'
import { upgradeTarget, upgradeVersion } from '@shared/listUpgrade'
import {
  BASE,
  baseLabel,
  baseText,
  findVariant,
  hasVariant,
  listVariants,
  sameVersion,
  variantText,
  versionNameIssue,
  withBaseText,
  type ListVersion,
  type Variant
} from '@shared/listVersion'
import { serializeList } from '@shared/decklist'
import type { ListAnalysis } from '@shared/listModel'
import { totalCopies } from '@shared/totals'
import type { CardLine } from '@shared/types'
import { ui } from '@shared/text'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import type { Row } from '../lib/summary'
import { useSettings } from '../stores/settings'
import { CardDialog } from './CardDialog'
import { ColorOptions } from './Controls'
import { ConfirmDialog, PromptDialog, TextEditorDialog } from './Dialogs'
import { Modal } from './Modal'
import { PreconDialog } from './PreconDialog'
import { StartingHand } from './StartingHand'
import { useToast } from './Toasts'

/** Dialog open on a list page; `unown` confirms reducing inventory below other lists' needs. */
export type ListDialog =
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'text' }
  | { kind: 'card'; lineId: string }
  | { kind: 'precon' }
  /** A starting hand of the shown version. */
  | { kind: 'hand' }
  | { kind: 'color' }
  | { kind: 'upgrade' }
  | { kind: 'unown'; line: CardLine; inventoryQty: number; target: number }
  /** Confirms deleting one of the list's versions, and its `swaps`. */
  | { kind: 'variant-off'; variant: Variant; swaps: number }
  /** Confirms a new format (named `label`), which deletes the list's other-format version and its `swaps`. */
  | { kind: 'variant-format'; formatId: string | null; label: string; variant: Variant; swaps: number }
  /** Names a new version, or renames `version`. */
  | { kind: 'version-name'; version: ListVersion | null }

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
  /** The version the page shows; null for the list itself. */
  shownVariant?: Variant | null
  /** Shows a version: one just added or renamed, or the list itself after its version is deleted. */
  onVersion: (version: ListVersion) => void
}

/** Renders the active list page dialog. Precon imports into a formatted list are capped to format limits. */
export function ListDialogs(props: ListDialogsProps) {
  const { dialog, onClose, list, format, analysis, actions, maxFor, limitFor } = props
  const toast = useToast()
  const settings = useSettings()
  const isDeck = list.kind === 'deck'
  const noun = ui.terms.noun(isDeck)
  const text = ui.listDialogs
  const cardRow = dialog?.kind === 'card' ? props.rows.find((row) => row.line.id === dialog.lineId) : undefined

  switch (dialog?.kind) {
    case 'rename':
      return (
        <PromptDialog
          title={text.rename(noun)}
          label={text.name}
          initial={list.name}
          confirmLabel={text.renameConfirm}
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
          title={text.delete(noun)}
          message={text.deleteMessage(list.name, isDeck)}
          confirmLabel={text.deleteConfirm}
          danger
          onClose={onClose}
          onConfirm={async () => {
            await actions.deleteList(list)
            toast(text.deleted(list.name))
          }}
        />
      )
    case 'text': {
      // In a version's view, the editor holds that version's cards; saving turns them into its swaps.
      const shown = props.shownVariant
      return shown ? (
        <TextEditorDialog
          title={text.editVersion(shown.label, list.name)}
          initial={variantText(list.lines, shown.label)}
          mode="list"
          copied={ui.list.versionCopied(shown.label)}
          onClose={onClose}
          onSave={(text) => actions.replaceVariantText(list, shown.label, text)}
        />
      ) : hasVariant(list.lines) ? (
        // The list itself, without its versions, which come back on save.
        <TextEditorDialog
          title={text.edit(list.name)}
          initial={stripMeta(baseText(list.lines))}
          mode="list"
          copied={ui.list.copied(isDeck)}
          onClose={onClose}
          onSave={(text) => actions.replaceListText(list, serializeList(withBaseText(list.lines, withMetaOf(text, list.text))))}
        />
      ) : (
        // The deck only: personal settings (color, upgrade…) stay, unless the text sets its own.
        <TextEditorDialog
          title={text.edit(list.name)}
          initial={stripMeta(list.text)}
          mode="list"
          copied={ui.list.copied(isDeck)}
          onClose={onClose}
          onSave={(text) => actions.replaceListText(list, withMetaOf(text, list.text))}
        />
      )
    }
    case 'hand':
      return <StartingHand rows={props.rows.filter((row) => !row.side && !analysis.isCommander(row))} onClose={onClose} />
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
                    toast(text.moved(cardRow.line.name, !cardRow.side))
                  }
                }
          }
          commander={
            format?.commander
              ? {
                  leads: analysis.isCommander(cardRow),
                  canLead: analysis.canBeCommander(cardRow),
                  onMake: () => {
                    actions.setListCommanders(list, [cardRow.line.name])
                    toast(ui.list.nowLeads(cardRow.flavorName ?? cardRow.line.name, noun))
                  },
                  onJoin: analysis.canJoin(cardRow)
                    ? () => {
                        const [leader] = listCommanders(list.lines)
                        actions.setListCommanders(list, [leader, cardRow.line.name])
                        toast(ui.list.sharesCommand(cardRow.flavorName ?? cardRow.line.name, leader))
                      }
                    : undefined
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
            toast(text.addedFrom(added, deck.name, capped.skipped, format?.label ?? null))
          }}
        />
      )
    case 'unown':
      return (
        <ConfirmDialog
          title={text.unown.title}
          message={text.unown.message(dialog.inventoryQty, dialog.line.name, dialog.target)}
          confirmLabel={text.unown.confirm(dialog.target)}
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
        <Modal title={text.color(isDeck)} size="medium" onClose={onClose}>
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
    case 'upgrade':
      return <UpgradeDialog list={list} lists={props.lists} actions={actions} onClose={onClose} />
    case 'variant-off':
      return (
        <ConfirmDialog
          title={text.deleteVersion.title(dialog.variant.label)}
          message={text.deleteVersion.message(dialog.swaps, baseLabel(list.lines))}
          confirmLabel={text.deleteVersion.confirm(dialog.variant.label)}
          danger
          onClose={onClose}
          onConfirm={() => {
            actions.deleteVersion(list, dialog.variant.label)
            props.onVersion(BASE)
            onClose()
          }}
        />
      )
    case 'version-name': {
      const renaming = dialog.version
      return (
        <PromptDialog
          title={renaming ? text.versionName.rename(renaming) : text.versionName.add}
          label={renaming ? text.name : text.versionName.label}
          initial={renaming ?? ''}
          confirmLabel={renaming ? text.renameConfirm : text.versionName.addConfirm}
          onClose={onClose}
          onSubmit={(value) => {
            const name = value.trim()
            if (renaming && sameVersion(renaming, name) && renaming === name) return onClose()
            const issue = versionNameIssue(list.lines, name, renaming)
            if (issue) throw new Error(issue)
            if (renaming) actions.renameVersion(list, renaming, name)
            else {
              actions.addVersion(list, name)
              toast(ui.list.versionAdded(list.name, name))
            }
            props.onVersion(name)
            onClose()
          }}
        />
      )
    }
    case 'variant-format':
      return (
        <ConfirmDialog
          title={text.changeFormat.title(dialog.label)}
          message={text.changeFormat.message(dialog.variant.label, baseLabel(list.lines), noun, dialog.swaps)}
          confirmLabel={text.changeFormat.confirm}
          danger
          onClose={onClose}
          onConfirm={() => {
            actions.setListFormat(list, dialog.formatId)
            onClose()
          }}
        />
      )
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


/** Separates a deck name from its version in the picker's option values. */
const VERSION_MARK = '\u0000'

/** Picks the deck a wishlist upgrades (or one of its versions: Duel, a named one), or none. */
function UpgradeDialog({ list, lists, actions, onClose }: UpgradeDialogProps) {
  const toast = useToast()
  const target = upgradeTarget(list, lists)
  const targetVariant = target ? findVariant(target.lines, upgradeVersion(list.lines)) : null
  const current = target ? target.name + (targetVariant ? VERSION_MARK + targetVariant.label : '') : ''
  const [choice, setChoice] = useState(current)
  const decks = lists.filter((other) => other.kind === 'deck')
  const save = () => {
    if (choice !== current) {
      const [deck, variant] = choice.split(VERSION_MARK)
      actions.setUpgradeOf(list, deck || null, variant || null)
      toast(
        deck ? ui.listDialogs.upgrade.upgradeOf(list.name, deck, variant || null) : ui.listDialogs.upgrade.plain(list.name)
      )
    }
    onClose()
  }
  return (
    <Modal
      title={ui.listDialogs.upgrade.title}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className="primary" onClick={save}>
            {ui.dialogs.save}
          </button>
        </>
      }
    >
      <p className="muted small">{ui.listDialogs.upgrade.hint}</p>
      <label className="field">
        <span>{ui.listDialogs.upgrade.deck}</span>
        <select autoFocus value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="">{ui.listDialogs.upgrade.none}</option>
          {decks.flatMap((other) => [
            <option key={other.name} value={other.name}>
              {other.name}
            </option>,
            ...listVariants(other.lines).map((variant) => (
              <option key={`${other.name} ${variant.label}`} value={other.name + VERSION_MARK + variant.label}>
                {other.name} · {variant.label}
              </option>
            ))
          ])}
        </select>
      </label>
      {decks.length === 0 && <p className="muted small">{ui.listDialogs.upgrade.noDecks}</p>}
    </Modal>
  )
}
