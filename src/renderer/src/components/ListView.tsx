import { useEffect, useMemo, useState } from 'react'
import { filtersActive, needsCardData, NO_FILTERS, sortFor, type CardFilters } from '@shared/cards'
import { cardLines, nameKey } from '@shared/decklist'
import { otherVersions, type Version } from '@shared/inventory'
import { listColor } from '@shared/listColor'
import { stripMeta } from '@shared/listMeta'
import { isUnbuilt } from '@shared/listUnbuilt'
import { upgradeTarget } from '@shared/listUpgrade'
import { hasVariant, swapPairs, variantFor, variantSwaps, versionCardLines, type ListVersion } from '@shared/listVersion'
import { sumOf } from '@shared/totals'
import { deckSizeCheck, FORMATS, listCommander, listFormat } from '@shared/formats'
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
import { artCrop } from '../lib/artwork'
import { listColors } from '../lib/listFigures'
import { cardCount, cleanError } from '../lib/format'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import { priceChange, useBaselines } from '../stores/history'
import { requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { useCommanderPicking } from '../hooks/useCommanderPicking'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { useStoredValue } from '../hooks/useStoredValue'
import { listRows, summarize, versionList, type Row } from '../lib/summary'
import { CardRow } from './CardRow'
import type { SearchChoice } from './CardSearch'
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
  usePrintingsVersion()
  const isDeck = list.kind === 'deck'
  const isBrew = list.kind === 'brew'
  const noun = isDeck ? 'deck' : 'list'
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<ListDialog | null>(null)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [hideOwned, setHideOwned] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)

  const settings = useSettings()
  const { bundleBasics } = settings

  // A list's other version (Duel for Commander, EDH for Duel): the page shows one version at a time,
  // remembered per list.
  const variantOn = hasVariant(list.lines)
  const [storedVersion, setVersion] = useStoredValue<ListVersion>(`mtg-dreams.version.${list.kind}/${list.name}`, 'base', isVersion)
  const version: ListVersion = variantOn ? storedVersion : 'base'
  const variant = variantFor(list.lines)
  const other = version === 'variant' && variant ? variant : null
  /** The version shown, as a list: rows, rules, stats and copying all follow it. */
  const shown = versionList(list, version)
  const swaps = variantOn ? variantSwaps(list.lines) : { ins: [], outs: [] }
  const insQty = sumOf(swaps.ins, (line) => line.qty)
  const outsQty = sumOf(swaps.outs, (line) => line.qty)
  /** Cards the other version can cut: the list's it still plays, but the commander and its own cards in. */
  const outChoices = useMemo<SearchChoice[]>(() => {
    if (!variantOn) return []
    const ins = new Set(variantSwaps(list.lines).ins.map((line) => nameKey(line.name)))
    const leader = listCommander(list.lines)
    const copies = new Map<string, number>()
    for (const line of versionCardLines(list.lines, 'variant')) {
      if (ins.has(nameKey(line.name)) || (leader && nameKey(line.name) === nameKey(leader))) continue
      copies.set(line.name, (copies.get(line.name) ?? 0) + line.qty)
    }
    return [...copies].map(([name, qty]) => ({ name, hint: qty > 1 ? `${qty} in the deck` : undefined }))
  }, [list.lines, variantOn])
  const [fullListOpen, toggleFullList] = useStoredToggle('mtg-dreams.fullVersionList', false)

  const cards = cardLines(shown.lines)
  const sortView = isDeck ? 'deck' : 'wishlist'
  const sort = sortFor(sortView, settings.sort)
  /** Reversed only when the view has the chosen sort, not a stand-in for it. */
  const sortReverse = settings.sortReverse && sort === settings.sort
  const sideboardAllowed = !listFormat(shown.lines)?.commander
  const rows = listRows(shown, inventory, settings, pool).map((row) =>
    row.held > 0 ? { ...row, holders: pool.holders(list, nameKey(row.line.name), row.inventoryQty) } : row
  )
  const mainRows = rows.filter((row) => !row.side)
  const summary = summarize(rows)
  const baselines = useBaselines()
  const changeOf = (row: Row) =>
    isDeck || row.bundledIds
      ? null
      : priceChange(row.line, row.unit, row.owned, settings, baselines)

  const analysis = analyzeList(list.kind, shown.lines, rows)
  const { format, copiesOf, isCommander, hasCommander, legalityErrors, ownershipErrors } = analysis
  const mainCards = summary.cards - analysis.sideboardCards
  const size = isDeck && format ? deckSizeCheck(format, mainCards) : null

  const { picking, canPickCommander, togglePicking, pickOf, isCrowned, chooseCommander } = useCommanderPicking(list, rows, analysis, actions)

  const leaderRow = rows.find(isCommander)
  const leaderArt = settings.cardImages ? artCrop(leaderRow?.resolution?.printing) : null
  // The commander's color identity, else the colors of all the cards.
  const colors = listColors(rows, leaderRow ? leaderRow.line.name : null)

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

  /** Sets a card's copies in the other version, as swaps. */
  const setVariantCopies = (line: Omit<CardLine, 'id' | 'kind'>, qty: number) => {
    const { qty: _qty, ...card } = line
    actions.setVariantCount(list, card, Math.max(0, qty))
  }
  /** Takes a row's copies out of the other version; the commander leads both versions, so it stays. */
  const cutFromVariant = (row: Row | undefined) => {
    if (!row) return
    if (isCommander(row)) {
      toast('The commander leads both versions. Change it with “Change commander”.', 'error')
      return
    }
    setVariantCopies(row.line, copiesOf(row.line.name) - row.line.qty)
  }
  const rowOf = (id: string) => rows.find((row) => row.line.id === id || row.bundledIds?.includes(id))
  /**
   * Edits as the page shows them: the list's own in its own view; in the other version's view (Duel,
   * EDH), quantities, additions and removals become that version's swaps, while other changes
   * (printing, name) apply to the card in both versions.
   */
  const viewActions: LibraryActions = other
    ? {
        ...actions,
        addCards: (_target, entries) => {
          for (const { side: _side, ...entry } of entries) setVariantCopies(entry, copiesOf(entry.name) + entry.qty)
        },
        updateCard: (target, id, patch) => {
          const { qty, ...rest } = patch
          const row = rowOf(id)
          if (row && qty !== undefined) setVariantCopies(row.line, copiesOf(row.line.name) - row.line.qty + qty)
          if (Object.keys(rest).length > 0) actions.updateCard(target, id, rest)
        },
        removeCard: (_target, id) => cutFromVariant(rowOf(id)),
        removeCards: (_target, ids) => cutFromVariant(rowOf(ids[0])),
        setBundledQty: (_target, ids, qty) => {
          const row = rowOf(ids[0])
          if (row) setVariantCopies(row.line, copiesOf(row.line.name) - row.line.qty + qty)
        }
      }
    : actions
  /** Swap tag of a row in the other version's view: a card only it plays. */
  const insIds = new Set(swaps.ins.map((line) => line.id))
  const swapTag = (row: Row) => (other && insIds.has(row.line.id) ? 'only' : null)

  const toggleVariant = () => {
    if (!variant) return
    if (!variantOn) {
      actions.setVariant(list, true)
      setVersion('variant')
      toast(`“${list.name}” has a ${variant.label} version, identical until you change it`)
    } else if (insQty + outsQty === 0) {
      actions.setVariant(list, false)
      setVersion('base')
    } else {
      setDialog({ kind: 'variant-off', variant, swaps: insQty + outsQty })
    }
  }
  const changeFormat = (formatId: string | null) => {
    if (variant && variantOn && insQty + outsQty > 0) {
      const label = FORMATS.find((format) => format.id === formatId)?.label ?? 'No format'
      setDialog({ kind: 'variant-format', formatId, label, variant, swaps: insQty + outsQty })
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
    const copies = otherVersions(inventory.get(nameKey(row.line.name)), lineVersion(row.line))
    return copies.length > 0 ? copies.map(copyLabel).join(', ') : null
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
      change={changeOf(row)}
      swapTag={swapTag(row)}
      swapLabel={variant?.label}
      otherVersions={otherVersionsOf(row)}
      maxQty={maxFor(row.line)}
      maxTitle={limitFor(row.line.name)}
      onQty={(qty) =>
        row.bundledIds ? viewActions.setBundledQty(list, row.bundledIds, qty) : viewActions.updateCard(list, row.line.id, { qty })
      }
      onToggleOwned={() => toggleOwned(row)}
      onOwnedDelta={(delta) => actions.setOwned(row.line.name, Math.max(0, row.inventoryQty + delta), lineVersion(row.line))}
      onOpen={() => setDialog({ kind: 'card', lineId: row.line.id })}
      onRemove={() => (row.bundledIds ? viewActions.removeCards(list, row.bundledIds) : viewActions.removeCard(list, row.line.id))}
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

  // Completing (and applying) belongs to the list itself, not its other version.
  const complete = !isDeck && !other && summary.cards > 0 && summary.ownedCards >= summary.cards
  const upgrades = upgradeTarget(list, lists)

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

  /** Makes a brew a wishlist, at the bottom of the order. */
  const makeWishlist = async () => {
    try {
      const moved = await actions.moveList(list, 'wishlist')
      onOpenList(moved)
      toast(`“${moved.name}” is now a wishlist, at the bottom of your wishlists`)
    } catch (error) {
      toast(`Could not move the list: ${cleanError(error)}`, 'error')
    }
  }

  const toggleUnbuilt = () => {
    const unbuilt = !isUnbuilt(list.lines)
    actions.setUnbuilt(list, unbuilt)
    toast(
      unbuilt
        ? `“${list.name}” is now unbuilt: it uses your cards without reserving them`
        : `“${list.name}” is built again: it reserves its cards`
    )
  }

  const applyUpgrade = async () => {
    try {
      const deck = await actions.applyUpgrade(list)
      onOpenList(deck)
      toast(`Upgraded “${deck.name}”; “${list.name}” went to the Recycle Bin`)
    } catch (error) {
      toast(`Could not apply the upgrade: ${cleanError(error)}`, 'error')
      throw error
    }
  }

  const table = (
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
      sortReverse={sortReverse}
      filters={filters}
      onFilters={setFilters}
      hideOwned={hideOwned}
      onHideOwned={setHideOwned}
      filtering={filtering}
      dataLoading={dataLoading}
      picking={picking}
    />
  )

  return (
    <div className="view" data-color={listColor(list.lines) ?? undefined}>
      <ListHeader
        name={list.name}
        art={leaderArt}
        leader={leaderRow ? (leaderRow.flavorName ?? leaderRow.line.name) : null}
        colors={colors}
        noun={noun}
        format={format}
        picking={picking}
        hasCommander={hasCommander}
        canPickCommander={canPickCommander}
        legalityErrors={legalityErrors}
        ownershipErrors={ownershipErrors}
        onlyProblems={onlyProblems}
        onToggleProblems={() => setOnlyProblems(!onlyProblems)}
        onTogglePicking={togglePicking}
        onFormat={changeFormat}
        variant={variant}
        variantOn={variantOn}
        version={variantOn ? version : null}
        onVersion={setVersion}
        onToggleVariant={variant ? toggleVariant : undefined}
        onEditText={() => setDialog({ kind: 'text' })}
        onCopy={() =>
          window.api
            .copyText(stripMeta(shown.text))
            .then(() => toast(other ? `${other.label} version copied to clipboard` : `${isDeck ? 'Deck' : 'List'} copied to clipboard`))
        }
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
        isDeck={isDeck}
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
          <Icon name="info" />A brew is just an idea: it never counts in Most Wanted, the budget planner or trades.
        </p>
      )}
      </div>

      {!other && (
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
          pairs={swapPairs(swaps)}
          variant={other}
          rows={rows}
          outChoices={outChoices}
          onCut={(name) => setVariantCopies({ name, foil: false, qty: 0 }, copiesOf(name) - 1)}
          onUndo={(index) => actions.removeSwapPair(list, index)}
          adder={{ list, inventory, pool, actions: viewActions, format, copiesOf, capsFor, limitFor, sideboardAllowed: false }}
        />
      )}

      {other && cards.length > 0 ? (
        <Collapsible
          open={fullListOpen || onlyProblems}
          onToggle={toggleFullList}
          className="version-list"
          title={`Full ${other.label} List`}
          summary={cardCount(summary.cards)}
        >
          {table}
        </Collapsible>
      ) : cards.length > 0 ? (
        table
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
      />
    </div>
  )
}

/** Type guard for a stored {@link ListVersion}. */
const isVersion = (value: string): value is ListVersion => value === 'base' || value === 'variant'

/** @returns Version of a pinned line, used when its copies are added to the inventory; undefined if unpinned. */
function lineVersion(line: CardLine): Version | undefined {
  return line.set ? { set: line.set, collector: line.collector, foil: line.foil } : undefined
}
