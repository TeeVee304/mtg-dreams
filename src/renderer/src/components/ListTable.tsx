import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import type { CardFilters, ColorFilter, SortKey } from '@shared/cards'
import { MAYBEBOARD_SECTION, type Section } from '@shared/listModel'
import { ui } from '@shared/text'
import { formatEur } from '../lib/format'
import { updateSettings, useSettings } from '../stores/settings'
import { summarize, type Row, type Summary } from '../lib/summary'
import { useNarrowTables } from '../hooks/useNarrow'
import { CardSortSelect, Segmented, SortHeader } from './Controls'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'

/** Card view options. */
const CARD_VIEWS = [
  { id: 'table', ...ui.list.table.views.table },
  { id: 'grid', ...ui.list.table.views.grid }
] as const

/** Sections folded until opened: the maybeboard, which only holds ideas. */
const FOLDED_AT_FIRST = [MAYBEBOARD_SECTION]

/** Session-only folded section ids per list key. */
const folded = new Map<string, Set<string>>()

/** Drag data type of a card line dragged between category sections. */
const LINE_DRAG = 'application/x-mtg-dreams-line'

/** What a list grouped by category does with its rows and sections, when its categories can be edited. */
export interface CategoryControls {
  /** A right-click on a main-deck row, by its line id; returns whether a menu opened. */
  onRowMenu: (lineId: string, x: number, y: number) => boolean
  /** A right-click on a category section's title. */
  onSectionMenu: (section: Section<Row>, x: number, y: number) => void
  /** A row dropped on a section: its category, or null for Uncategorized. */
  onDrop: (lineId: string, category: string | null) => void
}

/** Props of {@link ListTable}. */
interface ListTableProps {
  /** List identity for remembering folded sections. */
  listKey: string
  isDeck: boolean
  sections: Section<Row>[]
  /** Renders a table row. */
  renderRow: (row: Row) => ReactNode
  /** Renders a grid tile. */
  renderTile: (row: Row) => ReactNode
  /** Row count after filtering. */
  visibleRows: number
  /** Summary of filtered rows. */
  visibleSummary: Summary
  /** Total copies, unfiltered. */
  totalCards: number
  /** View whose sort options are shown. */
  sortView: 'deck' | 'wishlist'
  sort: SortKey
  /** `sort` in the reverse of its usual direction. */
  sortReverse: boolean
  filters: CardFilters
  onFilters: (filters: CardFilters) => void
  /** The commanders' color identity, which limits the color filter; empty without commanders. */
  identity: ColorFilter[]
  /** Wishlists: hide fully owned lines. */
  hideOwned: boolean
  onHideOwned: (hide: boolean) => void
  /** Any filter active. */
  filtering: boolean
  /** Card data loading; data filters may be incomplete. */
  dataLoading: boolean
  /** Commander picking mode; forces all sections open. */
  picking: boolean
  /** A list grouped by category whose categories can be edited: right-click menus and dragging rows between sections. */
  categories?: CategoryControls
}

/** Filter bar plus foldable type sections (commander first) rendered as table or grid per settings. */
export function ListTable(props: ListTableProps) {
  const { isDeck, sections, renderRow, visibleSummary, filtering } = props
  const { cardView } = useSettings()
  const narrow = useNarrowTables()
  const sortProps = { sort: props.sort, reverse: props.sortReverse }
  const [closed, setClosed] = useState<Set<string>>(() => folded.get(props.listKey) ?? new Set(FOLDED_AT_FIRST))
  const toggle = (id: string) => {
    const next = new Set(closed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    folded.set(props.listKey, next)
    setClosed(next)
  }
  const drag = useCategoryDrag(props.categories)
  return (
    <>
      <FilterBar
        filters={props.filters}
        onChange={props.onFilters}
        identity={props.identity}
        namePlaceholder={ui.list.table.filterByName}
        loadingNote={props.dataLoading ? ui.list.table.stillLoading : undefined}
        end={
          <>
            <Segmented
              label={ui.list.table.view}
              options={CARD_VIEWS}
              value={cardView}
              onChange={(view) => void updateSettings({ cardView: view })}
            />
            <CardSortSelect view={props.sortView} value={props.sort} />
          </>
        }
      >
        {!isDeck && (
          <label className="check">
            <input type="checkbox" checked={props.hideOwned} onChange={(event) => props.onHideOwned(event.target.checked)} />
            {ui.list.table.hideOwned}
          </label>
        )}
        {filtering && (
          <span className="muted small">
            {ui.list.table.showing(
              visibleSummary.cards,
              ui.count.cards(props.totalCards),
              isDeck ? ui.list.table.value(formatEur(visibleSummary.total)) : ui.list.table.stillNeeded(formatEur(visibleSummary.neededValue))
            )}
          </span>
        )}
      </FilterBar>
      {cardView === 'grid' ? (
        <div className={`card-grid-view${props.picking ? ' picking' : ''}`}>
          {sections.map((section) => {
            const open = props.picking || !closed.has(section.id)
            return (
              <section
                key={section.id}
                className={`grid-section${section.id === 'Commander' ? ' commander-section' : ''}${drag.over === section.id ? ' drop-into' : ''}`}
                {...drag.sectionProps(section)}
              >
                <div className={`section-row grid-section-head${open ? '' : ' folded'}`} {...drag.headProps(section)}>
                  <SectionHead section={section} open={open} onToggle={() => toggle(section.id)} />
                </div>
                {open && <div className="card-grid">{section.rows.map(props.renderTile)}</div>}
              </section>
            )
          })}
        </div>
      ) : (
        <table className={`cards-table list-table${props.picking ? ' picking' : ''}`}>
          <thead>
            <tr>
              {!isDeck && (
                <SortHeader
                  id="owned"
                  label={ui.list.table.columns.owned}
                  className="col-owned"
                  title={ui.list.table.ownedHint}
                  {...sortProps}
                />
              )}
              <SortHeader id="qty" label={isDeck ? ui.list.table.columns.qty : ui.list.table.columns.wanted} className="col-qty" {...sortProps} />
              <SortHeader id="name" label={ui.list.table.columns.card} {...sortProps} />
              {!narrow && <th className="col-version">{ui.list.table.columns.version}</th>}
              <SortHeader id="unit" label={ui.list.table.columns.price} className="col-num" title={ui.list.table.priceHint} {...sortProps} />
              <th className="col-actions" aria-label={ui.list.table.columns.actions} />
            </tr>
          </thead>
          {sections.map((section) => {
            const open = props.picking || !closed.has(section.id)
            return (
              <tbody
                key={section.id}
                className={[section.id === 'Commander' && 'commander-section', drag.over === section.id && 'drop-into'].filter(Boolean).join(' ') || undefined}
                {...drag.sectionProps(section)}
              >
                <tr className={`section-row${open ? '' : ' folded'}`} {...drag.headProps(section)}>
                  <td colSpan={(isDeck ? 3 : 4) - (narrow ? 1 : 0)}>
                    <SectionTitle section={section} open={open} onToggle={() => toggle(section.id)} />
                  </td>
                  <td className="col-num">
                    <SectionValue section={section} />
                  </td>
                  <td className="col-actions" />
                </tr>
                {open && section.rows.map(renderRow)}
              </tbody>
            )
          })}
        </table>
      )}
      {props.visibleRows === 0 && <p className="muted empty-filter">{ui.list.table.noMatch}</p>}
    </>
  )
}

/** @returns The id of the card line an event happened on (`data-line-id`), with its element; null if none. */
function lineAt(target: EventTarget): { id: string; element: HTMLElement } | null {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-line-id]') : null
  return element?.dataset.lineId ? { id: element.dataset.lineId, element } : null
}

/**
 * Right-click menus and dragging rows between the sections of a list grouped by category: props for
 * each section (its rows' menus, and dropping) and its title (its own menu), and the section a row
 * is dragged over. Without controls, all props are empty.
 */
function useCategoryDrag(controls: CategoryControls | undefined) {
  const [over, setOver] = useState<string | null>(null)
  if (!controls) return { over: null, sectionProps: () => ({}), headProps: () => ({}) }
  const dragged = (event: DragEvent) => event.dataTransfer.types.includes(LINE_DRAG)
  return {
    over,
    sectionProps: (section: Section<Row>) => ({
      onDragStart: (event: DragEvent) => {
        const line = lineAt(event.target)
        if (!line) return
        event.dataTransfer.setData(LINE_DRAG, line.id)
        event.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => setOver(null),
      onContextMenu: (event: MouseEvent) => {
        const line = lineAt(event.target)
        // A table thumbnail keeps its image menu (Copy image); selected text, its Copy.
        const image = event.target instanceof HTMLImageElement && !line?.element.classList.contains('card-tile')
        if (!line || image || window.getSelection()?.toString().trim()) return
        if (controls.onRowMenu(line.id, event.clientX, event.clientY)) event.preventDefault()
      },
      ...(section.category !== undefined && {
        onDragOver: (event: DragEvent) => {
          if (!dragged(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          if (over !== section.id) setOver(section.id)
        },
        onDragLeave: (event: DragEvent) => {
          if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setOver(null)
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault()
          setOver(null)
          const id = event.dataTransfer.getData(LINE_DRAG)
          if (id) controls.onDrop(id, section.category ?? null)
        }
      })
    }),
    headProps: (section: Section<Row>) =>
      section.category
        ? {
            onContextMenu: (event: MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
              controls.onSectionMenu(section, event.clientX, event.clientY)
            }
          }
        : {}
  }
}

/** Props of {@link SectionHead}. */
interface SectionHeadProps {
  section: Section<Row>
  open: boolean
  onToggle: () => void
}

/** Grid section title bar: fold toggle with the card count, rule warning and value. */
function SectionHead(props: SectionHeadProps) {
  return (
    <>
      <SectionTitle {...props} />
      <SectionValue section={props.section} />
    </>
  )
}

/** A section's value; in the table it sits in the Price column. */
function SectionValue({ section }: { section: Section<Row> }) {
  return <span className="section-value">{formatEur(summarize(section.rows).total)}</span>
}

/** Fold toggle with the card count, and the section's rule warning. */
function SectionTitle({ section, open, onToggle }: SectionHeadProps) {
  const { cards } = summarize(section.rows)
  const leaders = section.id === 'Commander'
  return (
    <>
      <button
        type="button"
        className="section-toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? ui.list.table.fold(section.label) : ui.list.table.show(section.label)}
      >
        <span className="section-chevron" aria-hidden="true">
          <Icon name="chevron" />
        </span>
        {leaders && <Icon name="crown" />}
        {/* The Card type's symbol, shown on deck pages in a palette (deck-page.css). */}
        <span className="section-type" data-type={section.id} aria-hidden="true" />
        <span className="section-label">
          {section.label} · {cards}
        </span>
      </button>
      {section.warning && <span className="section-warning">{section.warning}</span>}
    </>
  )
}
