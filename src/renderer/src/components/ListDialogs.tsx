import { useState } from 'react'
import { capEntries, listCommanders, namedPartner, type DeckFormat } from '@shared/formats'
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
import { unownedCards } from '@shared/copies'
import { countLines, nameKey, parseList, serializeCard, serializeList } from '@shared/decklist'
import { withPreferredPrintings } from '@shared/listPreference'
import type { ListAnalysis } from '@shared/listModel'
import type { Board } from '@shared/sideboard'
import { totalCopies } from '@shared/totals'
import type { CardLine, InventoryItem } from '@shared/types'
import { ui } from '@shared/text'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import type { Row } from '../lib/summary'
import { useCopy } from '../hooks/useCopy'
import { useSettings } from '../stores/settings'
import { CardDialog } from './CardDialog'
import { ColorOptions } from './Controls'
import { ConfirmDialog, PromptDialog, TextEditorDialog } from './Dialogs'
import { Modal } from './Modal'
import { PreconDialog } from './PreconDialog'
import { PreferredVersionsDialog } from './PreferredVersionsDialog'
import { StartingHand } from './StartingHand'
import { SubstituteDialog } from './SubstituteDialog'
import { useToast } from './Toasts'

/** Dialog open on a list page; `unown` confirms reducing inventory below other lists' needs. */
export type ListDialog =
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'text' }
  | { kind: 'card'; lineId: string }
  /** Reviews a substitute or stand-in ({@link SubstituteDialog}). */
  | { kind: 'substitute'; lineId: string }
  | { kind: 'precon' }
  /** A starting hand of the shown version. */
  | { kind: 'hand' }
  | { kind: 'color' }
  | { kind: 'upgrade' }
  /** Picks the set group whose Versions the list prefers. */
  | { kind: 'preferred' }
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
  /** Owned copies of a card (by nameKey) the list may use: those the lists ahead leave. */
  freeCopies: (key: string) => number
  /** Items by nameKey. */
  inventory: Map<string, InventoryItem>
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
  const copy = useCopy()
  /** Printing each Card shows from the list's Preferred Versions, by nameKey. */
  const preferred = new Map(
    props.rows.flatMap((row) => (row.preferredFrom && row.resolution?.printing ? [[nameKey(row.line.name), row.resolution.printing] as const] : []))
  )
  /** Editor text as copied: with the Preferred Versions written in, so a site it's pasted into gets them. */
  const copyText = (text: string) => (preferred.size === 0 ? text : serializeList(withPreferredPrintings(parseList(text), preferred)))
  /** Copies the Cards of the editor's text you don't own, as many as are missing. */
  const copyUnowned = (text: string) => {
    const cards = unownedCards(parseList(text), props.freeCopies)
    // Cards showing a Preferred Version carry it, so a wants list asks for that Version.
    const lines = cards.map((card) => {
      const pick = preferred.get(nameKey(card.name))
      return pick ? serializeCard({ ...card, set: pick.set, collector: pick.collectorNumber, foil: false }) : countLines([card])[0]
    })
    if (cards.length === 0) toast(ui.dialogs.editor.allOwned)
    else void copy(lines.join('\n'), ui.dialogs.editor.unownedCopied(totalCopies(cards)))
  }
  /**
   * The card's board and where it can move: the main deck, the sideboard (not in commander formats)
   * and the maybeboard. Commanders stay; a version's view moves only maybeboard Cards, as the
   * maybeboard is the list's.
   */
  const cardBoard = (row: Row): { current: Board; options: Board[] } | undefined => {
    const current: Board = row.maybe ? 'maybe' : row.side ? 'side' : 'main'
    if (analysis.isCommander(row) || (props.shownVariant && current !== 'maybe')) return undefined
    const boards: Board[] = ['main', ...(format?.commander ? [] : (['side'] as const)), 'maybe']
    return { current, options: boards.filter((board) => board !== current) }
  }

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
          onCopyUnowned={copyUnowned}
          copyText={copyText}
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
          onCopyUnowned={copyUnowned}
          copyText={copyText}
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
          onCopyUnowned={copyUnowned}
          copyText={copyText}
          copied={ui.list.copied(isDeck)}
          onClose={onClose}
          onSave={(text) => actions.replaceListText(list, withMetaOf(text, list.text))}
        />
      )
    }
    case 'hand':
      return (
        <StartingHand
          rows={props.rows.filter((row) => !row.side && !row.maybe && !analysis.isCommander(row) && !analysis.isCompanion(row))}
          onClose={onClose}
        />
      )
    case 'card':
      return cardRow ? (
        <CardDialog
          row={cardRow}
          format={format}
          issues={analysis.issuesOf(cardRow)}
          allowed={analysis.allowedOf(cardRow)}
          maxQty={maxFor(cardRow.line)}
          maxTitle={limitFor(cardRow.line.name)}
          onUpdate={(patch) => actions.updateCard(list, cardRow.line.id, patch)}
          board={
            cardBoard(cardRow) && {
              ...cardBoard(cardRow)!,
              onMove: (to) => {
                actions.moveCards(list, cardRow.bundledIds ?? [cardRow.line.id], to)
                onClose()
                toast(text.moved(cardRow.line.name, ui.boards.inSentence[to]))
              }
            }
          }
          commander={
            format?.commander
              ? {
                  leads: analysis.isCommander(cardRow),
                  canLead: analysis.canBeCommander(cardRow),
                  onMake: () => {
                    const partner = namedPartner(format, cardRow.info)
                    const name = cardRow.flavorName ?? cardRow.line.name
                    actions.setListCommanders(list, partner ? [cardRow.line.name, partner] : [cardRow.line.name])
                    toast(partner ? ui.list.leadTogether(name, partner, noun) : ui.list.nowLeads(name, noun))
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
    case 'substitute': {
      const row = props.rows.find((r) => r.line.id === dialog.lineId)
      return row ? (
        <SubstituteDialog
          row={row}
          item={props.inventory.get(nameKey(row.line.name))}
          color={listColor(list.lines)}
          onUpdate={(patch) => actions.updateCard(list, row.line.id, patch)}
          onClose={onClose}
        />
      ) : null
    }
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
    case 'preferred':
      return <PreferredVersionsDialog list={list} rows={props.rows} actions={actions} onClose={onClose} />
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
