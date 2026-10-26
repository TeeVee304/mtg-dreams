import { useMemo, useState } from 'react'
import { cardLines, parseInventory, parseList, unrecognizedLines } from '@shared/decklist'
import { totalCopies } from '@shared/totals'
import type { ListKind } from '@shared/types'
import { ui } from '@shared/text'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useCopy } from '../hooks/useCopy'
import { FormatSelect } from './Controls'
import { Modal } from './Modal'

/** Props of {@link PromptDialog}. */
interface PromptDialogProps {
  title: string
  label: string
  initial?: string
  confirmLabel: string
  onSubmit: (value: string) => Promise<void> | void
  onClose: () => void
}

/** Single text input dialog; `onSubmit` errors are shown inline. */
export function PromptDialog({ title, label, initial = '', confirmLabel, onSubmit, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(initial)
  const { error, busy, run } = useAsyncAction()
  const submit = () => run(() => onSubmit(value))
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className="primary" disabled={busy || !value.trim()} onClick={submit}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) void submit()
          }}
        />
      </label>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}

/** Props of {@link ConfirmDialog}. */
interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

/** Confirmation dialog; `onConfirm` errors are shown inline. */
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  const { error, busy, run } = useAsyncAction()
  const submit = () => run(onConfirm)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className={danger ? 'danger' : 'primary'} disabled={busy} onClick={submit} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}

/** Props of {@link ConflictDialog}. */
interface ConflictDialogProps {
  /** Display name: quoted list name or `Your inventory`. */
  name: string
  /** Overwrites the external version. */
  onKeepMine: () => void
  /** Reloads the external version; also invoked on close, so nothing is overwritten implicitly. */
  onLoadOther: () => void
}

/** Resolves a save conflict (file changed externally). */
export function ConflictDialog({ name, onKeepMine, onLoadOther }: ConflictDialogProps) {
  return (
    <Modal
      title={ui.dialogs.conflict.title}
      onClose={onLoadOther}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onKeepMine}>
            {ui.dialogs.conflict.keepMine}
          </button>
          <button type="button" className="primary" onClick={onLoadOther} autoFocus>
            {ui.dialogs.conflict.loadOther}
          </button>
        </>
      }
    >
      <p>{ui.dialogs.conflict.body(name)}</p>
      <ul className="muted small">
        <li>
          <strong>{ui.dialogs.conflict.loadOther}</strong> {ui.dialogs.conflict.loadOtherHint}
        </li>
        <li>
          <strong>{ui.dialogs.conflict.keepMine}</strong> {ui.dialogs.conflict.keepMineHint}
        </li>
      </ul>
    </Modal>
  )
}

/** Live parse summary of editor text: card count and unrecognized lines. */
function ParseStats({ text, mode }: { text: string; mode: 'list' | 'inventory' }) {
  const stats = useMemo(() => {
    const lines = parseList(text)
    const cards = cardLines(lines)
    return {
      cards: totalCopies(cards),
      unique: mode === 'inventory' ? parseInventory(text).size : cards.length,
      unrecognized: unrecognizedLines(lines)
    }
  }, [text, mode])

  return (
    <div className="parse-stats">
      <span>{ui.dialogs.editor.stats(stats.cards, stats.unique, mode === 'inventory')}</span>
      {stats.unrecognized.length > 0 && (
        <span className="warn" title={stats.unrecognized.join('\n')}>
          {ui.dialogs.editor.unrecognized(stats.unrecognized.length, mode === 'list', stats.unrecognized[0], stats.unrecognized.length > 1)}
        </span>
      )}
    </div>
  )
}

/** Props of {@link TextEditorDialog}. */
interface TextEditorDialogProps {
  title: string
  initial: string
  /** Parse mode for the live summary. */
  mode: 'list' | 'inventory'
  /** Offers a Copy button, copying the text as it stands, and says this once copied. */
  copied?: string
  /** Rewrites the text a Copy button copies; as it stands by default. */
  copyText?: (text: string) => string
  /** Offers a Copy (Unowned) button: called with the text as it stands, to copy the Cards you don't own. */
  onCopyUnowned?: (text: string) => void
  onSave: (text: string) => void
  onClose: () => void
}

/** Raw text editor for a list or the inventory. */
export function TextEditorDialog({ title, initial, mode, copied, copyText = (text) => text, onCopyUnowned, onSave, onClose }: TextEditorDialogProps) {
  const [text, setText] = useState(initial)
  const copy = useCopy()
  const save = () => {
    onSave(text)
    onClose()
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <ParseStats text={text} mode={mode} />
          <span className="spacer" />
          {copied && (
            <button type="button" onClick={() => void copy(copyText(text), copied)}>
              {ui.dialogs.editor.copy}
            </button>
          )}
          {onCopyUnowned && (
            <button type="button" onClick={() => onCopyUnowned(text)} title={ui.dialogs.editor.copyUnownedHint}>
              {ui.dialogs.editor.copyUnowned}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className="primary" onClick={save}>
            {ui.dialogs.save}
          </button>
        </>
      }
    >
      <p className="muted small">{ui.dialogs.editor.syntax}</p>
      <textarea
        className="text-editor"
        autoFocus
        spellCheck={false}
        placeholder={ui.dialogs.editor.placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.ctrlKey) save()
        }}
      />
    </Modal>
  )
}

/** Props of {@link NewListDialog}. */
interface NewListDialogProps {
  kind: ListKind
  /** Creates the list. `addToInventory` (decks): raise inventory totals to cover the imported cards. */
  onCreate: (name: string, text: string, formatId: string | null, addToInventory: boolean) => Promise<void>
  /** Switches to precon import. */
  onFromPrecon: () => void
  /** Opens the Deck Wizard instead; offered for wishlists. */
  onWizard?: () => void
  onClose: () => void
}

/** New deck, wishlist or brew dialog: name, optional format and pasted list. */
export function NewListDialog({ kind, onCreate, onFromPrecon, onWizard, onClose }: NewListDialogProps) {
  const isDeck = kind === 'deck'
  const [name, setName] = useState('')
  const [format, setFormat] = useState('')
  const [text, setText] = useState('')
  const [addToInventory, setAddToInventory] = useState(true)
  const { error, busy, run } = useAsyncAction()
  const submit = () => run(() => onCreate(name, text, format || null, isDeck && addToInventory))
  return (
    <Modal
      title={ui.dialogs.newList.title(kind)}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {text.trim() && <ParseStats text={text} mode="list" />}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className="primary" disabled={busy || !name.trim()} onClick={submit}>
            {ui.dialogs.newList.create(kind)}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{ui.dialogs.name}</span>
        <input
          autoFocus
          value={name}
          placeholder={ui.dialogs.newList.namePlaceholder[kind]}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) void submit()
          }}
        />
      </label>
      <label className="field">
        <span>{ui.dialogs.format}</span>
        <FormatSelect value={format} onChange={setFormat} />
      </label>
      <label className="field">
        <span>{isDeck ? ui.dialogs.newList.importDeck : ui.dialogs.newList.importCards}</span>
        <textarea
          className="text-editor short"
          spellCheck={false}
          placeholder={ui.dialogs.editor.placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {isDeck && text.trim() && (
        <label className="check">
          <input type="checkbox" checked={addToInventory} onChange={(event) => setAddToInventory(event.target.checked)} />
          {ui.dialogs.newList.addToInventory}
        </label>
      )}
      <p className="muted small">
        {ui.dialogs.newList.or}{' '}
        <button type="button" className="link-btn" onClick={onFromPrecon}>
          {ui.dialogs.newList.fromPrecon}
        </button>
        {onWizard && (
          <>
            {' '}
            {ui.dialogs.newList.orLower}{' '}
            <button type="button" className="link-btn" onClick={onWizard}>
              {ui.dialogs.newList.wizard}
            </button>
          </>
        )}
      </p>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}
