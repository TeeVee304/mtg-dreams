import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sortPrintings } from '../../../shared/pricing'
import type { Printing } from '../../../shared/types'
import type { NewCard } from '../library'
import { getPrintingsEntry, requestPrintings, usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'
import { Stepper } from './Stepper'
import { AUTO, VersionPicker } from './VersionPicker'

export function usePrintingsFor(name: string) {
  useEffect(() => requestPrintings(name, { priority: 'high' }), [name])
  usePrintingsVersion()
  return getPrintingsEntry(name)
}

/** Loading / error / not-found states around the picker. */
export function PickerBody({ name, children }: { name: string; children: (printings: Printing[]) => ReactNode }) {
  const entry = getPrintingsEntry(name)
  const data = entry?.data
  if (!data) {
    if (entry?.error) return <p className="warn">Could not load versions: {entry.error}</p>
    return <p className="muted loading-line">Loading versions and prices…</p>
  }
  if (data.notFound) return <p className="warn">Scryfall has no card named “{name}”.</p>
  if (data.printings.length === 0) return <p className="warn">No paper printings found for {data.name}.</p>
  return (
    <>
      {children(data.printings)}
      {data.partial && (
        <p className="muted small picker-more">
          Showing the newest {data.printings.length} of {data.totalPrintings ?? 'many'} versions.{' '}
          {entry?.refreshing ? (
            'Loading…'
          ) : (
            <button
              type="button"
              className="link-btn"
              onClick={() => requestPrintings(name, { full: true, priority: 'high' })}
            >
              Show all versions
            </button>
          )}
        </p>
      )}
    </>
  )
}

interface AddCardPanelProps {
  name: string
  onAdd: (card: NewCard) => void
  onCancel: () => void
  actionLabel?: string
  /** Most copies that can be added: the format's limit, and for decks the copies you own. */
  maxQty?: number
  maxTitle?: string
  note?: string
}

export function AddCardPanel(props: AddCardPanelProps) {
  const { name, onAdd, onCancel, actionLabel = 'Add to list', maxQty, maxTitle, note } = props
  const entry = usePrintingsFor(name)
  const { priceBasis } = useSettings()
  const [qty, setQty] = useState(1)
  const [foil, setFoil] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const data = entry?.data
  // Typed the name printed on particular versions (e.g. "Franklin's Finality")? Start with the cheapest of them.
  const printedAs = sortPrintings(
    data?.printings.filter((p) => p.flavorName?.toLowerCase() === name.trim().toLowerCase()) ?? [],
    foil,
    priceBasis
  )[0]
  const selected = choice ?? printedAs?.id ?? AUTO
  // The cap can shrink once card data loads (e.g. a restricted card), so clamp here.
  const full = maxQty !== undefined && maxQty < 1
  const count = maxQty !== undefined ? Math.max(1, Math.min(qty, maxQty)) : qty
  const ready = !!data && !data.notFound && data.printings.length > 0 && !full

  useEffect(() => panelRef.current?.focus(), [])

  const submit = () => {
    if (!ready) return
    const printing = selected === AUTO ? undefined : data.printings.find((p) => p.id === selected)
    onAdd({ qty: count, name: data.name, foil, set: printing?.set, collector: printing?.collectorNumber })
  }

  return (
    <section
      className="add-panel"
      ref={panelRef}
      tabIndex={-1}
      aria-label={`Add ${name}`}
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
            <span className="muted">printed name · official name: {data.name}</span>
          ) : (
            data &&
            !data.notFound &&
            data.name.toLowerCase() !== name.toLowerCase() && <span className="muted">matched from “{name}”</span>
          )}
          {note && <span className="muted small">{note}</span>}
        </div>
        <label className="field-inline">
          Qty <Stepper value={count} min={1} max={maxQty} maxTitle={maxTitle} onChange={setQty} label="quantity" />
        </label>
        <label className="check">
          <input type="checkbox" checked={foil} onChange={(event) => setFoil(event.target.checked)} /> Foil
        </label>
        <button type="button" className="primary" onClick={submit} disabled={!ready} title={full ? maxTitle : undefined}>
          {actionLabel}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
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
