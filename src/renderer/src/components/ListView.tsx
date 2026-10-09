import { useEffect, useState } from 'react'
import { filtersActive, needsCardData, NO_FILTERS, sortFor, type CardFilters } from '@shared/cards'
import { cardLines, nameKey } from '@shared/decklist'
import type { Version } from '@shared/inventory'
import { listColor } from '@shared/listColor'
import { listPriority } from '@shared/listPriority'
import { deckSizeCheck, listFormat } from '@shared/formats'
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
} from '@shared/listModel'
import type { CopyPool } from '@shared/copies'
import type { CardLine, InventoryItem } from '@shared/types'
import { getCardInfo } from '../stores/cardinfo'
import { cleanError } from '../lib/format'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import { priceDrop, useBaselines } from '../stores/history'
import { requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { useCommanderPicking } from '../hooks/useCommanderPicking'
import { listRows, summarize, type Row } from '../lib/summary'
import { CardRow } from './CardRow'
import { CardTile } from './CardTile'
import { CompleteBanner } from './CompleteBanner'
import { DeckStats } from './DeckStats'
import { DeckTokens } from './DeckTokens'
import { ListAddCards } from './ListAddCards'
import { ListDialogs, type ListDialog } from './ListDialogs'
import { ListHeader } from './ListHeader'
import { ListTable } from './ListTable'
import { ListValueCards } from './ListValueCards'
import { useToast } from './Toasts'

/** Props of {@link ListView}. */
interface ListViewProps {
  list: CardList
  inventory: Map<string, InventoryItem>
  /** Copy claims of all lists. */
  pool: CopyPool
  actions: LibraryActions
  /** Called with the new ref after a rename or move. */
  onOpenList: (list: ListRef) => void
}

/**
 * Deck or wishlist page: state and handlers; rendering is delegated to ListHeader, ListValueCards,
 * DeckStats, ListAddCards, ListTable and ListDialogs, and commander picking to
 * {@link useCommanderPicking}. Rules come from {@link analyzeList}. Lines pinned to
 * printings missing from a partial (basic land) result trigger a `full` fetch.
 */
export function ListView({ list, inventory, pool, actions, onOpenList }: ListViewProps) {
  const toast = useToast()
  usePrintingsVersion()
  const isDeck = list.kind === 'deck'
  const noun = isDeck ? 'deck' : 'list'
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<ListDialog | null>(null)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [hideOwned, setHideOwned] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)

  const cards = cardLines(list.lines)
  const settings = useSettings()
  const { bundleBasics } = settings
  const sortView = isDeck ? 'deck' : 'wishlist'
  const sort = sortFor(sortView, settings.sort)
  const sideboardAllowed = !listFormat(list.lines)?.commander
  const rows = listRows(list, inventory, settings, pool).map((row) =>
    row.held > 0 ? { ...row, holders: pool.holders(list, nameKey(row.line.name), row.inventoryQty) } : row
  )
  const mainRows = rows.filter((row) => !row.side)
  const summary = summarize(rows)
  const baselines = useBaselines()
  const dropOf = (row: Row) =>
    isDeck || row.bundledIds
      ? null
      : priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)

  const analysis = analyzeList(list.kind, list.lines, rows)
  const { format, copiesOf, isCommander, hasCommander, legalityErrors, ownershipErrors } = analysis
  const mainCards = summary.cards - analysis.sideboardCards
  const size = isDeck && format ? deckSizeCheck(format, mainCards) : null

  const { picking, canPickCommander, togglePicking, pickOf, isCrowned, chooseCommander } = useCommanderPicking(list, rows, analysis, actions)

  useEffect(() => {
    if (legalityErrors + ownershipErrors === 0) setOnlyProblems(false)
  }, [legalityErrors, ownershipErrors])

  const visibleRows = sortRows(filterRows(rows, list.kind, analysis, { filters, hideOwned, onlyProblems }), sort)
  const sections = sectionRows(visibleRows, analysis)

  const filtering = filtersActive(filters) || hideOwned || onlyProblems
  const dataLoading = needsCardData(filters) && rows.some((row) => !row.info && !row.entry?.data?.notFound)

  const capsFor = (name: string) =>
    copyCaps(
      list.kind,
      format,
      name,
      getCardInfo(name, bundleBasics),
      inventory.get(nameKey(name))?.qty ?? 0,
      pool.inOtherDecks(list, nameKey(name))
    )
  const limitFor = (name: string) => limitReason(format, name, capsFor(name))
  const maxFor = (line: CardLine) => lineMax(line, capsFor(line.name), copiesOf(line.name))

  const toggleOwned = (row: Row) => {
    const change = ownedToggle(row)
    if (change.kind === 'set') actions.setOwned(row.line.name, change.qty, lineVersion(row.line))
    else setDialog({ kind: 'unown', line: row.line, inventoryQty: row.inventoryQty, target: change.target })
  }

  const renderRow = (row: Row) => (
    <CardRow
      key={row.line.id}
      row={row}
      pick={pickOf(row)}
      onPick={() => chooseCommander(row)}
      leader={isCommander(row)}
      crowned={isCrowned(row)}
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
      pick={pickOf(row)}
      leader={isCommander(row)}
      crowned={isCrowned(row)}
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
    <div className="view" data-color={listColor(list.lines) ?? undefined}>
      <ListHeader
        name={list.name}
        noun={noun}
        format={format}
        picking={picking}
        hasCommander={hasCommander}
        canPickCommander={canPickCommander}
        legalityErrors={legalityErrors}
        ownershipErrors={ownershipErrors}
        separateCopies={pool.mode === 'separate'}
        onlyProblems={onlyProblems}
        onToggleProblems={() => setOnlyProblems(!onlyProblems)}
        onTogglePicking={togglePicking}
        onFormat={(formatId) => actions.setListFormat(list, formatId)}
        onEditText={() => setDialog({ kind: 'text' })}
        onCopy={() => window.api.copyText(list.text).then(() => toast(`${isDeck ? 'Deck' : 'List'} copied to clipboard`))}
        onColor={() => setDialog({ kind: 'color' })}
        priority={isDeck ? undefined : listPriority(list.lines)}
        onPriority={isDeck ? undefined : () => setDialog({ kind: 'priority' })}
        onRename={() => setDialog({ kind: 'rename' })}
        onDelete={() => setDialog({ kind: 'delete' })}
      />

      {complete && <CompleteBanner cards={summary.cards} onMove={moveToDecks} />}

      <ListValueCards
        isDeck={isDeck}
        summary={summary}
        mainCards={mainCards}
        size={size}
        target={isDeck ? (format?.deckSize ?? null) : null}
        lands={landCount(mainRows)}
        sideboard={analysis.sideboardCards}
        basis={settings.priceBasis}
      />

      <DeckStats
        rows={mainRows}
        manaValue={filters.manaValue}
        onManaValue={(manaValue) => setFilters({ ...filters, manaValue })}
      />

      <ListAddCards
        list={list}
        inventory={inventory}
        pool={pool}
        actions={actions}
        format={format}
        copiesOf={copiesOf}
        capsFor={capsFor}
        limitFor={limitFor}
        sideboardAllowed={sideboardAllowed}
        onAddPrecon={() => setDialog({ kind: 'precon' })}
        onAdding={setAdding}
      />

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

      {cards.length > 0 && <DeckTokens names={mainRows.map((row) => row.line.name)} />}

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
