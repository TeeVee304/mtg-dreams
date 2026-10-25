import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sortPrintings } from '@shared/pricing'
import type { Board } from '@shared/sideboard'
import type { Printing } from '@shared/types'
import { ui } from '@shared/text'
import type { NewCard } from '../stores/library'
import { getPrintingsEntry, requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { Stepper } from './Stepper'
import { AUTO, VersionPicker } from './VersionPicker'

/** Requests a card's printings at high priority and re-renders on store changes. @returns Store entry. */
export function usePrintingsFor(name: string) {
  useEffect(() => requestPrintings(name, { priority: 'high' }), [name])
  usePrintingsVersion()
  return getPrintingsEntry(name)
}

/** Renders loading, error and not-found states, else `children` with the printings. */
export function PickerBody({ name, children }: { name: string; children: (printings: Printing[]) => ReactNode }) {
  const entry = getPrintingsEntry(name)
  const data = entry?.data
  if (!data) {
    if (entry?.error) return <p className="warn">{ui.card.picker.loadFailed(entry.error)}</p>
    return <p className="muted loading-line">{ui.card.picker.loading}</p>
  }
  if (data.notFound) return <p className="warn">{ui.card.picker.noSuchCard(name)}</p>
  if (data.printings.length === 0) return <p className="warn">{ui.card.picker.noPaper(data.name)}</p>
  return (
    <>
      {children(data.printings)}
      {data.partial && (
        <p className="muted small picker-more">
          {ui.card.picker.newest(data.printings.length, data.totalPrintings ?? null)}{' '}
          {entry?.refreshing ? (
            ui.common.loading
          ) : (
            <button
              type="button"
              className="link-btn"
              onClick={() => requestPrintings(name, { full: true, priority: 'high' })}
            >
              {ui.card.picker.showAll}
            </button>
          )}
        </p>
      )}
    </>
  )
}

/** Props of {@link AddCardPanel}. */
interface AddCardPanelProps {
  name: string
  /** @param board - The board picked, from `boards`. */
  onAdd: (card: NewCard, board: Board) => void
  onCancel: () => void
  /** Submit button label. */
  actionLabel?: string
  /** Max addable copies (format and, for decks, ownership); none on the maybeboard. */
  maxQty?: number
  /** Tooltip when `maxQty` is reached. */
  maxTitle?: string
  /** Extra note shown in the panel. */
  note?: string
  /** Boards to choose from, the first picked at first; a choice shows when there are several. */
  boards?: Board[]
}

/** Only the main deck. */
const MAIN_ONLY: Board[] = ['main']

/**
 * Version, finish and quantity picker for adding a card. Preselects the cheapest printing matching a
 * typed flavor name; quantity is clamped to `maxQty` as it may shrink once card data loads.
 */
export function AddCardPanel(props: AddCardPanelProps) {
  const { name, onAdd, onCancel, actionLabel = ui.card.picker.addToList, maxTitle, note, boards = MAIN_ONLY } = props
  const entry = usePrintingsFor(name)
  const { priceBasis } = useSettings()
  const [qty, setQty] = useState(1)
  const [foil, setFoil] = useState(false)
  const [board, setBoard] = useState<Board>(boards[0])
  // The maybeboard counts toward nothing, so neither the format nor your copies limit it.
  const maxQty = board === 'maybe' ? undefined : props.maxQty
  const [choice, setChoice] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const data = entry?.data
  const printedAs = sortPrintings(
    data?.printings.filter((p) => p.flavorName?.toLowerCase() === name.trim().toLowerCase()) ?? [],
    foil,
    priceBasis
  )[0]
  const selected = choice ?? printedAs?.id ?? AUTO
  const full = maxQty !== undefined && maxQty < 1
  const count = maxQty !== undefined ? Math.max(1, Math.min(qty, maxQty)) : qty
  const ready = !!data && !data.notFound && data.printings.length > 0 && !full

  useEffect(() => panelRef.current?.focus(), [])

  const submit = () => {
    if (!ready) return
    const printing = selected === AUTO ? undefined : data.printings.find((p) => p.id === selected)
    onAdd({ qty: count, name: data.name, foil, set: printing?.set, collector: printing?.collectorNumber }, board)
  }

  return (
    <section
      className="add-panel"
      ref={panelRef}
      tabIndex={-1}
      aria-label={ui.card.picker.add(name)}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement
        if (event.key === 'Escape') onCancel()
        else if (event.key === 'Enter' && !['INPUT', 'BUTTON'].includes(target.tagName)) submit()
      }}
    >
      <div className="add-head">
        <div className="add-title">
          <h3>{printedAs?.flavorName ?? data?.name ?? name}</h3>
          {printedAs && data ? (
            <span className="muted">{ui.card.picker.printedName(data.name)}</span>
          ) : (
            data &&
            !data.notFound &&
            data.name.toLowerCase() !== name.toLowerCase() && <span className="muted">{ui.card.picker.matchedFrom(name)}</span>
          )}
          {note && <span className="muted small">{note}</span>}
        </div>
        <label className="field-inline">
          {ui.card.picker.qty} <Stepper value={count} min={1} max={maxQty} maxTitle={maxTitle} onChange={setQty} label={ui.card.picker.quantity} />
        </label>
        <label className="check">
          <input type="checkbox" checked={foil} onChange={(event) => setFoil(event.target.checked)} /> {ui.common.foil}
        </label>
        {boards.length > 1 && (
          <select value={board} onChange={(event) => setBoard(event.target.value as Board)} aria-label={ui.card.picker.board}>
            {boards.map((option) => (
              <option key={option} value={option}>
                {ui.boards.labels[option]}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="primary" onClick={submit} disabled={!ready} title={full ? maxTitle : undefined}>
          {actionLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {ui.dialogs.cancel}
        </button>
      </div>
      <PickerBody name={name}>
        {(printings) => (
          <VersionPicker printings={printings} foil={foil} selected={selected} onSelect={setChoice} onConfirm={submit} />
        )}
      </PickerBody>
    </section>
  )
}
