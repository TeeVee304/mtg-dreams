import { useEffect, useMemo, useState } from 'react'
import {
  compareCards,
  filtersActive,
  isCardSort,
  matchesFilters,
  needsCardData,
  NO_FILTERS,
  sortFor,
  sortOptionsFor,
  type CardFilters,
  type SortKey
} from '../../../shared/cards'
import { bundledBasic } from '../../../shared/basics'
import { cardLines, nameKey, serializeInventory } from '../../../shared/decklist'
import { hasVersions } from '../../../shared/inventory'
import type { InventoryItem, ListKind } from '../../../shared/types'
import { getCardInfo, requestCardInfos, useCardInfoVersion } from '../cardinfo'
import { VALUATION_BASIS, valueItem, type ItemValue } from '../collection'
import { formatEur } from '../format'
import type { CardList, LibraryActions, ListRef } from '../library'
import { requestPrintings, usePrintingsVersion } from '../printings'
import { updateSettings, useSettings } from '../settings'
import { CardSearch } from './CardSearch'
import { TextEditorDialog } from './Dialogs'
import { copyLabel, InventoryVersionsDialog } from './InventoryVersions'
import { FilterBar } from './FilterBar'
import { previewHandlers } from './HoverPreview'
import { Icon } from './Icon'
import { CardThumb, Skeleton } from './Placeholders'
import { Stepper } from './Stepper'
import { useToast } from './Toasts'

interface Usage {
  list: string
  qty: number
}

interface InventoryViewProps {
  inventory: Map<string, InventoryItem>
  lists: CardList[]
  actions: LibraryActions
  onOpenList: (list: ListRef) => void
  onAddPrecon: () => void
}

export function InventoryView({ inventory, lists, actions, onOpenList, onAddPrecon }: InventoryViewProps) {
  const toast = useToast()
  useCardInfoVersion()
  usePrintingsVersion()
  const settings = useSettings()
  const { bundleBasics } = settings
  // The sort is one app-wide choice; the inventory uses the closest one it offers.
  const sort = sortFor('inventory', settings.sort)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [editing, setEditing] = useState(false)
  /** The card (name key) whose versions are being edited. */
  const [versionsOf, setVersionsOf] = useState<string | null>(null)
  const versionsItem = versionsOf ? inventory.get(versionsOf) : undefined

  /** For each card: the decks using it and the wishlists wanting it. */
  const usage = useMemo(() => {
    const byKind: Record<ListKind, Map<string, Usage[]>> = { deck: new Map(), wishlist: new Map() }
    for (const list of lists) {
      const map = byKind[list.kind]
      for (const line of cardLines(list.lines)) {
        const key = nameKey(line.name)
        const entries = map.get(key) ?? []
        const existing = entries.find((e) => e.list === list.name)
        if (existing) existing.qty += line.qty
        else entries.push({ list: list.name, qty: line.qty })
        map.set(key, entries)
      }
    }
    return byKind
  }, [lists])

  // Card data for filtering and sorting, fetched in batches.
  const namesKey = [...inventory.values()].map((item) => item.name).join('\n')
  useEffect(() => {
    const names = namesKey.split('\n').filter(Boolean)
    requestCardInfos(names, bundleBasics)
    // Versions and prices, for the Value column and the pictures.
    for (const name of names) if (!bundledBasic(name, bundleBasics)) requestPrintings(name)
  }, [namesKey, bundleBasics])

  const items = [...inventory.values()].map((item) => ({
    ...item,
    info: getCardInfo(item.name, bundleBasics),
    value: valueItem(item, VALUATION_BASIS, bundleBasics)
  }))
  const previewFor = (name: string) => {
    const generic = bundledBasic(name, bundleBasics)
    return previewHandlers(generic ? { src: generic.printing.imageNormal } : { name })
  }
  const visible = items.filter((item) => matchesFilters(item.name, item.info, undefined, filters))
  visible.sort((a, b) =>
    isCardSort(sort)
      ? compareCards(sort, a, b)
      : sort === 'value'
        ? valueOrder(b.value) - valueOrder(a.value) || a.name.localeCompare(b.name)
        : b.qty - a.qty || a.name.localeCompare(b.name)
  )

  const totalCopies = items.reduce((sum, item) => sum + item.qty, 0)
  const visibleCopies = visible.reduce((sum, item) => sum + item.qty, 0)
  const dataLoading = needsCardData(filters) && items.some((item) => item.info === undefined)
  const text = serializeInventory(inventory)

  const usageChips = (item: InventoryItem, kind: ListKind) => {
    const entries = usage[kind].get(nameKey(item.name)) ?? []
    if (entries.length === 0) return <span className="muted">—</span>
    return entries.map((entry) => (
      <button
        key={entry.list}
        type="button"
        className={`chip link${kind === 'deck' ? ' deck' : item.qty >= entry.qty ? ' done' : ''}`}
        onClick={() => onOpenList({ kind, name: entry.list })}
        title={kind === 'deck' ? `${entry.list} uses ${entry.qty}` : `${entry.list} wants ${entry.qty}`}
      >
        {entry.list} · {kind === 'deck' ? entry.qty : `${Math.min(item.qty, entry.qty)}/${entry.qty}`}
      </button>
    ))
  }

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Inventory</h1>
          <p className="muted">
            {items.length} unique cards · {totalCopies} copies
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setEditing(true)}>
            Edit as text
          </button>
          <button type="button" onClick={() => window.api.copyText(text).then(() => toast('Inventory copied to clipboard'))}>
            Copy
          </button>
        </div>
      </header>

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
          >
            {filtersActive(filters) && (
              <span className="muted small">
                Showing {visibleCopies} of {totalCopies} copies
              </span>
            )}
            <span className="spacer" />
            <label className="field-inline">
              Sort
              <select
                value={sort}
                onChange={(event) => void updateSettings({ sort: event.target.value as SortKey })}
                title="Applies to all decks, wishlists and the inventory"
              >
                {sortOptionsFor('inventory').map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
                  <td className="col-name" {...previewFor(item.name)}>
                    <div className="name-cell">
                      <CardThumb src={item.value.printing?.imageSmall} loading={item.value.status === 'loading'} />
                      <div className="name-main">
                        <span className="card-name">{item.name}</span>
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
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="chips">{usageChips(item, 'deck')}</div>
                  </td>
                  <td>
                    <div className="chips">{usageChips(item, 'wishlist')}</div>
                  </td>
                  <td className="col-num">
                    <ValueCell value={item.value} qty={item.qty} />
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
                      Versions
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
          initial={text}
          mode="inventory"
          onClose={() => setEditing(false)}
          onSave={(value) => actions.replaceInventoryText(value)}
        />
      )}
    </div>
  )
}

/** For sorting by value: priced cards by worth, then those still loading, then unpriced. */
function valueOrder(value: ItemValue): number {
  if (value.status === 'priced' || value.status === 'free') return value.total
  return value.status === 'loading' ? -1 : -2
}

function ValueCell({ value, qty }: { value: ItemValue; qty: number }) {
  if (value.status === 'loading') return <Skeleton width={52} />
  if (value.status === 'free') {
    return (
      <span className="muted" title="Bundled basic lands count as free">
        {formatEur(0)}
      </span>
    )
  }
  if (value.status === 'unpriced') return <span className="muted" title="No Cardmarket price">—</span>
  return (
    <span className="value-cell" title={value.unpriced > 0 ? 'Some versions have no price and are left out' : undefined}>
      <strong>{formatEur(value.total)}</strong>
      {qty > 1 && value.unit !== null && <span className="muted small">{formatEur(value.unit)} each</span>}
    </span>
  )
}
