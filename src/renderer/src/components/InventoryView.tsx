import { useEffect, useMemo, useState } from 'react'
import {
  compareCards,
  filtersActive,
  isCardSort,
  matchesFilters,
  needsCardData,
  NO_FILTERS,
  sortFor,
  type CardFilters,
  type SortKey
} from '@shared/cards'
import { nameKey, serializeInventory } from '@shared/decklist'
import { unionCardLines } from '@shared/listVersion'
import { hasVersions } from '@shared/inventory'
import { listColor } from '@shared/listColor'
import type { ThemeColor } from '@shared/themes'
import { totalCopies } from '@shared/totals'
import type { InventoryItem, ListKind, LocalizedQuery } from '@shared/types'
import { ui } from '@shared/text'
import { getCardInfo, requestCardInfos, useCardInfoVersion } from '../stores/cardinfo'
import { lastVersion, rememberVersion } from '../stores/lastVersions'
import { inventoryValue, type ItemValue } from '../lib/collection'
import { artCrop } from '../lib/artwork'
import { formatEur } from '../lib/format'
import { useCopyPool } from '../hooks/useCopyPool'
import { inventoryText, type CardList, type LibraryActions, type ListRef } from '../stores/library'
import { usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { ListChip, NameCell, Price } from './CardCells'
import { AddCardPanel } from './CardEditors'
import { CardSearch } from './CardSearch'
import { CardSortSelect, SortHeader } from './Controls'
import { TextEditorDialog } from './Dialogs'
import { copyLabel, InventoryVersionsDialog } from './InventoryVersions'
import { LanguageFlag } from './LanguageFlag'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'
import { MenuButton } from './MenuButton'
import { Stepper } from './Stepper'
import { SummaryItem } from './SummaryItem'
import { useToast } from './Toasts'
import { useCopy } from '../hooks/useCopy'

/** Copies of a card used by one list. */
interface Usage {
  list: string
  qty: number
  /** Copies other lists hold first (`CopyPool.held`). */
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
/**
 * @returns What an Inventory row previews: its Card in another language when all its copies are in
 * that one language, the copy's printing looked for first if they are all one printing; undefined otherwise.
 */
function localizedQuery(item: InventoryItem): LocalizedQuery | undefined {
  const [first] = item.copies
  if (!first?.lang || item.copies.some((copy) => copy.lang !== first.lang)) return undefined
  const one = item.copies.every((copy) => copy.set === first.set && copy.collector === first.collector)
  return { name: item.name, lang: first.lang, ...(one && first.set && first.collector && { set: first.set, collector: first.collector }) }
}

export function InventoryView(props: InventoryViewProps) {
  const { inventory, lists, actions, onOpenList, onAddPrecon, onValueDetails, startPasting } = props
  const toast = useToast()
  const copy = useCopy()
  useCardInfoVersion()
  usePrintingsVersion()
  const settings = useSettings()
  const text = ui.inventory
  const { bundleBasics } = settings
  const sort = sortFor('inventory', settings.sort)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [editing, setEditing] = useState(startPasting ?? false)
  /** nameKey of the item in the versions dialog. */
  const [versionsOf, setVersionsOf] = useState<string | null>(null)
  /** Card picked in the search, in the "choose version" step. */
  const [adding, setAdding] = useState<string | null>(null)
  /** Version the step starts from: the last one chosen for the Card. */
  const start = useMemo(() => (adding ? lastVersion(adding) : null), [adding])
  const versionsItem = versionsOf ? inventory.get(versionsOf) : undefined

  const pool = useCopyPool(lists)
  /** Per nameKey: decks using and wishlists wanting the card. */
  const usage = useMemo(() => {
    const byKind: Record<ListKind, Map<string, Usage[]>> = { deck: new Map(), wishlist: new Map(), brew: new Map() }
    for (const list of lists) {
      const map = byKind[list.kind]
      const color = listColor(list.lines)
      for (const line of unionCardLines(list.lines)) {
        const key = nameKey(line.name)
        const entries = map.get(key) ?? []
        const existing = entries.find((e) => e.list === list.name)
        if (existing) existing.qty += line.qty
        else entries.push({ list: list.name, qty: line.qty, held: pool.held(list, key, inventory.get(key)?.qty ?? 0), color })
        map.set(key, entries)
      }
    }
    return byKind
  }, [inventory, lists, pool])

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
  /** Reversed only when the inventory has the chosen sort, not a stand-in for it. */
  const reverse = settings.sortReverse && sort === settings.sort
  /** Copies of a card across the lists of `kind`, then how many lists. */
  const used = (kind: ListKind, name: string) => {
    const entries = usage[kind].get(nameKey(name)) ?? []
    return [entries.reduce((sum, entry) => sum + entry.qty, 0), entries.length] as const
  }
  /** Usual direction: A–Z for card sorts, highest first otherwise. */
  const compare = (a: (typeof items)[number], b: (typeof items)[number]): number => {
    if (isCardSort(sort)) return compareCards(sort, a, b)
    if (sort === 'decks' || sort === 'wanted') {
      const kind = sort === 'decks' ? 'deck' : 'wishlist'
      const [copiesA, listsA] = used(kind, a.name)
      const [copiesB, listsB] = used(kind, b.name)
      return copiesB - copiesA || listsB - listsA || a.name.localeCompare(b.name)
    }
    if (sort === 'value') return valueOrder(b.value) - valueOrder(a.value) || a.name.localeCompare(b.name)
    return b.qty - a.qty || a.name.localeCompare(b.name)
  }
  visible.sort((a, b) => {
    // Cards still loading or unpriced stay last either way.
    if (sort === 'value') return valueTier(a.value) - valueTier(b.value) || (reverse ? -compare(a, b) : compare(a, b))
    return reverse ? -compare(a, b) : compare(a, b)
  })
  const sortHeader = (id: SortKey, label: string, className?: string, title?: string) => (
    <SortHeader id={id} label={label} sort={sort} reverse={reverse} className={className} title={title} />
  )

  const visibleCopies = totalCopies(visible)
  /** Art of the six most valuable cards, for the header. */
  const showcase = settings.cardImages
    ? items
        .filter((item) => item.value.status === 'priced' && artCrop(item.value.printing))
        .sort((a, b) => b.value.total - a.value.total)
        .slice(0, 6)
        .map((item) => artCrop(item.value.printing)!)
    : []
  const dataLoading = needsCardData(filters) && items.some((item) => item.info === undefined)

  /** A quiet chip naming how many brews have the card, opening a menu of them; null for none. */
  const brewsChip = (item: InventoryItem) => {
    const brews = usage.brew.get(nameKey(item.name)) ?? []
    if (brews.length === 0) return null
    const label = ui.count.brews(brews.length)
    return (
      <MenuButton
        label={text.inBrews(label)}
        trigger={{ content: label, className: 'chip link brew-chip' }}
        items={brews.map((entry) => ({ label: entry.list, onSelect: () => onOpenList({ kind: 'brew', name: entry.list }) }))}
      />
    )
  }

  const usageChips = (item: InventoryItem, kind: ListKind) => {
    const entries = usage[kind].get(nameKey(item.name)) ?? []
    if (entries.length === 0) return kind === 'wishlist' && usage.brew.has(nameKey(item.name)) ? null : <span className="muted">—</span>
    return entries.map((entry) => {
      const got = Math.min(entry.qty, Math.max(0, item.qty - entry.held))
      const short = got < entry.qty
      return (
        <ListChip
          key={entry.list}
          color={entry.color}
          className={kind === 'deck' && short ? 'short' : undefined}
          onClick={() => onOpenList({ kind, name: entry.list })}
          title={text.usage(entry.list, kind === 'deck', entry.qty, got, Math.min(entry.held, item.qty), kind === 'deck')}
        >
          {entry.list} · {kind === 'deck' && !short ? entry.qty : `${got}/${entry.qty}`}
        </ListChip>
      )
    })
  }

  return (
    <div className="view">
      <header className={`view-header${showcase.length > 0 ? ' art-hero inventory-hero' : ''}`}>
        {showcase.length > 0 && (
          <div className="hero-strip" aria-hidden="true">
            {showcase.map((art) => (
              <img key={art} src={art} alt="" draggable={false} />
            ))}
          </div>
        )}
        <div className="header-title">
          {showcase.length > 0 && <p className="hero-eyebrow">{text.eyebrow}</p>}
          <h1>{text.title}</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setEditing(true)}>
            {text.editAsText}
          </button>
          <MenuButton
            label={text.more}
            items={[
              {
                label: text.copyAsText,
                // Other apps don't know languages or worthless marks: the copy leaves them out.
                onSelect: () =>
                  void copy(serializeInventory(inventory, true), text.copied)
              }
            ]}
          />
        </div>
      </header>

      {items.length > 0 && (
        <section className="summary-strip">
          <SummaryItem
            label={text.value}
            value={formatEur(worth.total)}
            accent
            note={text.typicalPrices(worth.pending)}
            action={
              <button type="button" className="value-details-btn" onClick={onValueDetails} aria-label={text.details}>
                <Icon name="sparkle" />
              </button>
            }
          />
          <SummaryItem label={text.cards} value={String(worth.copies)} note={text.unique(items.length)} />
        </section>
      )}

      <div className="search-row">
        <CardSearch
          placeholder={text.addCard}
          onPick={setAdding}
        />
        <button type="button" onClick={onAddPrecon} title={text.addPreconHint}>
          {text.addPrecon}
        </button>
      </div>
      {adding && (
        <AddCardPanel
          key={adding}
          name={adding}
          initial={start ?? undefined}
          languages
          paper
          auto={{ title: text.versionsDialog.anyVersion, subtitle: text.versionsDialog.cheapest }}
          actionLabel={text.addToInventory}
          note={inventory.has(nameKey(adding)) ? text.youOwn(inventory.get(nameKey(adding))!.qty) : undefined}
          onCancel={() => setAdding(null)}
          onAdd={({ name, qty, set, collector, foil, lang }) => {
            const version = { set, collector, foil, lang }
            actions.addOwned([{ name, qty, ...version }])
            rememberVersion(name, version)
            setAdding(null)
            toast(text.owned(name, (inventory.get(nameKey(name))?.qty ?? 0) + qty))
          }}
        />
      )}

      {items.length > 0 ? (
        <>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            namePlaceholder={text.filterByName}
            loadingNote={dataLoading ? text.loadingCardData : undefined}
            end={<CardSortSelect view="inventory" value={sort} />}
          >
            {filtersActive(filters) && (
              <span className="muted small">{text.showing(visibleCopies, worth.copies)}</span>
            )}
          </FilterBar>
          <table className="cards-table inventory-table">
            <thead>
              <tr>
                {sortHeader('qty', text.columns.owned, 'col-qty')}
                {sortHeader('name', text.columns.card)}
                {sortHeader('decks', text.columns.decks)}
                {sortHeader('wanted', text.columns.wanted)}
                {sortHeader('value', text.columns.value, 'col-num', text.valueHint)}
                <th className="col-actions" aria-label={text.columns.actions} />
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
                      label={text.ownedLabel(item.name)}
                    />
                  </td>
                  <NameCell
                    images={item.value.printing}
                    name={item.name}
                    loading={item.value.status === 'loading'}
                    localized={localizedQuery(item)}
                  >
                    <span className="card-name" title={item.name}>
                      {item.name}
                    </span>
                    {hasVersions(item) &&
                      item.copies
                        .filter((copy) => copy.set || copy.foil || copy.lang || copy.worthless)
                        .map((copy) => (
                          <button
                            key={`${copyLabel(copy)}|${copy.lang ?? ''}`}
                            type="button"
                            className={`chip link${copy.foil ? ' foil' : ''}${copy.worthless ? ' worthless' : ''}`}
                            onClick={() => setVersionsOf(nameKey(item.name))}
                            title={text.yourVersions}
                            aria-label={`${copy.qty}× ${copyLabel(copy)}`}
                          >
                            {/* The foil chip's rainbow says Foil; screen readers get it from the label. */}
                            {copy.qty}× {copyLabel({ ...copy, foil: false })}
                            {copy.lang && <LanguageFlag code={copy.lang} />}
                          </button>
                        ))}
                  </NameCell>
                  <td>
                    <div className="chips">{usageChips(item, 'deck')}</div>
                  </td>
                  <td>
                    <div className="chips">
                      {usageChips(item, 'wishlist')}
                      {brewsChip(item)}
                    </div>
                  </td>
                  <td className="col-num">
                    <ValuePrice value={item.value} qty={item.qty} />
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="versions-btn"
                      onClick={() => setVersionsOf(nameKey(item.name))}
                      title={text.versionsHint}
                      aria-label={text.versionsOf(item.name)}
                    >
                      <Icon name="versions" />
                      <span className="versions-label">{text.versions}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger-ghost"
                      onClick={() => actions.setOwned(item.name, 0)}
                      title={text.remove}
                      aria-label={text.remove}
                    >
                      <Icon name="close" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="muted empty-filter">{text.noMatch}</p>}
        </>
      ) : (
        <div className="empty">
          <p>{text.empty}</p>
          <p className="muted">
            {text.emptyHintBefore} <em>{text.editAsText}</em> {text.emptyHintAfter}
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
          title={text.editTitle}
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
  if (value.status === 'priced' || value.status === 'free' || value.status === 'none') return value.total
  return value.status === 'loading' ? -1 : -2
}

/** Value sort group: priced first, then loading, then unpriced. */
function valueTier(value: ItemValue): number {
  if (value.status === 'priced' || value.status === 'free' || value.status === 'none') return 0
  return value.status === 'loading' ? 1 : 2
}

/** Value column cell by {@link ItemValue.status}. */
function ValuePrice({ value, qty }: { value: ItemValue; qty: number }) {
  if (value.status === 'priced') {
    return (
      <Price
        unit={value.unit}
        qty={qty}
        total={value.total}
        title={
          [
            value.unpriced > 0 && ui.inventory.unpricedVersions,
            value.worthless > 0 && ui.inventory.worthlessCount(value.worthless)
          ]
            .filter(Boolean)
            .join('. ') || undefined
        }
      />
    )
  }
  if (value.status === 'none') {
    return (
      <span className="muted" title={ui.inventory.worthlessHint}>
        {ui.inventory.worthless}
      </span>
    )
  }
  return <Price unit={value.status === 'loading' ? undefined : value.status === 'free' ? 0 : null} free={value.status === 'free'} />
}
