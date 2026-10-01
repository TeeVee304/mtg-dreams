import { useMemo, useState } from 'react'
import { cardLines, parseInventory, parseList, unrecognizedLines } from '../../../shared/decklist'
import { FORMATS } from '../../../shared/formats'
import type { ListKind } from '../../../shared/types'
import { cardCount } from '../format'
import { useAsyncAction } from '../useAsyncAction'
import { Modal } from './Modal'

interface PromptDialogProps {
  title: string
  label: string
  initial?: string
  confirmLabel: string
  onSubmit: (value: string) => Promise<void> | void
  onClose: () => void
}

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

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

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

interface ConflictDialogProps {
  /** The list's name in quotes, or "Your inventory". */
  name: string
  onKeepMine: () => void
  /** Also what closing the dialog does: the other version is never overwritten unasked. */
  onLoadOther: () => void
}

/** A save was refused because the file changed outside the app, e.g. synced from another PC. */
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

function ParseStats({ text, mode }: { text: string; mode: 'list' | 'inventory' }) {
  const stats = useMemo(() => {
    const lines = parseList(text)
    const cards = cardLines(lines)
    return {
      cards: cards.reduce((sum, card) => sum + card.qty, 0),
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

const FORMAT_HINT = 'One card per line: “4 Lightning Bolt”. Optional version: “4 Lightning Bolt <141> [A25]”, foil: “(F)”.'

interface TextEditorDialogProps {
  title: string
  initial: string
  mode: 'list' | 'inventory'
  onSave: (text: string) => void
  onClose: () => void
}

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
        {mode === 'inventory' && ' The inventory tracks names only, so versions and foiling are merged.'}
      </p>
      <textarea
        className="text-editor"
        autoFocus
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.ctrlKey) save()
        }}
      />
    </Modal>
  )
}

interface NewListDialogProps {
  kind: ListKind
  /** `addToInventory`: decks only, top the inventory up so it covers the imported cards. */
  onCreate: (name: string, text: string, formatId: string | null, addToInventory: boolean) => Promise<void>
  onFromPrecon: () => void
  onClose: () => void
}

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
        <select value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="">No format (just a list of cards)</option>
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{isDeck ? 'Import a decklist (optional)' : 'Import cards (optional)'}</span>
        <textarea
          className="text-editor short"
          spellCheck={false}
          placeholder={'Paste a Goldfish / Arena / Moxfield list here, e.g.\n4 Lightning Bolt\n1 Sol Ring [CMM]'}
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
