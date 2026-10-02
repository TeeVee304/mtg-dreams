import { FORMATS, type DeckFormat, type LegalityIssue } from '../../../shared/formats'
import type { Printing } from '../../../shared/types'
import { formatEur } from '../format'
import type { NewCard } from '../library'
import type { Row } from '../summary'
import { PickerBody, usePrintingsFor } from './CardEditors'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { Stepper } from './Stepper'
import { AUTO, VersionPicker } from './VersionPicker'

/** Printing has a foil or etched finish. */
const hasFoil = (p: Printing) => p.finishes.includes('foil') || p.finishes.includes('etched')
/** Printing has a non-foil finish. */
const hasNonfoil = (p: Printing) => p.finishes.includes('nonfoil')

/** Display labels of Scryfall legality values. */
const STATUS_LABELS: Record<string, string> = {
  legal: 'Legal',
  not_legal: 'Not legal',
  banned: 'Banned',
  restricted: 'Restricted'
}

/** Props of {@link CardDialog}. */
interface CardDialogProps {
  /** Current row; updated after each change. */
  row: Row
  format: DeckFormat | null
  issue: LegalityIssue | null
  /** Max quantity (format and, for decks, ownership). */
  maxQty?: number
  /** Tooltip when `maxQty` is reached. */
  maxTitle?: string
  /** Applies a line patch immediately. */
  onUpdate: (patch: Partial<NewCard>) => void
  onClose: () => void
}

/** Card details dialog; version, finish and quantity changes apply immediately. A pinned single-finish printing locks the finish. */
export function CardDialog({ row, format, issue, maxQty, maxTitle, onUpdate, onClose }: CardDialogProps) {
  const { line, resolution, unit, info } = row
  const entry = usePrintingsFor(line.name)
  const printings = entry?.data?.printings ?? []
  const printing = resolution?.printing ?? null
  const pinned = resolution?.pinned ? printing : null
  const foilLocked = pinned ? !(hasFoil(pinned) && hasNonfoil(pinned)) : false
  const selected = line.set ? (printing?.id ?? '') : AUTO

  const selectVersion = (id: string) => {
    if (id === AUTO) {
      onUpdate({ set: undefined, collector: undefined })
      return
    }
    const choice = printings.find((p) => p.id === id)
    if (!choice) return
    const foil = !hasNonfoil(choice) ? true : !hasFoil(choice) ? false : line.foil
    onUpdate({ set: choice.set, collector: choice.collectorNumber, foil })
  }

  return (
    <Modal title={row.flavorName ?? line.name} onClose={onClose} size="wide">
      <div className="card-view">
        <div className="card-view-image">
          {printing?.imageNormal ? <img src={printing.imageNormal} alt={line.name} /> : <span>No image</span>}
        </div>
        <div className="card-view-info">
          {row.flavorName && <p className="muted small">Printed name · official name: {line.name}</p>}
          {info && (
            <p className="muted">
              {info.typeLine} · Mana value {info.manaValue}
            </p>
          )}
          {format && info && (
            <p>
              {issue ? (
                <span className={`chip ${issue.severity === 'error' ? 'illegal' : 'restricted'}`}>{issue.message}</span>
              ) : (
                <span className="chip legal">Legal in {format.label}</span>
              )}
            </p>
          )}
          <dl className="card-facts">
            <dt>Version</dt>
            <dd>
              {printing ? (
                <>
                  {resolution?.pinned ? (
                    ''
                  ) : resolution?.fromInventory ? (
                    <span className="auto-badge yours" title="The version in your inventory">
                      Yours
                    </span>
                  ) : (
                    <span className="auto-badge">Cheapest</span>
                  )}{' '}
                  {printing.setName} (
                  {printing.set.toUpperCase()} #{printing.collectorNumber})
                  {printing.labels.length > 0 && (
                    <span className="chips">
                      {printing.labels.map((label) => (
                        <span key={label} className="chip">
                          {label}
                        </span>
                      ))}
                    </span>
                  )}
                </>
              ) : (
                <span className="muted">Loading…</span>
              )}
            </dd>
            <dt>Finish</dt>
            <dd>
              <label className="check" title={foilLocked ? 'This version only exists in one finish' : undefined}>
                <input
                  type="checkbox"
                  checked={line.foil}
                  disabled={foilLocked}
                  onChange={(event) => onUpdate({ foil: event.target.checked })}
                />
                Foil
              </label>
              {foilLocked && pinned && (
                <span className="muted small"> — this version is {hasFoil(pinned) ? 'foil only' : 'non-foil only'}</span>
              )}
            </dd>
            <dt>Quantity</dt>
            <dd>
              <Stepper
                value={line.qty}
                min={1}
                max={maxQty}
                maxTitle={maxTitle}
                onChange={(qty) => onUpdate({ qty })}
                label="quantity"
              />
            </dd>
            <dt>Price</dt>
            <dd>
              <strong>{formatEur(unit)}</strong>
              {unit !== null && line.qty > 1 && (
                <span className="muted">
                  {' '}
                  × {line.qty} = {formatEur(unit * line.qty)}
                </span>
              )}
              {unit === null && entry?.data && <span className="muted small"> — no Cardmarket price for this version and finish</span>}
            </dd>
          </dl>
          {printing?.cardmarketUrl && (
            <button type="button" onClick={() => window.api.openExternal(printing.cardmarketUrl!)}>
              Open on Cardmarket <Icon name="external" />
            </button>
          )}
          {info && (
            <div className="legality-grid" aria-label="Format legality">
              {FORMATS.map((f) => {
                const status = info.legalities[f.id] ?? 'not_legal'
                return (
                  <div key={f.id} className={`legality ${status}${format?.id === f.id ? ' current' : ''}`}>
                    <span>{f.label}</span>
                    <span className="legality-status">{STATUS_LABELS[status] ?? status}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <section className="change-version">
        <h3>Change version</h3>
        <p className="muted small">Pick a version to use it right away; the price updates immediately.</p>
        <PickerBody name={line.name}>
          {(list) => <VersionPicker printings={list} foil={line.foil} selected={selected} onSelect={selectVersion} />}
        </PickerBody>
      </section>
    </Modal>
  )
}
