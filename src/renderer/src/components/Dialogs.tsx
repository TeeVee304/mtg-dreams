import { useMemo, useState } from 'react'
import { cardLines, parseInventory, parseList, unrecognizedLines } from '@shared/decklist'
import { totalCopies } from '@shared/totals'
import type { ListKind } from '@shared/types'
import { cardCount } from '../lib/format'
import { useAsyncAction } from '../hooks/useAsyncAction'
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
            Cancel
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
            Cancel
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
      title="Changed somewhere else"
      onClose={onLoadOther}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onKeepMine}>
            Keep mine
          </button>
          <button type="button" className="primary" onClick={onLoadOther} autoFocus>
            Load the other version
          </button>
        </>
      }
    >
      <p>
        {name} was changed outside MTG Dreams, maybe synced from another computer, so your latest change here
        wasn&apos;t saved.
      </p>
      <ul className="muted small">
        <li>
          <strong>Load the other version</strong> shows what&apos;s in the file now, without your latest changes.
        </li>
        <li>
          <strong>Keep mine</strong> saves your version over the other one.
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
      <span>
        {cardCount(stats.cards)} · {stats.unique} {mode === 'inventory' ? 'unique names' : 'lines'}
      </span>
      {stats.unrecognized.length > 0 && (
        <span className="warn" title={stats.unrecognized.join('\n')}>
          {stats.unrecognized.length} unrecognised line{stats.unrecognized.length === 1 ? '' : 's'} (
          {mode === 'list' ? 'kept as-is' : 'will be dropped'}): “{stats.unrecognized[0]}”
          {stats.unrecognized.length > 1 ? '…' : ''}
        </span>
      )}
    </div>
  )
}

/** Example shown in empty list text fields. */
const LIST_PLACEHOLDER = 'Paste a Goldfish / Arena / Moxfield list here, e.g.\n4 Lightning Bolt\n1 Sol Ring [CMM]'

/** List syntax help text. */
const FORMAT_HINT = 'One card per line: “4 Lightning Bolt”. Optional version: “4 Lightning Bolt <141> [A25]”, foil: “(F)”.'

/** Props of {@link TextEditorDialog}. */
interface TextEditorDialogProps {
  title: string
  initial: string
  /** Parse mode for the live summary. */
  mode: 'list' | 'inventory'
  onSave: (text: string) => void
  onClose: () => void
}

/** Raw text editor for a list or the inventory. */
export function TextEditorDialog({ title, initial, mode, onSave, onClose }: TextEditorDialogProps) {
  const [text, setText] = useState(initial)
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
        {FORMAT_HINT}
      </p>
      <textarea
        className="text-editor"
        autoFocus
        spellCheck={false}
        placeholder={LIST_PLACEHOLDER}
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
  onClose: () => void
}

/** New deck or wishlist dialog: name, optional format and pasted list. */
export function NewListDialog({ kind, onCreate, onFromPrecon, onClose }: NewListDialogProps) {
  const isDeck = kind === 'deck'
  const [name, setName] = useState('')
  const [format, setFormat] = useState('')
  const [text, setText] = useState('')
  const [addToInventory, setAddToInventory] = useState(true)
  const { error, busy, run } = useAsyncAction()
  const submit = () => run(() => onCreate(name, text, format || null, isDeck && addToInventory))
  return (
    <Modal
      title={isDeck ? 'New deck' : 'New wishlist'}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {text.trim() && <ParseStats text={text} mode="list" />}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={busy || !name.trim()} onClick={submit}>
            {isDeck ? 'Create deck' : 'Create wishlist'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input
          autoFocus
          value={name}
          placeholder={isDeck ? 'e.g. Atraxa superfriends' : 'e.g. Atraxa upgrades'}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) void submit()
          }}
        />
      </label>
      <label className="field">
        <span>Format</span>
        <FormatSelect value={format} onChange={setFormat} />
      </label>
      <label className="field">
        <span>{isDeck ? 'Import a decklist (optional)' : 'Import cards (optional)'}</span>
        <textarea
          className="text-editor short"
          spellCheck={false}
          placeholder={LIST_PLACEHOLDER}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {isDeck && text.trim() && (
        <label className="check">
          <input type="checkbox" checked={addToInventory} onChange={(event) => setAddToInventory(event.target.checked)} />
          Add these cards to my inventory if they're missing (decks can only use cards you own)
        </label>
      )}
      <p className="muted small">
        Or{' '}
        <button type="button" className="link-btn" onClick={onFromPrecon}>
          start from an official precon…
        </button>
      </p>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}
