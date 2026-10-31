import { servesVersion } from '@shared/inventory'
import type { ThemeColor } from '@shared/themes'
import type { CardLine, InventoryItem, OwnedCopy, Printing } from '@shared/types'
import { ui } from '@shared/text'
import type { Row } from '../lib/summary'
import { formatEur } from '../lib/format'
import { copyLabel } from './InventoryVersions'
import { Modal } from './Modal'
import { useToast } from './Toasts'

/** Props of {@link SubstituteDialog}. */
interface SubstituteDialogProps {
  row: Row
  /** The Card's owned copies. */
  item: InventoryItem | undefined
  /** The list's own color, which the dialog takes. */
  color: ThemeColor | null
  /** Patches the line. */
  onUpdate: (patch: Partial<CardLine>) => void
  onClose: () => void
}

/** @returns The copies of other Versions than the one a line wants, most copies first. */
export function substituteCopies(line: CardLine, item: InventoryItem | undefined): OwnedCopy[] {
  const wanted = { ...line, standIn: undefined }
  return (item?.copies ?? []).filter((copy) => !servesVersion(copy, wanted)).sort((a, b) => b.qty - a.qty)
}

/**
 * Reviews a Version conflict: a wishlist line wanting a Version you own only other Versions of. Keep
 * lets your copy stand in (`{Stand-in}`: the line keeps its Version and counts as owned); Replace
 * makes the line want your copy's Version. A stand-in can be undone. Closing changes nothing.
 */
export function SubstituteDialog({ row, item, color, onUpdate, onClose }: SubstituteDialogProps) {
  const text = ui.card.substitute
  const toast = useToast()
  const { line } = row
  const name = row.flavorName ?? line.name
  const copies = substituteCopies(line, item)
  const yours = copies[0]
  const wanted = copyLabel({ qty: line.qty, set: line.set, collector: line.collector, foil: line.foil })
  const yoursLabel = yours ? copyLabel(yours) : ''
  const printings = row.entry?.data?.printings ?? []
  const printingOf = (copy: OwnedCopy | undefined): Printing | null =>
    (copy?.set && printings.find((p) => p.set === copy.set && (!copy.collector || p.collectorNumber === copy.collector))) || null
  const wantedPrinting = row.resolution?.printing ?? null
  // A copy recording no printing differs only in finish: it shows the wanted one; an unknown printing, none.
  const yoursPrinting = yours?.set ? printingOf(yours) : wantedPrinting
  const act = (patch: Partial<CardLine>, message: string) => {
    onUpdate(patch)
    onClose()
    toast(message)
  }

  return (
    <Modal title={text.title} size="medium" onClose={onClose}>
      <div className="substitute" data-color={color ?? undefined}>
        <h3 className="substitute-name">{name}</h3>
        <div className="substitute-pair">
          <figure>
            <figcaption className="muted small">{text.wanted}</figcaption>
            <SubstituteArt printing={wantedPrinting} />
            <span>{wanted}</span>
            <span className="muted small">{formatEur(row.unit)}</span>
          </figure>
          <figure className="yours">
            <figcaption className="small">{text.yours}</figcaption>
            <SubstituteArt printing={yoursPrinting} />
            <span>{yoursLabel}</span>
            <span className="muted small">
              {[text.copies(yours?.qty ?? 0), ...copies.slice(1).map((copy) => `${copyLabel(copy)} · ${text.copies(copy.qty)}`)].join(', ')}
            </span>
          </figure>
        </div>
        <div className="substitute-actions">
          {line.standIn ? (
            <button type="button" title={text.undoHint(wanted)} onClick={() => act({ standIn: undefined }, text.uncounted(name))}>
              {text.undo}
            </button>
          ) : (
            <button
              type="button"
              title={text.keepHint(wanted, yoursLabel)}
              onClick={() => act({ standIn: true }, text.counted(name))}
              disabled={!yours}
            >
              {text.keep}
            </button>
          )}
          <button
            type="button"
            className="primary"
            title={text.replaceHint(yoursLabel)}
            disabled={!yours}
            autoFocus
            onClick={() => yours && act({ set: yours.set, collector: yours.set ? yours.collector : undefined, foil: yours.foil, standIn: undefined }, text.switched(name, yoursLabel))}
          >
            {text.replace}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** A printing's image; an empty card frame until it loads, or without one. */
function SubstituteArt({ printing }: { printing: Printing | null }) {
  return (
    <span className="substitute-art">
      {printing?.imageNormal && <img src={printing.imageNormal} alt="" draggable={false} />}
    </span>
  )
}
