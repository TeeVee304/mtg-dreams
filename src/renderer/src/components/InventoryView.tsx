import { useEffect, useMemo, useState } from 'react'
import {
  compareCards,
  filtersActive,
  isCardSort,
  matchesFilters,
  needsCardData,
  NO_FILTERS,
  sortFor,
  type CardFilters
} from '@shared/cards'
import { cardLines, nameKey } from '@shared/decklist'
import { hasVersions } from '@shared/inventory'
import { listColor } from '@shared/listColor'
import type { ThemeColor } from '@shared/themes'
import type { InventoryItem, ListKind } from '@shared/types'
import { getCardInfo, requestCardInfos, useCardInfoVersion } from '../stores/cardinfo'
import { inventoryValue, type ItemValue } from '../lib/collection'
import { formatEur } from '../lib/format'
import { useCopyPool } from '../hooks/useCopyPool'
import { inventoryText, type CardList, type LibraryActions, type ListRef } from '../stores/library'
import { usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { ListChip, NameCell, Price } from './CardCells'
import { CardSearch } from './CardSearch'
import { CardSortSelect } from './Controls'
import { TextEditorDialog } from './Dialogs'
import { copyLabel, InventoryVersionsDialog } from './InventoryVersions'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'
import { Stepper } from './Stepper'
import { SummaryItem } from './SummaryItem'
import { useToast } from './Toasts'

/** Copies of a card used by one list. */
interface Usage {
  list: string
  qty: number
  /** Copies lists ahead of this one claim first (separate copies). */
  held: number
  /** List color; null = app accent. */
  color: ThemeColor | null
}

/** Props of {@link InventoryView}. */
interface InventoryViewProps {
  inventory: Map<string, InventoryItem>
  lists: CardList[]
  actions: LibraryActions
  onOpenList: (list: ListRef) => void
  /** Opens precon import. */
  onAddPrecon: () => void
  /** Opens the Inventory Value dialog. */
  onValueDetails: () => void
  /** Opens with the text editor, to paste a collection. */
  startPasting?: boolean
}

/**
 * Inventory page: value summary, then a filterable, sortable table with value, version editing and
 * list usage. Uses the nearest inventory equivalent of the global sort. Requests card data for all
 * items (the app already requests their printings).
 */
export function InventoryView(props: InventoryViewProps) {
  const { inventory, lists, actions, onOpenList, onAddPrecon, onValueDetails, startPasting } = props
  const toast = useToast()
  useCardInfoVersion()
  usePrintingsVersion()
  const settings = useSettings()
  const { bundleBasics } = settings
  const sort = sortFor('inventory', settings.sort)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [editing, setEditing] = useState(startPasting ?? false)
  /** nameKey of the item in the versions dialog. */
  const [versionsOf, setVersionsOf] = useState<string | null>(null)
  const versionsItem = versionsOf ? inventory.get(versionsOf) : undefined

  const pool = useCopyPool(lists)
  /** Per nameKey: decks using and wishlists wanting the card. */
  const usage = useMemo(() => {
    const byKind: Record<ListKind, Map<string, Usage[]>> = { deck: new Map(), wishlist: new Map() }
    for (const list of lists) {
      const map = byKind[list.kind]
      const color = listColor(list.lines)
      for (const line of cardLines(list.lines)) {
        const key = nameKey(line.name)
        const entries = map.get(key) ?? []
        const existing = entries.find((e) => e.list === list.name)
        if (existing) existing.qty += line.qty
        else entries.push({ list: list.name, qty: line.qty, held: pool.held(list, key), color })
        map.set(key, entries)
      }
    }
    return byKind
  }, [lists, pool])

  useEffect(() => {
    requestCardInfos(
      [...inventory.values()].map((item) => item.name),
      bundleBasics
    )
  }, [inventory, bundleBasics])

  const worth = inventoryValue(inventory, bundleBasics)
  const items = [...inventory].map(([key, item]) => ({
    ...item,
    info: getCardInfo(item.name, bundleBasics),
    value: worth.items.get(key)!
  }))
  const visible = items.filter((item) => matchesFilters(item.name, item.info, undefined, filters))
  visible.sort((a, b) =>
    isCardSort(sort)
      ? compareCards(sort, a, b)
      : sort === 'value'
        ? valueOrder(b.value) - valueOrder(a.value) || a.name.localeCompare(b.name)
        : b.qty - a.qty || a.name.localeCompare(b.name)
  )

  const visibleCopies = visible.reduce((sum, item) => sum + item.qty, 0)
  const dataLoading = needsCardData(filters) && items.some((item) => item.info === undefined)

  const usageChips = (item: InventoryItem, kind: ListKind) => {
    const entries = usage[kind].get(nameKey(item.name)) ?? []
    if (entries.length === 0) return <span className="muted">—</span>
    return entries.map((entry) => {
      const got = Math.min(entry.qty, Math.max(0, item.qty - entry.held))
      const short = got < entry.qty
      const ahead = entry.held > 0 ? `; ${Math.min(entry.held, item.qty)} of yours go to ${kind === 'deck' ? 'decks' : 'decks and lists'} ahead of it` : ''
      return (
        <ListChip
          key={entry.list}
          color={entry.color}
          className={kind === 'deck' && short ? 'short' : undefined}
          onClick={() => onOpenList({ kind, name: entry.list })}
          title={`${entry.list} ${kind === 'deck' ? 'uses' : 'wants'} ${entry.qty}, ${got} covered${ahead}`}
        >
          {entry.list} · {kind === 'deck' && !short ? entry.qty : `${got}/${entry.qty}`}
        </ListChip>
      )
    })
  }

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Inventory</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setEditing(true)}>
            Edit as text
          </button>
          <button
            type="button"
            onClick={() => window.api.copyText(inventoryText(inventory)).then(() => toast('Inventory copied to clipboard'))}
          >
            Copy as text
          </button>
        </div>
      </header>

      {items.length > 0 && (
        <section className="summary-strip">
          <SummaryItem
            label="Inventory value"
            value={formatEur(worth.total)}
            accent
            note={worth.pending > 0 ? `Typical prices · ${worth.pending} loading` : 'Typical prices'}
            action={
              <button type="button" className="value-details-btn" onClick={onValueDetails} aria-label="Changes and top cards">
                <Icon name="sparkle" />
                <span className="tip tip-end" role="tooltip" aria-hidden="true">
                  Changes and top cards
                </span>
              </button>
            }
          />
          <SummaryItem label="Cards" value={String(worth.copies)} note={`${items.length} unique`} />
        </section>
      )}

      <div className="search-row">
        <CardSearch
          placeholder="Add a card you own…  (Ctrl+K)"
          onPick={(name) => {
            const qty = (inventory.get(nameKey(name))?.qty ?? 0) + 1
            actions.setOwned(name, qty)
            toast(`${name}: ${qty} owned`)
          }}
        />
        <button type="button" onClick={onAddPrecon} title="Adds the precon's cards here and creates a deck with them">
          Add precon…
        </button>
      </div>

      {items.length > 0 ? (
        <>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            namePlaceholder="Filter by name…"
            loadingNote={dataLoading ? 'Loading card data…' : undefined}
            end={<CardSortSelect view="inventory" value={sort} />}
          >
            {filtersActive(filters) && (
              <span className="muted small">
                Showing {visibleCopies} of {worth.copies} copies
              </span>
            )}
          </FilterBar>
          <table className="cards-table inventory-table">
            <thead>
              <tr>
                <th className="col-qty">Owned</th>
                <th>Card</th>
                <th>In decks</th>
                <th>Wanted in</th>
                <th className="col-num" title="Cardmarket's typical price, as in Inventory Value">
                  Value
                </th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={nameKey(item.name)}>
                  <td className="col-qty">
                    <Stepper
                      value={item.qty}
                      min={1}
                      onChange={(qty) => actions.setOwned(item.name, qty)}
                      label={`owned copies of ${item.name}`}
                    />
                  </td>
                  <NameCell images={item.value.printing} name={item.name} loading={item.value.status === 'loading'}>
                    <span className="card-name" title={item.name}>
                      {item.name}
                    </span>
                    {hasVersions(item) &&
                      item.copies
                        .filter((copy) => copy.set || copy.foil)
                        .map((copy) => (
                          <button
                            key={copyLabel(copy)}
                            type="button"
                            className={`chip link${copy.foil ? ' foil' : ''}`}
                            onClick={() => setVersionsOf(nameKey(item.name))}
                            title="Your versions of this card"
                          >
                            {copy.qty}× {copyLabel(copy)}
                          </button>
                        ))}
                  </NameCell>
                  <td>
                    <div className="chips">{usageChips(item, 'deck')}</div>
                  </td>
                  <td>
                    <div className="chips">{usageChips(item, 'wishlist')}</div>
                  </td>
                  <td className="col-num">
                    <ValuePrice value={item.value} qty={item.qty} />
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="versions-btn"
                      onClick={() => setVersionsOf(nameKey(item.name))}
                      title="Which versions and foils you own"
                      aria-label={`Versions of ${item.name} you own`}
                    >
                      <Icon name="versions" />
                      <span className="versions-label">Versions</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger-ghost"
                      onClick={() => actions.setOwned(item.name, 0)}
                      title="Remove from inventory"
                      aria-label="Remove from inventory"
                    >
                      <Icon name="close" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="muted empty-filter">No cards match the current filters.</p>}
        </>
      ) : (
        <div className="empty">
          <p>Your inventory is empty.</p>
          <p className="muted">
            Search above, add a precon you own, tick cards in a wishlist, or use <em>Edit as text</em> to paste your
            collection.
          </p>
        </div>
      )}

      {versionsItem && (
        <InventoryVersionsDialog
          item={versionsItem}
          onChange={(copies) => actions.setCopies(versionsItem.name, copies)}
          onClose={() => setVersionsOf(null)}
        />
      )}

      {editing && (
        <TextEditorDialog
          title="Edit inventory as text"
          initial={inventoryText(inventory)}
          mode="inventory"
          onClose={() => setEditing(false)}
          onSave={(value) => actions.replaceInventoryText(value)}
        />
      )}
    </div>
  )
}

/** Value sort rank: priced by total, then loading, then unpriced. */
function valueOrder(value: ItemValue): number {
  if (value.status === 'priced' || value.status === 'free') return value.total
  return value.status === 'loading' ? -1 : -2
}

/** Value column cell by {@link ItemValue.status}. */
function ValuePrice({ value, qty }: { value: ItemValue; qty: number }) {
  if (value.status === 'priced') {
    return (
      <Price
        unit={value.unit}
        qty={qty}
        total={value.total}
        title={value.unpriced > 0 ? 'Some versions have no price and are left out' : undefined}
      />
    )
  }
  return <Price unit={value.status === 'loading' ? undefined : value.status === 'free' ? 0 : null} free={value.status === 'free'} />
}
