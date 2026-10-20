import { useState } from 'react'
import { languageOf, LANGUAGES } from '@shared/languages'
import { finishFor, resolveLine, singleFinish } from '@shared/pricing'
import type { InventoryItem, OwnedCopy } from '@shared/types'
import { cardCount } from '../lib/format'
import { PickerBody, usePrintingsFor } from './CardEditors'
import { Icon } from './Icon'
import { LanguageFlag } from './LanguageFlag'
import { Modal } from './Modal'
import { Stepper } from './Stepper'
import { AUTO, VersionPicker } from './VersionPicker'

/** @returns Copy label, e.g. `A25 #141`, `Any version`, with `Foil` and `Worthless` appended; the language is a flag beside it. */
export function copyLabel(copy: OwnedCopy): string {
  const where = copy.set ? `${copy.set.toUpperCase()}${copy.collector ? ` #${copy.collector}` : ''}` : 'Any version'
  return [where, copy.foil && 'Foil', copy.worthless && 'Worthless'].filter(Boolean).join(' · ')
}

/** Props of {@link InventoryVersionsDialog}. */
interface InventoryVersionsProps {
  item: InventoryItem
  /** Replaces the item's copies. */
  onChange: (copies: OwnedCopy[]) => void
  onClose: () => void
}

/** Picker mode: version for a new copy, or replacement version for copy `index`. */
type Picking = { mode: 'add' } | { mode: 'change'; index: number }

/**
 * Edits owned copies by printing and finish; changes apply immediately. Adding a version converts
 * one unversioned copy if any exists.
 */
export function InventoryVersionsDialog({ item, onChange, onClose }: InventoryVersionsProps) {
  const entry = usePrintingsFor(item.name)
  const printings = entry?.data?.printings ?? []
  const [picking, setPicking] = useState<Picking | null>(null)

  const printingOf = (copy: OwnedCopy) => (copy.set ? resolveLine(copy, printings, 'trend').printing : null)
  const update = (index: number, patch: Partial<OwnedCopy>) =>
    onChange(item.copies.map((copy, i) => (i === index ? { ...copy, ...patch } : copy)))
  /** Changes one copy of a group (its language, or whether it has a value), moving it to a group of its own. */
  const changeOne = (index: number, patch: Partial<OwnedCopy>) => {
    const copy = item.copies[index]
    if (copy.qty === 1) return update(index, patch)
    onChange([...item.copies.map((other, i) => (i === index ? { ...other, qty: other.qty - 1 } : other)), { ...copy, qty: 1, ...patch }])
  }


  const choose = (id: string) => {
    if (!picking) return
    const printing = printings.find((p) => p.id === id)
    if (picking.mode === 'change') {
      const copy = item.copies[picking.index]
      update(
        picking.index,
        printing
          ? { set: printing.set, collector: printing.collectorNumber, foil: finishFor(printing, copy.foil) }
          : { set: undefined, collector: undefined }
      )
    } else if (printing) {
      const version = { set: printing.set, collector: printing.collectorNumber }
      const plainIndex = item.copies.findIndex((copy) => !copy.set)
      const foil = finishFor(printing, plainIndex >= 0 ? item.copies[plainIndex].foil : false)
      const copies = item.copies.map((copy, i) => (i === plainIndex ? { ...copy, qty: copy.qty - 1 } : copy))
      onChange([...copies, { qty: 1, ...version, foil }])
    } else {
      onChange([...item.copies, { qty: 1, foil: false }])
    }
    setPicking(null)
  }

  const pickingCopy = picking?.mode === 'change' ? item.copies[picking.index] : undefined

  return (
    <Modal title={`Your ${item.name}`} onClose={onClose} size="wide">
      <p className="muted small">
        {cardCount(item.qty)} owned. Recording versions values your copies at their own price, and decks and wishlists
        show the version you own when they don&apos;t ask for one. A language is only a note; worthless copies
        (damaged, say) stay out of your inventory&apos;s value. Changing either moves one copy at a time.
      </p>
      <table className="cards-table versions-table">
        <tbody>
          {item.copies.map((copy, index) => {
            const printing = printingOf(copy)
            return (
              <tr key={`${copy.set ?? ''}|${copy.collector ?? ''}|${copy.foil}|${copy.lang ?? ''}|${!!copy.worthless}`}>
                <td className="col-qty">
                  <Stepper
                    value={copy.qty}
                    min={0}
                    onChange={(qty) => update(index, { qty })}
                    label={`copies of ${copyLabel(copy)}`}
                  />
                </td>
                <td className="versions-thumb">
                  {printing?.imageSmall ? <img src={printing.imageSmall} alt="" loading="lazy" /> : <span />}
                </td>
                <td>
                  {copy.set ? (
                    <span className="version">
                      <span className="set-code">{copyLabel({ ...copy, foil: false })}</span>
                      <span className="muted">{printing?.setName ?? (entry?.data ? 'Version not found' : 'Loading…')}</span>
                    </span>
                  ) : (
                    <span className="version">
                      <span className="auto-badge">Any version</span>
                      <span className="muted small">valued at the cheapest</span>
                    </span>
                  )}
                </td>
                <td>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={copy.foil}
                      disabled={!!printing && singleFinish(printing)}
                      onChange={(event) => update(index, { foil: event.target.checked })}
                    />
                    Foil
                  </label>
                </td>
                <td className="versions-lang">
                  {copy.lang && <LanguageFlag code={copy.lang} />}
                  <select
                    aria-label={`Language of one copy of ${copyLabel(copy)}`}
                    value={copy.lang ?? ''}
                    onChange={(event) => changeOne(index, { lang: languageOf(event.target.value) })}
                  >
                    <option value="">English</option>
                    {LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="check" title="Left out of your inventory's value: damaged, or not counted">
                    <input
                      type="checkbox"
                      checked={!!copy.worthless}
                      onChange={(event) => changeOne(index, { worthless: event.target.checked ? true : undefined })}
                    />
                    Worthless
                  </label>
                </td>
                <td className="col-actions">
                  <button type="button" onClick={() => setPicking({ mode: 'change', index })}>
                    {copy.set ? 'Change version' : 'Set version'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger-ghost"
                    onClick={() => update(index, { qty: 0 })}
                    title="Remove these copies"
                    aria-label={`Remove ${copyLabel(copy)}`}
                  >
                    <Icon name="close" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {picking ? (
        <section className="change-version">
          <h3>{picking.mode === 'add' ? 'Add a version' : `Version of your ${copyLabel(pickingCopy!)} copies`}</h3>
          {picking.mode === 'add' && (
            <p className="muted small">
              Picking a version turns one of your &ldquo;any version&rdquo; copies into it, or adds a copy if there are none.
            </p>
          )}
          <PickerBody name={item.name}>
            {(list) => (
              <VersionPicker
                printings={list}
                foil={pickingCopy?.foil ?? false}
                selected={pickingCopy?.set ? (printingOf(pickingCopy)?.id ?? '') : picking.mode === 'change' ? AUTO : ''}
                onSelect={choose}
              />
            )}
          </PickerBody>
          <button type="button" onClick={() => setPicking(null)}>
            Cancel
          </button>
        </section>
      ) : (
        <button type="button" onClick={() => setPicking({ mode: 'add' })}>
          <Icon name="plus" /> Add a version
        </button>
      )}
    </Modal>
  )
}
