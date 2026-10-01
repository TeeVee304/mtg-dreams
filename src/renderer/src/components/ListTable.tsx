import type { ReactNode } from 'react'
import { sortOptionsFor, type CardFilters, type SortKey } from '../../../shared/cards'
import type { Section } from '../../../shared/listModel'
import { cardCount, formatEur } from '../format'
import { updateSettings } from '../settings'
import { summarize, type Row, type Summary } from '../summary'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'

// A list's cards: the filter bar, then a table with one section per card type (the
// commander on top). Rows are drawn by the caller, which owns what they do.

interface ListTableProps {
  isDeck: boolean
  sections: Section<Row>[]
  renderRow: (row: Row) => ReactNode
  /** Rows left after filtering. */
  visibleRows: number
  visibleSummary: Summary
  /** All cards in the list, filtered or not. */
  totalCards: number
  /** Which list the app-wide sort is shown for. */
  sortView: 'deck' | 'wishlist'
  sort: SortKey
  filters: CardFilters
  onFilters: (filters: CardFilters) => void
  hideOwned: boolean
  onHideOwned: (hide: boolean) => void
  /** Any filter is narrowing the list. */
  filtering: boolean
  /** Card data still loading, so filters may hide cards they shouldn't. */
  dataLoading: boolean
  /** Choosing a commander. */
  picking: boolean
  onUnsetCommander: () => void
}

export function ListTable(props: ListTableProps) {
  const { isDeck, sections, renderRow, visibleSummary, filtering } = props
  return (
    <>
      <FilterBar
        filters={props.filters}
        onChange={props.onFilters}
        namePlaceholder="Filter by name…"
        loadingNote={props.dataLoading ? 'Some cards are still loading and are hidden by these filters.' : undefined}
      >
        {!isDeck && (
          <label className="check">
            <input type="checkbox" checked={props.hideOwned} onChange={(event) => props.onHideOwned(event.target.checked)} />
            Hide owned
          </label>
        )}
        {filtering && (
          <span className="muted small">
            Showing {visibleSummary.cards} of {cardCount(props.totalCards)} ·{' '}
            {isDeck ? `${formatEur(visibleSummary.total)} value` : `${formatEur(visibleSummary.neededValue)} still needed`}
          </span>
        )}
        <span className="spacer" />
        <label className="field-inline">
          Sort
          <select
            value={props.sort}
            onChange={(event) => void updateSettings({ sort: event.target.value as SortKey })}
            title="Applies to all decks, wishlists and the inventory"
          >
            {sortOptionsFor(props.sortView).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <table className={`cards-table${props.picking ? ' picking' : ''}`}>
        <thead>
          <tr>
            {!isDeck && (
              <th className="col-owned" title="Owned — shared across all lists through the Inventory">
                Owned
              </th>
            )}
            <th className="col-qty">Qty</th>
            <th>Card</th>
            <th className="col-version">Version</th>
            <th className="col-num">Unit</th>
            <th className="col-num">Total</th>
            <th className="col-actions" aria-label="Actions" />
          </tr>
        </thead>
        {sections.map((section) => {
          const sectionSummary = summarize(section.rows)
          const leaders = section.id === 'Commander'
          return (
            <tbody key={section.id} className={leaders ? 'commander-section' : undefined}>
              <tr className="section-row">
                <td colSpan={isDeck ? 6 : 7}>
                  <span>
                    {leaders && <Icon name="crown" />}
                    {section.label} · {sectionSummary.cards}
                  </span>
                  {leaders && (
                    <button
                      type="button"
                      className="section-action"
                      onClick={props.onUnsetCommander}
                      title="Stop using this card as the commander. It goes back to its type section."
                    >
                      Unset
                    </button>
                  )}
                  <span className="section-value">{formatEur(sectionSummary.total)}</span>
                </td>
              </tr>
              {section.rows.map(renderRow)}
            </tbody>
          )
        })}
      </table>
      {props.visibleRows === 0 && <p className="muted empty-filter">No cards match the current filters.</p>}
    </>
  )
}
