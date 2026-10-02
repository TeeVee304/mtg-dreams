import { useEffect, useMemo, useState } from 'react'
import { filtersActive, needsCardData, NO_FILTERS, sortFor, type CardFilters } from '../../../shared/cards'
import { cardLines, nameKey } from '../../../shared/decklist'
import { commanderRule } from '../../../shared/formats'
import type { Version } from '../../../shared/inventory'
import {
  analyzeList,
  copyCaps,
  filterRows,
  landCount,
  limitReason,
  lineMax,
  ownedToggle,
  sectionRows,
  sortRows
} from '../../../shared/listModel'
import type { CardLine, InventoryItem } from '../../../shared/types'
import { bundledBasic } from '../../../shared/basics'
import { getCardInfo } from '../cardinfo'
import { cleanError, formatDay } from '../format'
import type { CardList, LibraryActions, ListRef } from '../library'
import { priceDrop, useBaselines } from '../history'
import { requestPrintings, usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'
import { buildRows, summarize, type Row } from '../summary'
import { CardRow } from './CardRow'
import { CardTile } from './CardTile'
import { AddCardPanel } from './CardEditors'
import { CompleteBanner } from './CompleteBanner'
import { DeckStats } from './DeckStats'
import { CardSearch, type SearchChoice } from './CardSearch'
import { ListDialogs, type ListDialog } from './ListDialogs'
import { ListHeader } from './ListHeader'
import { ListTable } from './ListTable'
import { ListValueCards } from './ListValueCards'
import { useToast } from './Toasts'

/** Props of {@link ListView}. */
interface ListViewProps {
  list: CardList
  inventory: Map<string, InventoryItem>
  actions: LibraryActions
  /** Called with the new ref after a rename or move. */
  onOpenList: (list: ListRef) => void
}

/**
 * Deck or wishlist page: state and handlers; rendering is delegated to ListHeader, ListValueCards,
 * DeckStats, ListTable and ListDialogs. Rules come from {@link analyzeList}. Lines pinned to
 * printings missing from a partial (basic land) result trigger a `full` fetch.
 */
export function ListView({ list, inventory, actions, onOpenList }: ListViewProps) {
  const toast = useToast()
  usePrintingsVersion()
  const isDeck = list.kind === 'deck'
  const noun = isDeck ? 'deck' : 'list'
  const [adding, setAdding] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ListDialog | null>(null)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [hideOwned, setHideOwned] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)
  /** Commander picking mode: the next clicked card becomes commander. */
  const [picking, setPicking] = useState(false)
  /** nameKey of the just-chosen commander, for a brief animation. */
  const [crowned, setCrowned] = useState<string | null>(null)

  const cards = cardLines(list.lines)
  const settings = useSettings()
  const { bundleBasics } = settings
  const sortView = isDeck ? 'deck' : 'wishlist'
  const sort = sortFor(sortView, settings.sort)
  const rows = buildRows(cards, inventory, settings)
  const summary = summarize(rows)
  const baselines = useBaselines()
  const dropOf = (row: Row) =>
    isDeck || row.bundledIds
      ? null
      : priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)

  const analysis = analyzeList(list.kind, list.lines, rows)
  const { format, copiesOf, isCommander, canBeCommander, hasCommander, legalityErrors, ownershipErrors } = analysis

  useEffect(() => {
    if (!format?.commander) setPicking(false)
  }, [format?.commander])
  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setPicking(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])
  useEffect(() => {
    if (!crowned) return
    const timer = setTimeout(() => setCrowned(null), 1800)
    return () => clearTimeout(timer)
  }, [crowned])

  useEffect(() => {
    if (legalityErrors + ownershipErrors === 0) setOnlyProblems(false)
  }, [legalityErrors, ownershipErrors])

  const visibleRows = sortRows(filterRows(rows, list.kind, analysis, { filters, hideOwned, onlyProblems }), sort)
  const sections = sectionRows(visibleRows, analysis)

  const filtering = filtersActive(filters) || hideOwned || onlyProblems
  const dataLoading = needsCardData(filters) && rows.some((row) => !row.info && !row.entry?.data?.notFound)

  const inventoryChoices = useMemo<SearchChoice[]>(
    () => [...inventory.values()].map((item) => ({ name: item.name, hint: `${item.qty} owned` })),
    [inventory]
  )

  const capsFor = (name: string) =>
    copyCaps(list.kind, format, name, getCardInfo(name, bundleBasics), inventory.get(nameKey(name))?.qty ?? 0)
  const limitFor = (name: string) => limitReason(format, name, capsFor(name))
  const maxFor = (line: CardLine) => lineMax(line, capsFor(line.name), copiesOf(line.name))

  const pickCard = (name: string) => {
    const inList = copiesOf(name)
    if (capsFor(name).cap - inList <= 0) {
      toast(`${limitFor(name)}, and this ${noun} already has ${inList}.`, 'error')
      return
    }
    const generic = bundledBasic(name, bundleBasics)
    if (generic) {
      actions.addCards(list, [{ qty: 1, name: generic.info.name, foil: false }])
      toast(`Added 1× ${generic.info.name}`)
      return
    }
    setAdding(name)
  }

  const addCaps = adding ? capsFor(adding) : null
  const addInList = adding ? copiesOf(adding) : 0
  const addRoom = addCaps ? addCaps.cap - addInList : Infinity
  const addNote = [
    isDeck && addCaps && `You own ${addCaps.ownedCap}`,
    addInList > 0 && `${addInList} already in this ${noun}`,
    format && addCaps && Number.isFinite(addCaps.formatCap) && `${format.label}: max ${addCaps.formatCap}`
  ]
    .filter(Boolean)
    .join(' · ')

  const refreshPrices = () =>
    window.api.refreshPrices().then(
      ({ updated, pricedAt }) =>
        toast(
          updated
            ? `New Cardmarket prices loaded (${formatDay(pricedAt!)})`
            : `Prices are up to date: Cardmarket, ${pricedAt ? formatDay(pricedAt) : 'not loaded yet'}`
        ),
      (error) => toast(cleanError(error), 'error')
    )

  const toggleOwned = (row: Row) => {
    const change = ownedToggle(row)
    if (change.kind === 'set') actions.setOwned(row.line.name, change.qty, lineVersion(row.line))
    else setDialog({ kind: 'unown', line: row.line, inventoryQty: row.inventoryQty, target: change.target })
  }

  const displayName = (row: Row) => row.flavorName ?? row.line.name

  const togglePicking = () => {
    if (picking || !format?.commander) {
      setPicking(false)
      return
    }
    if (!rows.some((row) => canBeCommander(row) && !isCommander(row))) {
      const loadingData = rows.some((row) => !row.info && !row.bundledIds && !row.entry?.data?.notFound)
      toast(
        loadingData
          ? 'Card details are still loading. Try again in a moment.'
          : `No ${hasCommander ? 'other ' : ''}card in this ${noun} can be your commander: in ${format.label} it must be ${commanderRule(format)}.`,
        'error'
      )
      return
    }
    setPicking(true)
  }

  const chooseCommander = (row: Row) => {
    setPicking(false)
    if (isCommander(row)) {
      toast(`${displayName(row)} is already your commander`)
      return
    }
    actions.setListCommander(list, row.line.name)
    setCrowned(nameKey(row.line.name))
    toast(`${displayName(row)} now leads this ${noun}`)
  }

  const renderRow = (row: Row) => (
    <CardRow
      key={row.line.id}
      row={row}
      pick={picking ? (canBeCommander(row) ? 'ok' : 'no') : undefined}
      onPick={() => chooseCommander(row)}
      leader={isCommander(row)}
      crowned={crowned !== null && nameKey(row.line.name) === crowned}
      isDeck={isDeck}
      issue={analysis.issueOf(row)}
      shortfall={analysis.shortfallOf(row)}
      drop={dropOf(row)}
      maxQty={maxFor(row.line)}
      maxTitle={limitFor(row.line.name)}
      onQty={(qty) =>
        row.bundledIds ? actions.setBundledQty(list, row.bundledIds, qty) : actions.updateCard(list, row.line.id, { qty })
      }
      onToggleOwned={() => toggleOwned(row)}
      onOwnedDelta={(delta) => actions.setOwned(row.line.name, Math.max(0, row.inventoryQty + delta), lineVersion(row.line))}
      onOpen={() => setDialog({ kind: 'card', lineId: row.line.id })}
      onRemove={() => (row.bundledIds ? actions.removeCards(list, row.bundledIds) : actions.removeCard(list, row.line.id))}
      onRename={(name) => actions.updateCard(list, row.line.id, { name })}
    />
  )

  const renderTile = (row: Row) => (
    <CardTile
      key={row.line.id}
      row={row}
      isDeck={isDeck}
      pick={picking ? (canBeCommander(row) ? 'ok' : 'no') : undefined}
      leader={isCommander(row)}
      crowned={crowned !== null && nameKey(row.line.name) === crowned}
      issue={analysis.issueOf(row)}
      shortfall={analysis.shortfallOf(row)}
      onOpen={() => setDialog({ kind: 'card', lineId: row.line.id })}
      onPick={() => chooseCommander(row)}
    />
  )

  const needAllVersions = rows
    .filter((row) => row.resolution?.pinMissing && row.entry?.data?.partial && !row.entry.refreshing)
    .map((row) => row.line.name)
    .join('\n')
  useEffect(() => {
    for (const name of needAllVersions.split('\n')) if (name) requestPrintings(name, { full: true })
  }, [needAllVersions])

  const complete = !isDeck && summary.cards > 0 && summary.ownedCards >= summary.cards

  const moveToDecks = async () => {
    try {
      const moved = await actions.moveList(list, 'deck')
      onOpenList(moved)
      toast(`“${moved.name}” is now a deck`)
    } catch (error) {
      toast(`Could not move the list: ${cleanError(error)}`, 'error')
      throw error
    }
  }

  return (
    <div className="view">
      <ListHeader
        name={list.name}
        noun={noun}
        format={format}
        lines={cards.length}
        summary={summary}
        picking={picking}
        legalityErrors={legalityErrors}
        ownershipErrors={ownershipErrors}
        onlyProblems={onlyProblems}
        onToggleProblems={() => setOnlyProblems(!onlyProblems)}
        onTogglePicking={togglePicking}
        onFormat={(formatId) => actions.setListFormat(list, formatId)}
        onRefreshPrices={refreshPrices}
        onEditText={() => setDialog({ kind: 'text' })}
        onCopy={() => window.api.copyText(list.text).then(() => toast(`${isDeck ? 'Deck' : 'List'} copied to clipboard`))}
        onRename={() => setDialog({ kind: 'rename' })}
        onDelete={() => setDialog({ kind: 'delete' })}
      />

      {complete && <CompleteBanner cards={summary.cards} onMove={moveToDecks} />}

      <ListValueCards isDeck={isDeck} summary={summary} lines={cards.length} lands={landCount(rows)} basis={settings.priceBasis} />

      <DeckStats rows={rows} />

      <div className="search-row">
        {isDeck ? (
          <CardSearch placeholder="Add a card from your inventory…  (Ctrl+K)" choices={inventoryChoices} onPick={pickCard} />
        ) : (
          <>
            <CardSearch placeholder="Add a card to this list…  (Ctrl+K)" onPick={pickCard} />
            <button type="button" onClick={() => setDialog({ kind: 'precon' })}>
              Add precon…
            </button>
          </>
        )}
      </div>
      {adding && (
        <AddCardPanel
          key={adding}
          name={adding}
          maxQty={Number.isFinite(addRoom) ? addRoom : undefined}
          maxTitle={limitFor(adding)}
          note={addNote || undefined}
          actionLabel={isDeck ? 'Add to deck' : 'Add to list'}
          onCancel={() => setAdding(null)}
          onAdd={(card) => {
            actions.addCards(list, [card])
            setAdding(null)
            toast(`Added ${card.qty}× ${card.name}`)
          }}
        />
      )}

      {cards.length > 0 ? (
        <ListTable
          listKey={`${list.kind}/${list.name}`}
          isDeck={isDeck}
          sections={sections}
          renderRow={renderRow}
          renderTile={renderTile}
          visibleRows={visibleRows.length}
          visibleSummary={summarize(visibleRows)}
          totalCards={summary.cards}
          sortView={sortView}
          sort={sort}
          filters={filters}
          onFilters={setFilters}
          hideOwned={hideOwned}
          onHideOwned={setHideOwned}
          filtering={filtering}
          dataLoading={dataLoading}
          picking={picking}
          onUnsetCommander={() => actions.setListCommander(list, null)}
        />
      ) : (
        !adding && (
          <div className="empty">
            <p>This {noun} is empty.</p>
            <p className="muted">
              {isDeck
                ? 'Search your inventory above to add cards, or use Edit as text to paste a decklist.'
                : 'Search for a card above, add a precon, or use Edit as text to paste a whole list.'}
            </p>
          </div>
        )
      )}

      <ListDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        list={list}
        format={format}
        analysis={analysis}
        rows={rows}
        actions={actions}
        formatCap={(name) => capsFor(name).formatCap}
        maxFor={maxFor}
        limitFor={limitFor}
        onOpenList={onOpenList}
      />
    </div>
  )
}

/** @returns Version of a pinned line, used when its copies are added to the inventory; undefined if unpinned. */
function lineVersion(line: CardLine): Version | undefined {
  return line.set ? { set: line.set, collector: line.collector, foil: line.foil } : undefined
}
