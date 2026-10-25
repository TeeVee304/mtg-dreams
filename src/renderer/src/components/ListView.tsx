import { useEffect, useMemo, useState } from 'react'
import { filtersActive, needsCardData, NO_FILTERS, sortFor, type CardFilters } from '@shared/cards'
import { cardLines, nameKey } from '@shared/decklist'
import { otherVersions, type Version } from '@shared/inventory'
import { listColor } from '@shared/listColor'
import { isUnbuilt } from '@shared/listUnbuilt'
import { activeVariant, BASE, baseLabel, variantSwaps, versionFormatLabel } from '@shared/listVersion'
import { sumOf } from '@shared/totals'
import { deckSizeCheck, FORMATS, listFormat } from '@shared/formats'
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
import { ui } from '@shared/text'
import { getCardInfo } from '../stores/cardinfo'
import { useCommanderThemes } from '../features/deckWizard'
import { headerLeaders, listColors } from '../lib/listFigures'
import { HAND_SIZE } from '../lib/startingHand'
import { cleanError } from '../lib/format'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import { priceChange, useBaselines } from '../stores/history'
import { requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { useCommanderPicking } from '../hooks/useCommanderPicking'
import { useListMover } from '../hooks/useListMover'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { useListVersion } from '../hooks/useListVersion'
import { useUpgradeSwaps } from '../hooks/useUpgradeSwaps'
import { useStableHandlers } from '../hooks/useStableHandlers'
import { versionActions } from '../lib/versionActions'
import { listRows, summarize, type Row } from '../lib/summary'
import { CardRow, type RowHandlers } from './CardRow'
import { CardTile } from './CardTile'
import { Collapsible } from './Collapsible'
import { CompleteBanner } from './CompleteBanner'
import { DeckStats } from './DeckStats'
import { DeckTokens } from './DeckTokens'
import { Icon } from './Icon'
import { copyLabel } from './InventoryVersions'
import { ListAddCards } from './ListAddCards'
import { ListDialogs, type ListDialog } from './ListDialogs'
import { ListHeader } from './ListHeader'
import { ListTable } from './ListTable'
import { ListValueCards } from './ListValueCards'
import { SwapTable } from './SwapTable'
import { useToast } from './Toasts'

/** Props of {@link ListView}. */
interface ListViewProps {
  list: CardList
  /** All decks and wishlists. */
  lists: CardList[]
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
export function ListView({ list, lists, inventory, pool, actions, onOpenList }: ListViewProps) {
  const toast = useToast()
  const moveListTo = useListMover(actions)
  usePrintingsVersion()
  const isDeck = list.kind === 'deck'
  const isBrew = list.kind === 'brew'
  const noun = ui.terms.noun(isDeck)
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<ListDialog | null>(null)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [hideOwned, setHideOwned] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)

  const settings = useSettings()
  const { bundleBasics } = settings

  const { variants, other, version, setVersion, formatVariant, shown, swaps, swapsQty, outChoices } = useListVersion(list)
  const [fullListOpen, toggleFullList] = useStoredToggle('mtg-dreams.fullVersionList', false)
  const upgradeView = useUpgradeSwaps(list, lists)
  /** An upgrade's page, but one of its own versions': what it changes in its deck. */
  const upgradeChanges = other ? null : upgradeView

  const cards = cardLines(shown.lines)
  /** A brew that ignores your collection: shown like a deck, with no copies owned. */
  const plain = isBrew && settings.plainBrews
  /** Shown without owned copies: decks (whose cards are all yours) and plain brews. */
  const asDeck = isDeck || plain
  const sortView = asDeck ? 'deck' : 'wishlist'
  const sort = sortFor(sortView, settings.sort)
  /** Reversed only when the view has the chosen sort, not a stand-in for it. */
  const sortReverse = settings.sortReverse && sort === settings.sort
  const sideboardAllowed = !listFormat(shown.lines)?.commander
  // Kept while the list, prices and copies are unchanged, so unchanged table rows skip re-rendering.
  const listedRows = listRows(shown, inventory, settings, pool)
  const rows = useMemo(
    () => listedRows.map((row) => (row.held > 0 ? { ...row, holders: pool.holders(list, nameKey(row.line.name), row.inventoryQty) } : row)),
    [listedRows, pool, list]
  )
  const mainRows = rows.filter((row) => !row.side)
  const summary = summarize(rows)
  const baselines = useBaselines()
  const changeOf = (row: Row) =>
    isDeck || row.bundledIds
      ? null
      : priceChange(row.line, row.unit, row.owned, settings, baselines)

  const analysis = useMemo(() => analyzeList(list.kind, shown.lines, rows), [list.kind, shown.lines, rows])
  const { format, copiesOf, isCommander, hasCommander, legalityErrors, ownershipErrors } = analysis
  const mainCards = summary.cards - analysis.sideboardCards
  // A plain brew shows its card count alone, without a target size.
  const size = isDeck && format ? deckSizeCheck(format, mainCards) : null

  const { picking, canPickCommander, partnerKind, canPickPartner, leaderName, togglePicking, pickOf, isCrowned, chooseCommander } =
    useCommanderPicking(list, rows, analysis, actions)

  const leaders = headerLeaders(rows.filter(isCommander), settings.cardImages)
  /** Cards a starting hand draws from: the main deck, its commanders aside. */
  const drawable = mainRows.reduce((sum, row) => sum + (isCommander(row) ? 0 : row.line.qty), 0)
  const leaderRows = leaders.rows
  // The commanders' color identity, else the colors of all the cards.
  const colors = listColors(rows, leaderRows.map((row) => row.line.name))
  const themes = useCommanderThemes(leaderRows.map((row) => row.line.name))

  useEffect(() => {
    if (legalityErrors + ownershipErrors === 0) setOnlyProblems(false)
  }, [legalityErrors, ownershipErrors])

  const visibleRows = sortRows(filterRows(rows, list.kind, analysis, { filters, hideOwned, onlyProblems }), sort, sortReverse)
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

  // In a version's view (Duel, Counters…), edits become that version's swaps.
  const versionEdits = other
    ? versionActions(actions, {
        list,
        version,
        rows,
        copiesOf,
        isCommander,
        onCommanderCut: () => toast(ui.list.commanderCut, 'error')
      })
    : null
  const viewActions = versionEdits?.actions ?? actions
  /** Swap tag of a row in a version's view: a card only it plays. */
  const insIds = new Set(swaps.ins.map((line) => line.id))
  const swapTag = (row: Row) => (other && insIds.has(row.line.id) ? 'only' : null)

  const addFormatVersion = () => {
    if (!formatVariant) return
    actions.addFormatVersion(list)
    setVersion(formatVariant.label)
    toast(ui.list.versionAdded(list.name, formatVariant.label))
  }
  /** Deletes the version shown: at once while it has no swaps, else once confirmed. */
  const deleteVersion = () => {
    if (!other) return
    if (swapsQty === 0) {
      actions.deleteVersion(list, other.label)
      setVersion(BASE)
    } else {
      setDialog({ kind: 'variant-off', variant: other, swaps: swapsQty })
    }
  }
  const changeFormat = (formatId: string | null) => {
    // A new format deletes the other-format version (Duel, EDH); named versions stay.
    const lost = activeVariant(list.lines)
    const lostSwaps = lost ? sumOf(Object.values(variantSwaps(list.lines, lost.label)).flat(), (line) => line.qty) : 0
    if (lost && lostSwaps > 0) {
      const label = FORMATS.find((format) => format.id === formatId)?.label ?? ui.common.noFormat
      setDialog({ kind: 'variant-format', formatId, label, variant: lost, swaps: lostSwaps })
    } else {
      actions.setListFormat(list, formatId)
    }
  }

  const toggleOwned = (row: Row) => {
    const change = ownedToggle(row)
    if (change.kind === 'set') actions.setOwned(row.line.name, change.qty, lineVersion(row.line))
    else setDialog({ kind: 'unown', line: row.line, inventoryQty: row.inventoryQty, target: change.target })
  }

  /** The versions you own instead of the printing a row names, for its version's tooltip; null if none. */
  const otherVersionsOf = (row: Row) => {
    if (plain) return null
    const copies = otherVersions(inventory.get(nameKey(row.line.name)), lineVersion(row.line))
    return copies.length > 0 ? copies.map(copyLabel).join(', ') : null
  }

  const rowHandlers = useStableHandlers<RowHandlers>({
    pick: (row) => chooseCommander(row),
    qty: (row, qty) =>
      row.bundledIds ? viewActions.setBundledQty(list, row.bundledIds, qty) : viewActions.updateCard(list, row.line.id, { qty }),
    toggleOwned: (row) => toggleOwned(row),
    ownedDelta: (row, delta) => actions.setOwned(row.line.name, Math.max(0, row.inventoryQty + delta), lineVersion(row.line)),
    open: (row) => setDialog({ kind: 'card', lineId: row.line.id }),
    remove: (row) => (row.bundledIds ? viewActions.removeCards(list, row.bundledIds) : viewActions.removeCard(list, row.line.id)),
    rename: (row, name) => actions.updateCard(list, row.line.id, { name })
  })

  const renderRow = (row: Row) => (
    <CardRow
      key={row.line.id}
      row={row}
      pick={pickOf(row)}
      leader={isCommander(row)}
      crowned={isCrowned(row)}
      isDeck={asDeck}
      issue={analysis.issueOf(row)}
      shortfall={analysis.shortfallOf(row)}
      change={changeOf(row)}
      swapTag={swapTag(row)}
      swapLabel={other?.label}
      otherVersions={otherVersionsOf(row)}
      maxQty={maxFor(row.line)}
      maxTitle={limitFor(row.line.name)}
      handlers={rowHandlers}
    />
  )

  const renderTile = (row: Row) => (
    <CardTile
      key={row.line.id}
      row={row}
      isDeck={asDeck}
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

  // Completing (and applying) belongs to the list itself, not its versions.
  const complete = !isDeck && !other && summary.cards > 0 && summary.ownedCards >= summary.cards
  const upgrades = upgradeView?.deck ?? null

  /** Makes a completed wishlist a deck; fails (so the banner stays) if it could not move. */
  const moveToDecks = async () => {
    const moved = await moveListTo(list, 'deck', (moved) => ui.moves.toDeck(moved.name))
    if (!moved) throw new Error(ui.list.notMoved)
    onOpenList(moved)
  }

  /** Makes a brew a wishlist, at the bottom of the order. */
  const makeWishlist = async () => {
    const moved = await moveListTo(list, 'wishlist', (moved) => ui.moves.toWishlistBottom(moved.name))
    if (moved) onOpenList(moved)
  }

  const toggleUnbuilt = () => {
    const unbuilt = !isUnbuilt(list.lines)
    actions.setUnbuilt(list, unbuilt)
    toast(
      unbuilt ? ui.list.unbuilt(list.name) : ui.list.built(list.name)
    )
  }

  const applyUpgrade = async () => {
    try {
      const deck = await actions.applyUpgrade(list)
      onOpenList(deck)
      toast(ui.list.upgraded(deck.name, list.name))
    } catch (error) {
      toast(ui.list.upgradeFailed(cleanError(error)), 'error')
      throw error
    }
  }

  const table = (
    <ListTable
      listKey={`${list.kind}/${list.name}`}
      isDeck={asDeck}
      sections={sections}
      renderRow={renderRow}
      renderTile={renderTile}
      visibleRows={visibleRows.length}
      visibleSummary={summarize(visibleRows)}
      totalCards={summary.cards}
      sortView={sortView}
      sort={sort}
      sortReverse={sortReverse}
      filters={filters}
      onFilters={setFilters}
      identity={leaderRows.length > 0 ? colors : []}
      hideOwned={hideOwned}
      onHideOwned={setHideOwned}
      filtering={filtering}
      dataLoading={dataLoading}
      picking={picking !== null}
    />
  )

  return (
    <div className="view" data-color={listColor(list.lines) ?? undefined}>
      <ListHeader
        name={list.name}
        arts={leaders.arts}
        leaders={leaders.names}
        themes={themes}
        background={leaders.background}
        colors={colors}
        noun={noun}
        format={format}
        picking={picking}
        hasCommander={hasCommander}
        canPickCommander={canPickCommander}
        partnerKind={partnerKind}
        canPickPartner={canPickPartner}
        leaderName={leaderName}
        legalityErrors={legalityErrors}
        ownershipErrors={ownershipErrors}
        onlyProblems={onlyProblems}
        onToggleProblems={() => setOnlyProblems(!onlyProblems)}
        onTogglePicking={togglePicking}
        variants={variants}
        baseLabel={baseLabel(list.lines)}
        version={version}
        versionFormat={other ? versionFormatLabel(list.lines, other) : null}
        onVersion={setVersion}
        formatVariant={formatVariant}
        onAddFormatVersion={addFormatVersion}
        onAddVersion={() => setDialog({ kind: 'version-name', version: null })}
        onRenameVersion={other && !other.format ? () => setDialog({ kind: 'version-name', version: other.label }) : undefined}
        onDeleteVersion={other ? deleteVersion : undefined}
        onFormat={changeFormat}
        onEditText={() => setDialog({ kind: 'text' })}
        onStartingHand={drawable >= HAND_SIZE ? () => setDialog({ kind: 'hand' }) : undefined}
        onColor={() => setDialog({ kind: 'color' })}
        onUpgrade={list.kind === 'wishlist' ? () => setDialog({ kind: 'upgrade' }) : undefined}
        onMakeWishlist={isBrew ? () => void makeWishlist() : undefined}
        unbuilt={isDeck && isUnbuilt(list.lines)}
        onToggleUnbuilt={isDeck ? toggleUnbuilt : undefined}
        onRename={() => setDialog({ kind: 'rename' })}
        onDelete={() => setDialog({ kind: 'delete' })}
      />

      {complete && (
        <CompleteBanner cards={summary.cards} brew={isBrew} upgrades={upgrades?.name ?? null} onMove={upgrades ? applyUpgrade : moveToDecks} />
      )}

      <div className="facts-row">
      <ListValueCards
        isDeck={asDeck}
        brew={isBrew}
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

      {isBrew && (
        <p className="brew-note">
          <Icon name="info" />
          {ui.list.brewNote}
        </p>
      )}
      </div>

      {!other && !upgradeChanges && (
        <ListAddCards
          list={list}
          inventory={inventory}
          pool={pool}
          actions={viewActions}
          format={format}
          copiesOf={copiesOf}
          capsFor={capsFor}
          limitFor={limitFor}
          sideboardAllowed={sideboardAllowed}
          onAddPrecon={() => setDialog({ kind: 'precon' })}
          onAdding={setAdding}
        />
      )}

      {other && (
        <SwapTable
          swaps={swaps}
          changes={ui.swaps.changes(other.label, baseLabel(list.lines))}
          outLabel={ui.swaps.cutFrom(baseLabel(list.lines))}
          inLabel={ui.swaps.onlyIn(other.label)}
          target={ui.swaps.version(other.label)}
          none={ui.swaps.none(other.label)}
          rows={rows}
          outChoices={outChoices}
          onCut={(name) => versionEdits?.setCopies({ name, foil: false, qty: 0 }, copiesOf(name) - 1)}
          onKeep={(line) => versionEdits?.setCopies(line, copiesOf(line.name) + line.qty)}
          onDrop={(line) => versionEdits?.setCopies(line, copiesOf(line.name) - line.qty)}
          adder={{ list, inventory, pool, actions: viewActions, format, copiesOf, capsFor, limitFor, sideboardAllowed: false }}
          addPlaceholder={ui.swaps.addInstead}
        />
      )}

      {upgradeChanges && (
        <SwapTable
          swaps={upgradeChanges.swaps}
          changes={ui.upgradeSwaps.changes(upgradeChanges.deckLabel)}
          outLabel={ui.upgradeSwaps.cutFrom(upgradeChanges.deckLabel)}
          inLabel={ui.upgradeSwaps.added}
          target={ui.upgradeSwaps.target}
          none={ui.upgradeSwaps.none(upgradeChanges.deckLabel)}
          rows={rows}
          ownership
          outChoices={upgradeChanges.outChoices}
          onCut={(name) => actions.removeCopies(list, name, 1)}
          onKeep={({ id: _id, kind: _kind, ...card }) => actions.addCards(list, [card])}
          onDrop={(line) => actions.removeCopies(list, line.name, line.qty)}
          adder={{ list, inventory, pool, actions, format, copiesOf, capsFor, limitFor, sideboardAllowed }}
          addPlaceholder={ui.upgradeSwaps.add}
        />
      )}

      {(other || upgradeChanges) && cards.length > 0 ? (
        <Collapsible
          open={fullListOpen || onlyProblems}
          onToggle={toggleFullList}
          className="version-list"
          title={other ? ui.list.fullList(other.label) : ui.upgradeSwaps.fullList}
          summary={ui.count.cards(summary.cards)}
        >
          {table}
        </Collapsible>
      ) : cards.length > 0 ? (
        table
      ) : (
        !adding && (
          <div className="empty">
            <p>{ui.list.empty(noun)}</p>
            <p className="muted">{isDeck ? ui.list.emptyDeckHint : ui.list.emptyListHint}</p>
          </div>
        )
      )}

      {cards.length > 0 && <DeckTokens names={mainRows.map((row) => row.line.name)} />}

      <ListDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        list={list}
        lists={lists}
        format={format}
        analysis={analysis}
        rows={rows}
        actions={viewActions}
        formatCap={(name) => capsFor(name).formatCap}
        maxFor={maxFor}
        limitFor={limitFor}
        onOpenList={onOpenList}
        shownVariant={other}
        onVersion={setVersion}
      />
    </div>
  )
}

/** @returns Version of a pinned line, used when its copies are added to the inventory; undefined if unpinned. */
function lineVersion(line: CardLine): Version | undefined {
  return line.set ? { set: line.set, collector: line.collector, foil: line.foil } : undefined
}
