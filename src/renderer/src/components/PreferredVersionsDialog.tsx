import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { groupCoverage, preferredVersions, type GroupCoverage } from '@shared/listPreference'
import { findSetGroup, sortName } from '@shared/setGroups'
import { ui } from '@shared/text'
import type { CardList, LibraryActions } from '../stores/library'
import { getRefreshProgress, usePrintingsVersion } from '../stores/printings'
import { loadSetGroups, useSetGroups } from '../stores/setGroups'
import { useSettings } from '../stores/settings'
import type { Row } from '../lib/summary'
import { formatEur } from '../lib/format'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { useToast } from './Toasts'

/** Props of {@link PreferredVersionsDialog}. */
interface PreferredVersionsDialogProps {
  list: CardList
  /** The list's rows; maybeboard rows are left out of the counts. */
  rows: Row[]
  actions: LibraryActions
  onClose: () => void
}

/** Placeholder rows shown while the set groups load. */
const PLACEHOLDERS = 5

/**
 * Picks the set group whose Versions a wishlist or brew shows for Cards with no Version chosen. Only
 * groups with Versions of some of the list's Cards are offered, alphabetically after None and the
 * group in use, each with its set symbol, how many Cards it covers and what it changes in the price
 * of the Cards still needed.
 */
export function PreferredVersionsDialog({ list, rows, actions, onClose }: PreferredVersionsDialogProps) {
  const toast = useToast()
  const { priceBasis } = useSettings()
  const text = ui.listDialogs.preferred
  const { groups, progress } = useSetGroups()
  useEffect(() => void loadSetGroups(), [])

  const stored = preferredVersions(list.lines)
  const inUse = findSetGroup(groups ?? [], stored)
  const current = inUse?.name ?? stored ?? ''
  const [choice, setChoice] = useState<string | null>(null)
  const chosen = choice ?? current

  usePrintingsVersion()
  // Cards still loading, or Card data refreshing in the background: the counts may still grow.
  const cardsLoading = getRefreshProgress() !== null || rows.some((row) => !row.maybe && !row.bundledIds && !row.entry?.data)
  const coverage = useMemo(() => {
    const found = groupCoverage(
      rows
        .filter((row) => !row.maybe && !row.bundledIds)
        .flatMap((row) =>
          row.entry?.data && !row.entry.data.notFound
            ? [{ line: row.line, printings: row.entry.data.printings, owned: row.owned, showsOwned: !!row.resolution?.fromInventory }]
            : []
        ),
      groups ?? [],
      priceBasis
    )
    // The group in use first, then A–Z.
    return found.sort(
      (a, b) => Number(b.group.name === current) - Number(a.group.name === current) || sortName(a.group).localeCompare(sortName(b.group))
    )
  }, [groups, priceBasis, rows, current])

  const save = () => {
    if (chosen !== stored) {
      actions.setPreferredVersions(list, chosen || null)
      toast(chosen ? text.preferring(list.name, chosen) : text.stopped(list.name))
    }
    onClose()
  }

  const meta = ({ cards, total, change }: GroupCoverage) => (
    <span className="preferred-meta">
      <span>{text.coverage(cards, total)}</span>
      <span className="muted">
        {Math.abs(change) < 0.005 ? text.sameCost : text.priceChange(`${change > 0 ? '+' : '−'}${formatEur(Math.abs(change))}`)}
      </span>
    </span>
  )

  const option = (name: string, label: string, details: ReactNode, icon?: string) => (
    <label key={name || 'none'} className={`preferred-option${chosen === name ? ' on' : ''}`}>
      <input type="radio" name="preferred-group" checked={chosen === name} onChange={() => setChoice(name)} />
      {icon ? (
        <span className="set-symbol" style={{ maskImage: `url("${icon}")`, WebkitMaskImage: `url("${icon}")` }} aria-hidden="true" />
      ) : (
        <span className="set-symbol none" aria-hidden="true" />
      )}
      <span className="preferred-name">{label}</span>
      {details}
    </label>
  )

  return (
    <Modal
      title={text.title}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className="primary" onClick={save} disabled={groups === null}>
            {ui.dialogs.save}
          </button>
        </>
      }
    >
      <p className="preferred-intro">
        {text.intro}
        <span className="info-tip" tabIndex={0} aria-label={text.rules}>
          <Icon name="info" />
          <span className="tip" role="tooltip">
            {text.rules}
          </span>
        </span>
      </p>
      {groups === null ? (
        <div className="preferred-options" aria-busy="true">
          {Array.from({ length: PLACEHOLDERS }, (_, i) => (
            <div key={i} className="preferred-option placeholder" aria-hidden="true">
              <span className="skeleton symbol-placeholder" />
              <span className="skeleton" style={{ width: `${45 + ((i * 17) % 30)}%` }} />
              <span className="preferred-meta">
                <span className="skeleton" style={{ width: 70 }} />
                <span className="skeleton" style={{ width: 120 }} />
              </span>
            </div>
          ))}
          <p className="muted small preferred-status" role="status">
            {progress ? text.checking(progress.checked, progress.of) : text.loading}
          </p>
        </div>
      ) : groups.length === 0 ? (
        <p className="warn">{text.unavailable}</p>
      ) : (
        <div className="preferred-options" role="radiogroup" aria-label={text.title}>
          {option('', text.none, <span className="preferred-meta muted">{text.noneHint}</span>)}
          {coverage.map((found) => option(found.group.name, found.group.name, meta(found), found.group.icon))}
          {current && !coverage.some(({ group }) => group.name === current) &&
            option(current, current, <span className="preferred-meta muted">{text.noMatch}</span>, inUse?.icon)}
          {coverage.length === 0 && !current && <p className="muted small">{text.noMatch}</p>}
        </div>
      )}
      {cardsLoading && groups !== null && groups.length > 0 && <p className="muted small">{text.cardsLoading}</p>}
    </Modal>
  )
}
