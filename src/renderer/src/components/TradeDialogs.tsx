import { useMemo, useState } from 'react'
import { countLines } from '@shared/decklist'
import {
  buildSnapshot,
  parseTradeText,
  serializeSnapshot,
  snapshotToText,
  tradeName,
  type TradeCard,
  type TradeSnapshot
} from '@shared/trade'
import type { InventoryItem } from '@shared/types'
import { cardCount, cleanError, totalCopies } from '../lib/format'
import type { CardList } from '../stores/library'
import { updateSettings, useSettings } from '../stores/settings'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { Modal } from './Modal'
import { useToast } from './Toasts'

/** Total copies label, e.g. `5 cards`. */
const copies = (cards: TradeCard[]) => cardCount(totalCopies(cards))
/** Plain `N Name` lines. */
const cardsToText = (cards: TradeCard[]) => countLines(cards).join('\n')

/** Props of {@link ShareTradeDialog}. */
interface ShareTradeDialogProps {
  inventory: Map<string, InventoryItem>
  /** Decks and wishlists; their missing cards are the wants. */
  lists: CardList[]
  onClose: () => void
}

/** Exports the own trade list as a file or as copyable text. */
export function ShareTradeDialog({ inventory, lists, onClose }: ShareTradeDialogProps) {
  const toast = useToast()
  const settings = useSettings()
  const [name, setName] = useState(settings.tradeName)
  const { busy, error, run } = useAsyncAction()
  const snapshot = useMemo(
    () => buildSnapshot(tradeName(name, 'Me'), inventory, lists, settings.copies),
    [name, inventory, lists, settings.copies]
  )
  const ready = name.trim().length > 0 && !busy

  const share = (how: 'file' | 'text') =>
    run(async () => {
      await updateSettings({ tradeName: name.trim() })
      if (how === 'file') {
        const path = await window.api.saveTradeFile(snapshot.name, serializeSnapshot(snapshot))
        if (!path) return
        toast(`Saved ${path.split(/[\\/]/).pop()}. Send it to your friend.`)
      } else {
        await window.api.copyText(snapshotToText(snapshot))
        toast('Trade list copied. Paste it in a chat with your friend.')
      }
      onClose()
    })

  return (
    <Modal
      title="Share my trade list"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!ready} onClick={() => share('text')}>
            Copy as text
          </button>
          <button type="button" className="primary" disabled={!ready} onClick={() => share('file')}>
            Save file…
          </button>
        </>
      }
    >
      <label className="field">
        <span>Your name (your friend sees this)</span>
        <input autoFocus value={name} placeholder="e.g. Bruno" onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="trade-summary">
        <div>
          <strong>{copies(snapshot.haves)}</strong> you can spare
          <span className="muted"> ({snapshot.haves.length} unique)</span>
        </div>
        <div>
          <strong>{copies(snapshot.wants)}</strong> your lists still need
        </div>
      </div>
      <p className="muted small">
        Your friend imports it in MTG Dreams to see which of their cards your lists need, and the other way round.
        Only spare copies are offered: copies your decks and wishlists use stay out. Prices, decks and where your
        files live are never included, and basic lands are left out.
      </p>
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
      const main = haves.trim() ? parseTradeText(haves, name || 'Friend') : null
      const extra = wants.trim() ? parseTradeText(wants, name || 'Friend') : null
      const wanted = [...(main?.wants ?? []), ...(extra ? [...extra.haves, ...extra.wants] : [])]
      const snapshot: TradeSnapshot = {
        ...(main ?? extra!),
        haves: main?.haves ?? [],
        wants: wanted,
        name: replaceName ?? (name.trim() ? tradeName(name) : (main?.name ?? 'Friend'))
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
      const file = await window.api.openTradeFile()
      if (!file) return
      const snapshot = parseTradeText(file.text, file.fileName)
      if (snapshot.source === 'app') {
        await onImport(replaceName ? { ...snapshot, name: replaceName } : snapshot)
        return
      }
      setName(replaceName ?? snapshot.name)
      setHaves(cardsToText(snapshot.haves))
      setWants(cardsToText(snapshot.wants))
      setNotice(`Read ${copies(snapshot.haves)} from “${file.fileName}”. Check the name, then import.`)
    })

  return (
    <Modal
      title={replaceName ? `Update ${replaceName}'s trade list` : 'Import a trade list'}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <span className="parse-stats">
            {pasted?.error ? (
              <span className="warn">{pasted.error}</span>
            ) : pasted?.snapshot ? (
              <span>
                {copies(pasted.snapshot.haves)} they have · {copies(pasted.snapshot.wants)} they want{replaces ? ` · replaces your current list for ${target}` : ''}
              </span>
            ) : null}
          </span>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !pasted?.snapshot}
            onClick={() => pasted?.snapshot && run(() => onImport(pasted.snapshot!))}
          >
            Import
          </button>
        </>
      }
    >
      <div className="import-file">
        <button type="button" className="primary" onClick={openFile} disabled={busy}>
          Open a file…
        </button>
        <span className="muted small">
          An MTG Dreams trade list (.mtgtrade), or a collection export from Moxfield, Deckbox and the like (.txt, .csv).
        </span>
      </div>
      <p className="import-or muted small">or paste lists your friend sent you</p>
      {notice && <p className="muted small">{notice}</p>}
      {!replaceName && (
        <label className="field">
          <span>Friend's name</span>
          <input value={name} placeholder="e.g. Ana" onChange={(event) => setName(event.target.value)} />
        </label>
      )}
      <div className="import-lists">
        <label className="field">
          <span>Cards they have</span>
          <textarea
            className="text-editor short"
            spellCheck={false}
            placeholder={'One card per line, e.g.\n4 Lightning Bolt\n1 Sol Ring\n\n(A list copied from MTG Dreams works too.)'}
            value={haves}
            onChange={(event) => setHaves(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Cards they want (optional)</span>
          <textarea
            className="text-editor short"
            spellCheck={false}
            placeholder={'Their wishlist, e.g.\n1 Thoughtseize'}
            value={wants}
            onChange={(event) => setWants(event.target.value)}
          />
        </label>
      </div>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}
