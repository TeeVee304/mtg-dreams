import { useState, type ReactNode } from 'react'
import { sortOptionsFor, type CardFilters, type SortKey } from '../../../shared/cards'
import type { Section } from '../../../shared/listModel'
import { cardCount, formatEur } from '../format'
import { updateSettings, useSettings } from '../settings'
import { summarize, type Row, type Summary } from '../summary'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'

// A list's cards: the filter bar, then one section per card type (the commander on
// top), as table rows or as a grid of card images (Settings remember which). Rows and
// tiles are drawn by the caller, which owns what they do. Sections fold away; which are
// folded is remembered per list while the app is open.

const folded = new Map<string, Set<string>>()

interface ListTableProps {
  /** Identifies the list, to remember its folded sections. */
  listKey: string
  isDeck: boolean
  sections: Section<Row>[]
  renderRow: (row: Row) => ReactNode
  renderTile: (row: Row) => ReactNode
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
  const { cardView } = useSettings()
  const [closed, setClosed] = useState<Set<string>>(() => folded.get(props.listKey) ?? new Set())
  const toggle = (id: string) => {
    const next = new Set(closed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    folded.set(props.listKey, next)
    setClosed(next)
  }
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
        <div className="segmented" role="radiogroup" aria-label="View">
          {(['table', 'grid'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="radio"
              aria-checked={cardView === view}
              className={cardView === view ? 'selected' : undefined}
              onClick={() => void updateSettings({ cardView: view })}
              title={view === 'table' ? 'Cards as table rows' : 'Cards as images'}
            >
              {view === 'table' ? 'Table' : 'Cards'}
            </button>
          ))}
        </div>
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
      {cardView === 'grid' ? (
        <div className={`card-grid-view${props.picking ? ' picking' : ''}`}>
          {sections.map((section) => {
            const sectionSummary = summarize(section.rows)
            const leaders = section.id === 'Commander'
            const open = props.picking || !closed.has(section.id)
            return (
              <section key={section.id} className={`grid-section${leaders ? ' commander-section' : ''}`}>
                <div className={`section-row grid-section-head${open ? '' : ' folded'}`}>
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => toggle(section.id)}
                    aria-expanded={open}
                    title={open ? `Fold ${section.label.toLowerCase()}` : `Show ${section.label.toLowerCase()}`}
                  >
                    <span className="section-chevron" aria-hidden="true">
                      <Icon name="chevron" />
                    </span>
                    {leaders && <Icon name="crown" />}
                    <span className="section-label">
                      {section.label} · {sectionSummary.cards}
                    </span>
                  </button>
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
                </div>
                {open && <div className="card-grid">{section.rows.map(props.renderTile)}</div>}
              </section>
            )
          })}
        </div>
      ) : (
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
            // While choosing a commander every card must be clickable, so nothing stays folded.
            const open = props.picking || !closed.has(section.id)
            return (
              <tbody key={section.id} className={leaders ? 'commander-section' : undefined}>
                <tr className={`section-row${open ? '' : ' folded'}`}>
                  <td colSpan={isDeck ? 6 : 7}>
                    <button
                      type="button"
                      className="section-toggle"
                      onClick={() => toggle(section.id)}
                      aria-expanded={open}
                      title={open ? `Fold ${section.label.toLowerCase()}` : `Show ${section.label.toLowerCase()}`}
                    >
                      <span className="section-chevron" aria-hidden="true">
                        <Icon name="chevron" />
                      </span>
                      {leaders && <Icon name="crown" />}
                      <span className="section-label">
                        {section.label} · {sectionSummary.cards}
                      </span>
                    </button>
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
                {open && section.rows.map(renderRow)}
              </tbody>
            )
          })}
        </table>
      )}
      {props.visibleRows === 0 && <p className="muted empty-filter">No cards match the current filters.</p>}
    </>
  )
}
