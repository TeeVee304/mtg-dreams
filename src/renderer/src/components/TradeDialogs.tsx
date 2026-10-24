import { useMemo, useState } from 'react'
import { totalCopies } from '@shared/totals'
import { ui } from '@shared/text'
import {
  buildSnapshot,
  parseTradeText,
  serializeSnapshot,
  snapshotToText,
  tradeLines,
  tradeName,
  type MyTradeSide,
  type TradeCard,
  type TradeSnapshot
} from '@shared/trade'
import { cleanError } from '../lib/format'
import { updateSettings, useSettings } from '../stores/settings'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { Modal } from './Modal'
import { useToast } from './Toasts'
import { copyText, openTradeFile, saveTradeFile } from '../lib/desktop'

/** `N Name` lines, worthless copies apart ({@link tradeLines}). */
const cardsToText = (cards: TradeCard[]) => tradeLines(cards).join('\n')

/** Props of {@link ShareTradeDialog}. */
interface ShareTradeDialogProps {
  /** Own trade side ({@link myTradeSide}): spare copies and what the lists still need. */
  myTrade: MyTradeSide
  onClose: () => void
}

/** Exports the own trade list as a file or as copyable text. */
export function ShareTradeDialog({ myTrade, onClose }: ShareTradeDialogProps) {
  const toast = useToast()
  const settings = useSettings()
  const [name, setName] = useState(settings.tradeName)
  const { busy, error, run } = useAsyncAction()
  const snapshot = useMemo(() => buildSnapshot(tradeName(name, ui.trades.share.defaultName), myTrade), [name, myTrade])
  const ready = name.trim().length > 0 && !busy

  const share = (how: 'file' | 'text') =>
    run(async () => {
      await updateSettings({ tradeName: name.trim() })
      if (how === 'file') {
        const path = await saveTradeFile(snapshot.name, serializeSnapshot(snapshot))
        if (!path) return
        toast(ui.trades.share.saved(path.split(/[\\/]/).pop() ?? path))
      } else {
        await copyText(snapshotToText(snapshot))
        toast(ui.trades.share.copied)
      }
      onClose()
    })

  return (
    <Modal
      title={ui.trades.share.title}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" disabled={!ready} onClick={() => share('text')}>
            {ui.trades.share.copy}
          </button>
          <button type="button" className="primary" disabled={!ready} onClick={() => share('file')}>
            {ui.trades.share.save}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{ui.trades.share.yourName}</span>
        <input autoFocus value={name} placeholder={ui.trades.share.namePlaceholder} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="trade-summary">
        <div>
          <strong>{ui.trades.share.spare(totalCopies(snapshot.haves))}</strong>
          <span className="muted">{ui.trades.share.unique(snapshot.haves.length)}</span>
        </div>
        <div>
          <strong>{ui.trades.share.needed(totalCopies(snapshot.wants))}</strong>
        </div>
      </div>
      <p className="muted small">{ui.trades.share.hint}</p>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}

/** Props of {@link ImportTradeDialog}. */
interface ImportTradeDialogProps {
  /** Existing trade names; a matching import is flagged as a replacement. */
  existingNames: string[]
  /** Name kept when updating an existing friend's list. */
  replaceName?: string
  onImport: (snapshot: TradeSnapshot) => Promise<void>
  onClose: () => void
}

/** Imports a friend's trade list from a file or pasted lists (a pasted wishlist counts as wants). Plain lists are shown for review first. */
export function ImportTradeDialog({ existingNames, replaceName, onImport, onClose }: ImportTradeDialogProps) {
  const [name, setName] = useState(replaceName ?? '')
  const [haves, setHaves] = useState('')
  const [wants, setWants] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, error, run } = useAsyncAction()

  const pasted = useMemo(() => {
    if (!haves.trim() && !wants.trim()) return null
    try {
      const main = haves.trim() ? parseTradeText(haves, name || ui.names.defaultFriend) : null
      const extra = wants.trim() ? parseTradeText(wants, name || ui.names.defaultFriend) : null
      const wanted = [...(main?.wants ?? []), ...(extra ? [...extra.haves, ...extra.wants] : [])]
      const snapshot: TradeSnapshot = {
        ...(main ?? extra!),
        haves: main?.haves ?? [],
        wants: wanted,
        name: replaceName ?? (name.trim() ? tradeName(name) : (main?.name ?? ui.names.defaultFriend))
      }
      return { snapshot, error: null }
    } catch (e) {
      return { snapshot: null, error: cleanError(e) }
    }
  }, [haves, wants, name, replaceName])

  const target = pasted?.snapshot?.name
  const replaces = target && existingNames.some((existing) => existing.toLowerCase() === target.toLowerCase())

  const openFile = () =>
    run(async () => {
      const file = await openTradeFile()
      if (!file) return
      const snapshot = parseTradeText(file.text, file.fileName)
      if (snapshot.source === 'app') {
        await onImport(replaceName ? { ...snapshot, name: replaceName } : snapshot)
        return
      }
      setName(replaceName ?? snapshot.name)
      setHaves(cardsToText(snapshot.haves))
      setWants(cardsToText(snapshot.wants))
      setNotice(ui.trades.import.read(totalCopies(snapshot.haves), file.fileName))
    })

  return (
    <Modal
      title={ui.trades.import.title(replaceName ?? null)}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <span className="parse-stats">
            {pasted?.error ? (
              <span className="warn">{pasted.error}</span>
            ) : pasted?.snapshot ? (
              <span>
                {ui.trades.import.summary(totalCopies(pasted.snapshot.haves), totalCopies(pasted.snapshot.wants), replaces ? target : null)}
              </span>
            ) : null}
          </span>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !pasted?.snapshot}
            onClick={() => pasted?.snapshot && run(() => onImport(pasted.snapshot!))}
          >
            {ui.trades.import.confirm}
          </button>
        </>
      }
    >
      <div className="import-file">
        <button type="button" className="primary" onClick={openFile} disabled={busy}>
          {ui.trades.import.openFile}
        </button>
        <span className="muted small">{ui.trades.import.fileHint}</span>
      </div>
      <p className="import-or muted small">{ui.trades.import.orPaste}</p>
      {notice && <p className="muted small">{notice}</p>}
      {!replaceName && (
        <label className="field">
          <span>{ui.trades.friendName}</span>
          <input value={name} placeholder={ui.trades.import.namePlaceholder} onChange={(event) => setName(event.target.value)} />
        </label>
      )}
      <div className="import-lists">
        <label className="field">
          <span>{ui.trades.import.haves}</span>
          <textarea
            className="text-editor short"
            spellCheck={false}
            placeholder={ui.trades.import.havesPlaceholder}
            value={haves}
            onChange={(event) => setHaves(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{ui.trades.import.wants}</span>
          <textarea
            className="text-editor short"
            spellCheck={false}
            placeholder={ui.trades.import.wantsPlaceholder}
            value={wants}
            onChange={(event) => setWants(event.target.value)}
          />
        </label>
      </div>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}
