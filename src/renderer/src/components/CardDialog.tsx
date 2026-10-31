import { useEffect, useState } from 'react'
import { FORMATS, type DeckFormat, type LegalityIssue } from '@shared/formats'
import { languageLabel } from '@shared/languages'
import { finishFor, hasFoil, singleFinish } from '@shared/pricing'
import type { Board } from '@shared/sideboard'
import type { CardFace, CardInfo, CardLine, PrintedFace, Printing } from '@shared/types'
import { ui } from '@shared/text'
import { formatEur, formatIsoDate } from '../lib/format'
import type { NewCard } from '../stores/library'
import { localizedImage, localizedQueryOf, requestLocalizedImage, useLocalizedImagesVersion } from '../stores/localizedImages'
import { useRulings } from '../stores/rulings'
import { useSettings } from '../stores/settings'
import type { Row } from '../lib/summary'
import { CardmarketButton } from './CardCells'
import { PickerBody, usePrintingsFor } from './CardEditors'
import { Icon } from './Icon'
import { ManaCost, RulesText, SymbolText, TypeLine } from './ManaText'
import { Modal } from './Modal'
import { Stepper } from './Stepper'
import { AUTO, VersionPicker } from './VersionPicker'

/** Display labels of Scryfall legality values. */
const STATUS_LABELS = ui.card.dialog.statuses

/** Props of {@link CardDialog}. */
interface CardDialogProps {
  /** Current row; updated after each change. */
  row: Row
  format: DeckFormat | null
  /** Format problems, most serious first. */
  issues: LegalityIssue[]
  /** Why the Card is allowed despite a rule. */
  allowed: string[]
  /** Max quantity (format and, for decks, ownership). */
  maxQty?: number
  /** Tooltip when `maxQty` is reached. */
  maxTitle?: string
  /** Applies a line patch immediately. */
  onUpdate: (patch: Partial<NewCard>) => void
  /** The card's board and the boards it can move to (the list's, its own aside); absent where it has none to move to. */
  board?: { current: Board; options: Board[]; onMove: (to: Board) => void }
  /**
   * Commander formats: whether the card leads the list or could, and how to make it lead: alone, or
   * beside the list's only commander (`onJoin`, when it can partner with it).
   */
  commander?: { leads: boolean; canLead: boolean; onMake: () => void; onJoin?: () => void }
  onClose: () => void
}

/**
 * Card details dialog; version, finish and quantity changes apply immediately. A pinned single-finish
 * printing locks the finish. Two-sided cards can be flipped to show the back face. Each face shows its
 * cost, type and rules text (Oracle, or printed as Settings ask). Legality in every format and the
 * rulings are folded away; the list's own format shows as a chip.
 */
export function CardDialog({ row, format, issues, allowed, maxQty, maxTitle, onUpdate, board, commander, onClose }: CardDialogProps) {
  const { line, resolution, unit, info } = row
  const entry = usePrintingsFor(line.name)
  const printings = entry?.data?.printings ?? []
  const printing = resolution?.printing ?? null
  const pinned = resolution?.pinned ? printing : null
  const foilLocked = pinned ? singleFinish(pinned) : false
  const selected = line.set ? (printing?.id ?? '') : AUTO
  const text = ui.card.dialog
  const [flipped, setFlipped] = useState(false)
  /** The version hovered in Change version: the large image shows it until the pointer leaves. */
  const [previewing, setPreviewing] = useState<Printing | null>(null)
  const shown = previewing ?? printing
  const showBack = flipped && !!shown?.imageBack
  const rulings = useRulings(line.name, printing?.id)

  const selectVersion = (id: string) => {
    if (id === AUTO) {
      onUpdate({ set: undefined, collector: undefined })
      return
    }
    const choice = printings.find((p) => p.id === id)
    if (!choice) return
    onUpdate({ set: choice.set, collector: choice.collectorNumber, foil: finishFor(choice, line.foil) })
  }

  return (
    <Modal title={row.flavorName ?? line.name} onClose={onClose} size="wide">
      <div className="card-view">
        <div className="card-view-media">
          <div className="card-view-image">
            {shown?.imageNormal ? (
              <img src={showBack ? shown.imageBack! : shown.imageNormal} alt={showBack ? text.back(line.name) : line.name} />
            ) : (
              <span>{ui.card.picker.noImage}</span>
            )}
          </div>
          {printing?.imageBack && (
            <button type="button" className="flip-btn" onClick={() => setFlipped(!flipped)} aria-pressed={showBack}>
              <Icon name="flip" /> {showBack ? text.showFront : text.showBack}
            </button>
          )}
        </div>
        <div className="card-view-info">
          {row.flavorName && <p className="muted small">{text.printedName(line.name)}</p>}
          {info && <CardText info={info} line={line} printing={printing} back={flipped && !!printing?.imageBack} />}
          {format && info && (
            <p className="card-view-rules">
              {issues.length > 0 ? (
                issues.map((issue) => (
                  <span key={issue.code} className={`chip ${issue.severity === 'error' ? 'illegal' : 'restricted'}`}>
                    {issue.detail}
                  </span>
                ))
              ) : (
                <span className="chip legal">{text.legalIn(format.label)}</span>
              )}
              {allowed.map((reason) => (
                <span key={reason} className="muted small">
                  {reason}
                </span>
              ))}
            </p>
          )}
          <dl className="card-facts">
            <dt>{text.version}</dt>
            <dd>
              {printing ? (
                <>
                  {resolution?.pinned || resolution?.fromInventory ? (
                    ''
                  ) : resolution?.preferred && row.preferredFrom ? (
                    <span className="auto-badge preferred" title={text.preferredHint(row.preferredFrom)}>
                      {row.preferredFrom}
                    </span>
                  ) : (
                    <span className="auto-badge">{text.cheapest}</span>
                  )}{' '}
                  {printing.setName} (
                  {printing.set.toUpperCase()} #{printing.collectorNumber})
                  {printing.labels.length > 0 && (
                    <span className="chips">
                      {printing.labels.map((label) => (
                        <span key={label} className="chip">
                          {label}
                        </span>
                      ))}
                    </span>
                  )}
                </>
              ) : (
                <span className="muted">{ui.common.loading}</span>
              )}
            </dd>
            <dt>{text.finish}</dt>
            <dd>
              <label className="check" title={foilLocked ? text.oneFinish : undefined}>
                <input
                  type="checkbox"
                  checked={line.foil}
                  disabled={foilLocked}
                  onChange={(event) => onUpdate({ foil: event.target.checked })}
                />
                {ui.common.foil}
              </label>
              {foilLocked && pinned && (
                <span className="muted small">{text.foilOnly(hasFoil(pinned))}</span>
              )}
            </dd>
            <dt>{text.quantity}</dt>
            <dd>
              <Stepper
                value={line.qty}
                min={1}
                max={maxQty}
                maxTitle={maxTitle}
                onChange={(qty) => onUpdate({ qty })}
                label={text.quantityLabel}
              />
            </dd>
            {board && (
              <>
                <dt>{text.board}</dt>
                <dd className="board-moves">
                  {ui.boards.labels[board.current]}
                  {board.options.map((to) => (
                    <button key={to} type="button" className="link-btn" onClick={() => board.onMove(to)}>
                      {text.moveTo(ui.boards.inSentence[to])}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>{text.price}</dt>
            <dd>
              <strong>{formatEur(unit)}</strong>
              {unit !== null && line.qty > 1 && (
                <span className="muted">
                  {' '}
                  × {line.qty} = {formatEur(unit * line.qty)}
                </span>
              )}
              {unit === null && entry?.data && <span className="muted small">{text.noPrice}</span>}
            </dd>
          </dl>
          <div className="card-view-actions">
            {commander?.leads && (
              <span className="chip commander-chip">
                <Icon name="crown" /> {text.commander}
              </span>
            )}
            {commander && !commander.leads && commander.onJoin && (
              <button type="button" onClick={commander.onJoin}>
                <Icon name="crown" /> {text.addPartner}
              </button>
            )}
            {commander && !commander.leads && commander.canLead && (
              <button type="button" onClick={commander.onMake}>
                <Icon name="crown" /> {text.makeCommander(!!commander.onJoin)}
              </button>
            )}
            {printing?.cardmarketUrl && <CardmarketButton url={printing.cardmarketUrl} labeled />}
          </div>
          {info && (
            <details className="legality-more">
              <summary>
                {text.allFormats}
                <span className="muted small">
                  {text.legalCount(FORMATS.filter((f) => info.legalities[f.id] === 'legal').length, FORMATS.length)}
                </span>
              </summary>
              <div className="legality-grid" aria-label={text.legality}>
                {FORMATS.map((f) => {
                  const status = info.legalities[f.id] ?? 'not_legal'
                  return (
                    <div key={f.id} className={`legality ${status}${format?.id === f.id ? ' current' : ''}`}>
                      <span>{f.label}</span>
                      <span className="legality-status">{STATUS_LABELS[status] ?? status}</span>
                    </div>
                  )
                })}
              </div>
            </details>
          )}
          {rulings && rulings.length > 0 && (
            <details className="legality-more">
              <summary>
                {text.rulings}
                <span className="muted small">{text.rulingsCount(rulings.length)}</span>
              </summary>
              <ul className="rulings">
                {rulings.map((ruling, i) => (
                  <li key={i}>
                    <span className="muted small">
                      {formatIsoDate(ruling.date)} · {text.rulingSources[ruling.source] ?? ruling.source}
                    </span>
                    <p>
                      <SymbolText text={ruling.text} />
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <section className="change-version">
        <PickerBody name={line.name}>
          {(list) => (
            <VersionPicker
              printings={list}
              foil={line.foil}
              selected={selected}
              onSelect={selectVersion}
              onPreview={setPreviewing}
              heading={<h3 title={text.changeHint}>{text.changeVersion}</h3>}
            />
          )}
        </PickerBody>
      </section>
    </Modal>
  )
}

/** Props of {@link CardText}. */
interface CardTextProps {
  info: CardInfo
  line: Pick<CardLine, 'name' | 'lang' | 'set' | 'collector'>
  /** The printing shown, whose printed text is looked for first. */
  printing: Printing | null
  /** A two-sided card shows its back. */
  back: boolean
}

/**
 * What a card says: each face's cost, type line, rules text and stats, under a note of which rules
 * text shows. A two-sided card shows the face its image shows; a split, Adventure or flip card shows
 * every face. Printed text, when Settings ask for it, is the copy's language as Scryfall has it;
 * Oracle text stands in where it has none (English printings).
 */
function CardText({ info, line, printing, back }: CardTextProps) {
  const text = ui.card.dialog
  const { rulesText } = useSettings()
  const query = rulesText === 'printed' ? localizedQueryOf(line, printing) : undefined
  useLocalizedImagesVersion()
  useEffect(() => {
    if (query) requestLocalizedImage(query)
  })
  const faces: CardFace[] = info.faces ?? [{ name: info.name, manaCost: info.manaCost, typeLine: info.typeLine, text: '' }]
  const twoSided = !!printing?.imageBack && faces.length > 1
  const index = twoSided && back ? 1 : 0
  const shown = twoSided ? [faces[index]] : faces
  const local = query ? localizedImage(query) : undefined
  const printed = local?.faces?.length === faces.length ? local.faces : null
  const printedOf = (i: number): PrintedFace | null => printed?.[twoSided ? index : i] ?? null

  let label: string = text.oracleText
  if (rulesText === 'printed') {
    if (!line.lang) label = text.noPrintedText.english
    else if (local === undefined) label = text.noPrintedText.loading
    else label = printed ? text.printedText(languageLabel(line.lang)) : text.noPrintedText.missing
  }
  const hasText = shown.some((face) => face.text)

  return (
    <div className="card-text">
      {hasText && <p className="muted small card-text-label">{label}</p>}
      {shown.map((face, i) => {
        const own = printedOf(i)
        const named = shown.length > 1
        const cost = face.manaCost && <ManaCost cost={face.manaCost} manaValue={named ? undefined : info.manaValue} />
        const stats = face.pt ?? (face.loyalty && text.loyalty(face.loyalty)) ?? (face.defense && text.defense(face.defense))
        return (
          <div key={i} className="card-face">
            <div className="card-face-head">
              {named ? <strong>{own?.name ?? face.name}</strong> : <TypeLine typeLine={own?.typeLine ?? face.typeLine} oracle={face.typeLine} />}
              {cost}
            </div>
            {named && <TypeLine typeLine={own?.typeLine ?? face.typeLine} oracle={face.typeLine} />}
            {(own?.text || face.text) && <RulesText text={own?.text || face.text} />}
            {stats && <p className="card-face-stats">{stats}</p>}
          </div>
        )
      })}
    </div>
  )
}
