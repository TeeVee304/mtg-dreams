import { useMemo, useState } from 'react'
import { countLines } from '../../../shared/decklist'
import {
  buildSnapshot,
  parseTradeText,
  serializeSnapshot,
  snapshotToText,
  tradeName,
  type TradeCard,
  type TradeSnapshot
} from '../../../shared/trade'
import type { InventoryItem } from '../../../shared/types'
import { cleanError } from '../format'
import type { CardList } from '../library'
import { updateSettings, useSettings } from '../settings'
import { useAsyncAction } from '../useAsyncAction'
import { Modal } from './Modal'
import { useToast } from './Toasts'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const copies = (cards: TradeCard[]) => {
  const n = cards.reduce((sum, card) => sum + card.qty, 0)
  return `${n} ${n === 1 ? 'copy' : 'copies'}`
}
const cardsToText = (cards: TradeCard[]) => countLines(cards).join('\n')

interface ShareTradeDialogProps {
  inventory: Map<string, InventoryItem>
  wishlists: CardList[]
  onClose: () => void
}

/** Exports your trade list as a file or as text for a chat. */
export function ShareTradeDialog({ inventory, wishlists, onClose }: ShareTradeDialogProps) {
  const toast = useToast()
  const settings = useSettings()
  const [name, setName] = useState(settings.tradeName)
  const { busy, error, run } = useAsyncAction()
  const snapshot = useMemo(
    () => buildSnapshot(tradeName(name, 'Me'), inventory, wishlists),
    [name, inventory, wishlists]
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
          <strong>{plural(snapshot.haves.length, 'card')}</strong> you own
          <span className="muted"> ({copies(snapshot.haves)})</span>
        </div>
        <div>
          <strong>{plural(snapshot.wants.length, 'card')}</strong> your wishlists still need
        </div>
      </div>
      <p className="muted small">
        Your friend imports it in MTG Dreams to see which of their cards your wishlists need, and the other way round.
        Prices, decks and where your files live are never included, and basic lands are left out.
      </p>
      {error && <p className="warn">{error}</p>}
    </Modal>
  )
}

interface ImportTradeDialogProps {
  existingNames: string[]
  /** Updating a known friend: the imported list keeps this name. */
  replaceName?: string
  onImport: (snapshot: TradeSnapshot) => Promise<void>
  onClose: () => void
}

/** Imports a friend's trade list from a file, or from pasted plain lists. */
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
      // A pasted wishlist is a plain list, which parses as "haves".
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
      // A plain list or collection export: show it for a check before importing.
      setName(replaceName ?? snapshot.name)
      setHaves(cardsToText(snapshot.haves))
      setWants(cardsToText(snapshot.wants))
      setNotice(`Read ${plural(snapshot.haves.length, 'card')} from “${file.fileName}”. Check the name, then import.`)
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
                {plural(pasted.snapshot.haves.length, 'card')} they have · {plural(pasted.snapshot.wants.length, 'card')} they
                want{replaces ? ` · replaces your current list for ${target}` : ''}
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
