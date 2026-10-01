import { useEffect, useMemo, useState } from 'react'
import {
  filtersActive,
  needsCardData,
  NO_FILTERS,
  sortFor,
  sortOptionsFor,
  type CardFilters,
  type SortKey
} from '../../../shared/cards'
import { cardLines, nameKey } from '../../../shared/decklist'
import { capEntries, commanderRule, FORMATS } from '../../../shared/formats'
import { priceBasisLabel } from '../../../shared/pricing'
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
import type { CardLine, InventoryItem, PriceBasis } from '../../../shared/types'
import { bundledBasic } from '../../../shared/basics'
import { getCardInfo } from '../cardinfo'
import { cleanError, formatDay, formatEur } from '../format'
import type { CardList, LibraryActions, ListRef } from '../library'
import { requestPrintings, usePrintingsVersion } from '../printings'
import { updateSettings, useSettings } from '../settings'
import { buildRows, summarize, type Row } from '../summary'
import { CardDialog } from './CardDialog'
import { CardRow } from './CardRow'
import { AddCardPanel } from './CardEditors'
import { CompleteBanner } from './CompleteBanner'
import { CardSearch, type SearchChoice } from './CardSearch'
import { ConfirmDialog, PromptDialog, TextEditorDialog } from './Dialogs'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'
import { PreconDialog } from './PreconDialog'
import { useToast } from './Toasts'

type Dialog =
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'text' }
  | { kind: 'card'; lineId: string }
  | { kind: 'precon' }
  | { kind: 'unown'; line: CardLine; inventoryQty: number; target: number }

interface ListViewProps {
  list: CardList
  inventory: Map<string, InventoryItem>
  actions: LibraryActions
  /** Called when the list's identity changes (renamed, or moved to Decks). */
  onOpenList: (list: ListRef) => void
}

/** A deck (built from owned cards) or a wishlist (cards you want), grouped by card type. */
export function ListView({ list, inventory, actions, onOpenList }: ListViewProps) {
  const toast = useToast()
  usePrintingsVersion()
  const isDeck = list.kind === 'deck'
  const noun = isDeck ? 'deck' : 'list'
  const [adding, setAdding] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [hideOwned, setHideOwned] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)
  /** Choosing a commander: the next card clicked becomes it. */
  const [picking, setPicking] = useState(false)
  /** The commander just chosen (name key), celebrated for a moment. */
  const [crowned, setCrowned] = useState<string | null>(null)

  const cards = cardLines(list.lines)
  const settings = useSettings()
  const { bundleBasics } = settings
  // The sort is one app-wide choice; this view uses the closest one it offers.
  const sortView = isDeck ? 'deck' : 'wishlist'
  const sort = sortFor(sortView, settings.sort)
  const rows = buildRows(cards, inventory, settings)
  const summary = summarize(rows)

  // Legality, ownership and commander rules (shared/listModel.ts).
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
  const visibleSummary = summarize(visibleRows)
  const dataLoading = needsCardData(filters) && rows.some((row) => !row.info && !row.entry?.data?.notFound)
  const lands = landCount(rows)

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
    // A bundled basic land has no versions to pick: add one straight away.
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

  // Prices come from Cardmarket's daily price guide: ask whether a newer one is out.
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
    if (change.kind === 'set') actions.setOwned(row.line.name, change.qty)
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

  const columns = isDeck ? 6 : 7
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
      maxQty={maxFor(row.line)}
      maxTitle={limitFor(row.line.name)}
      onQty={(qty) =>
        row.bundledIds ? actions.setBundledQty(list, row.bundledIds, qty) : actions.updateCard(list, row.line.id, { qty })
      }
      onToggleOwned={() => toggleOwned(row)}
      onOwnedDelta={(delta) => actions.setOwned(row.line.name, Math.max(0, row.inventoryQty + delta))}
      onOpen={() => setDialog({ kind: 'card', lineId: row.line.id })}
      onRemove={() => (row.bundledIds ? actions.removeCards(list, row.bundledIds) : actions.removeCard(list, row.line.id))}
      onRename={(name) => actions.updateCard(list, row.line.id, { name })}
    />
  )

  // A line pinned to an older basic-land printing needs the full list of versions,
  // which is only fetched on demand. Retried once any refresh in progress finishes.
  const needAllVersions = rows
    .filter((row) => row.resolution?.pinMissing && row.entry?.data?.partial && !row.entry.refreshing)
    .map((row) => row.line.name)
    .join('\n')
  useEffect(() => {
    for (const name of needAllVersions.split('\n')) if (name) requestPrintings(name, { full: true })
  }, [needAllVersions])

  const progress = summary.cards ? Math.round((summary.ownedCards / summary.cards) * 100) : 0
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
  const dialogRow = dialog?.kind === 'card' ? rows.find((row) => row.line.id === dialog.lineId) : undefined

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>{list.name}</h1>
          <div className="header-meta">
            <label className="field-inline format-field">
              Format
              <select
                value={format?.id ?? ''}
                onChange={(event) => actions.setListFormat(list, event.target.value || null)}
                aria-label="Deck format"
              >
                <option value="">No format (just a list)</option>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {format?.commander && cards.length > 0 && (
              <button
                type="button"
                className={`wand-btn${picking ? ' on' : ''}`}
                onClick={togglePicking}
                aria-pressed={picking}
                title={
                  picking
                    ? 'Cancel (Esc)'
                    : `Then click the card that leads this ${noun}. In ${format.label} it must be ${commanderRule(format)}.`
                }
              >
                <Icon name="wand" />
                {picking ? 'Click your Commander… (Esc to cancel)' : hasCommander ? 'Change Commander' : 'Choose Commander'}
              </button>
            )}
            {legalityErrors > 0 && (
              <button
                type="button"
                className={`chip illegal issue-badge${onlyProblems ? ' on' : ''}`}
                onClick={() => setOnlyProblems(!onlyProblems)}
                title={onlyProblems ? 'Show all cards' : 'Show only cards with problems'}
              >
                {legalityErrors} {legalityErrors === 1 ? 'card breaks' : 'cards break'} {format?.label} rules
              </button>
            )}
            {ownershipErrors > 0 && (
              <button
                type="button"
                className={`chip illegal issue-badge${onlyProblems ? ' on' : ''}`}
                onClick={() => setOnlyProblems(!onlyProblems)}
                title={onlyProblems ? 'Show all cards' : 'Show only cards with problems'}
              >
                {ownershipErrors} {ownershipErrors === 1 ? 'card is' : 'cards are'} not in your inventory
              </button>
            )}
            <span className="muted">
              {summary.cards} cards ·{' '}
              {summary.loading > 0
                ? `loading prices ${cards.length - summary.loading}/${cards.length}…`
                : summary.pricedAt
                  ? `Cardmarket prices of ${formatDay(summary.pricedAt)}`
                  : 'no prices yet'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" onClick={refreshPrices} disabled={cards.length === 0}>
            Refresh prices
          </button>
          <button type="button" onClick={() => setDialog({ kind: 'text' })}>
            Edit as text
          </button>
          <button
            type="button"
            onClick={() => window.api.copyText(list.text).then(() => toast(`${isDeck ? 'Deck' : 'List'} copied to clipboard`))}
          >
            Copy
          </button>
          <button type="button" onClick={() => setDialog({ kind: 'rename' })}>
            Rename
          </button>
          <button type="button" className="danger-ghost" onClick={() => setDialog({ kind: 'delete' })}>
            Delete
          </button>
        </div>
      </header>

      {complete && <CompleteBanner cards={summary.cards} onMove={moveToDecks} />}

      {isDeck ? (
        <section className="stats">
          <Stat label="Deck value" value={formatEur(summary.total)} accent note={priceNote(summary, settings.priceBasis)} />
          <Stat label="Cards" value={String(summary.cards)} note={`${lands} lands · ${summary.cards - lands} nonland`} />
          <Stat label="Unique cards" value={String(cards.length)} />
        </section>
      ) : (
        <section className="stats">
          <Stat label="Still needed" value={formatEur(summary.neededValue)} accent note={priceNote(summary, settings.priceBasis)} />
          <Stat label="List total" value={formatEur(summary.total)} />
          <Stat label="Already owned" value={formatEur(summary.ownedValue)} />
          <div className="stat">
            <span className="stat-label">Collected</span>
            <span className="stat-value">
              {summary.ownedCards} / {summary.cards}
            </span>
            <div className="progress" aria-label={`${progress}% collected`}>
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>
      )}

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
        <>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            namePlaceholder="Filter by name…"
            loadingNote={dataLoading ? 'Some cards are still loading and are hidden by these filters.' : undefined}
          >
            {!isDeck && (
              <label className="check">
                <input type="checkbox" checked={hideOwned} onChange={(event) => setHideOwned(event.target.checked)} />
                Hide owned
              </label>
            )}
            {filtering && (
              <span className="muted small">
                Showing {visibleSummary.cards} of {summary.cards} cards ·{' '}
                {isDeck
                  ? `${formatEur(visibleSummary.total)} value`
                  : `${formatEur(visibleSummary.neededValue)} still needed`}
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
                {sortOptionsFor(sortView).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </FilterBar>
          <table className={`cards-table${picking ? ' picking' : ''}`}>
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
                    <td colSpan={columns}>
                      <span>
                        {leaders && <Icon name="crown" />}
                        {section.label} · {sectionSummary.cards}
                      </span>
                      {leaders && (
                        <button
                          type="button"
                          className="section-action"
                          onClick={() => actions.setListCommander(list, null)}
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
          {visibleRows.length === 0 && <p className="muted empty-filter">No cards match the current filters.</p>}
        </>
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

      {dialog?.kind === 'rename' && (
        <PromptDialog
          title={`Rename ${noun}`}
          label="Name"
          initial={list.name}
          confirmLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={async (value) => {
            if (value.trim() !== list.name) onOpenList(await actions.renameList(list, value))
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${noun}`}
          message={`Move “${list.name}” to the Recycle Bin? ${isDeck ? 'Its cards stay in your inventory.' : 'Your inventory is not affected.'}`}
          confirmLabel="Delete"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await actions.deleteList(list)
            toast(`Deleted ${list.name}`)
          }}
        />
      )}
      {dialog?.kind === 'text' && (
        <TextEditorDialog
          title={`Edit “${list.name}” as text`}
          initial={list.text}
          mode="list"
          onClose={() => setDialog(null)}
          onSave={(text) => actions.replaceListText(list, text)}
        />
      )}
      {dialogRow && (
        <CardDialog
          row={dialogRow}
          format={format}
          issue={analysis.issueOf(dialogRow)}
          maxQty={maxFor(dialogRow.line)}
          maxTitle={limitFor(dialogRow.line.name)}
          onUpdate={(patch) => actions.updateCard(list, dialogRow.line.id, patch)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'precon' && (
        <PreconDialog
          target={{ kind: 'list', listName: list.name }}
          onClose={() => setDialog(null)}
          onAdd={(deck, entries) => {
            // A format with a copy limit keeps only what it allows.
            const capped = capEntries(entries, (name) => capsFor(name).formatCap, copiesOf)
            actions.addCards(list, capped.entries)
            setDialog(null)
            const added = capped.entries.reduce((sum, e) => sum + e.qty, 0)
            toast(
              `Added ${added} cards from ${deck.name}` +
                (capped.skipped > 0
                  ? ` · skipped ${capped.skipped} extra ${capped.skipped === 1 ? 'copy' : 'copies'} (${format?.label} limit)`
                  : '')
            )
          }}
        />
      )}
      {dialog?.kind === 'unown' && (
        <ConfirmDialog
          title="Update inventory"
          message={
            `You have ${dialog.inventoryQty}× ${dialog.line.name} in your inventory. ` +
            (dialog.target === 0 ? 'Remove all of them?' : `Reduce it to ${dialog.target}?`) +
            ' This applies to every list.'
          }
          confirmLabel={dialog.target === 0 ? 'Remove all' : `Reduce to ${dialog.target}`}
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => {
            actions.setOwned(dialog.line.name, dialog.target)
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}

/** Which price the value uses (Settings → Prices), and what's still missing from it. */
function priceNote(summary: ReturnType<typeof summarize>, basis: PriceBasis): string {
  const parts = [`${priceBasisLabel(basis)} prices`]
  if (summary.loading) parts.push(`${summary.loading} loading`)
  if (summary.unpriced) parts.push(`${summary.unpriced} without price`)
  return parts.join(' · ')
}

function Stat({ label, value, accent, note }: { label: string; value: string; accent?: boolean; note?: string }) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}
