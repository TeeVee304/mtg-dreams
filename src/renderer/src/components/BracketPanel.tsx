import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BRACKET_LEVELS, BRACKET_TURNS, bracketName, fitsRule, type BracketLevel, type BracketRule } from '@shared/brackets'
import { ui } from '@shared/text'
import type { DeckBracket } from '../hooks/useDeckBracket'
import { useResizeObserver } from '../hooks/useResizeObserver'
import { BracketPicker } from './BracketPicker'
import { Collapsible } from './Collapsible'
import { Icon, type IconName } from './Icon'

/** Props of {@link BracketPanel}. */
interface BracketPanelProps {
  /** Open; the page keeps it, so opening Statistics can fold it. */
  open: boolean
  onToggle: () => void
  bracket: DeckBracket
  /** Declares a bracket, or none; absent where it can't be changed (a Version's view). */
  onDeclare?: (level: BracketLevel | null) => void
}

/** Each rule's row: its icon and the Cards behind it. */
const RULE_ICONS: Record<BracketRule, IconName> = {
  gameChangers: 'bolt',
  combos: 'combo',
  landDenial: 'landDenial',
  extraTurns: 'extraTurn'
}

const text = ui.bracket

/**
 * A Deck's bracket, folded to its medal and status beside Statistics. Open, it checks the Deck
 * against each bracket's rules, lists the two-Card combos that end the game, and its saltiest Cards.
 */
export function BracketPanel({ open, onToggle: toggle, bracket, onDeclare }: BracketPanelProps) {
  const { declared, label, fits, salt, facts } = bracket
  const medal = declared === null ? label : String(declared)
  // Until Scryfall's tags are known, their rules say so instead of listing no Cards.
  const tagNote = facts.tagged ? undefined : bracket.tagsLoading ? text.loading : text.notChecked
  const tagCount = (cards: string[]) => (facts.tagged ? cards.length : null)
  const status = declared === null ? text.estimated(label) : fits ? text.fits(declared) : text.aboveStatus(declared, label)
  const versus = bracket.saltVsAverage
  const [allCombos, setAllCombos] = useState(false)
  // Whatever changes the side column's or the table's height.
  const content = JSON.stringify([facts, salt, versus, bracket.checking, bracket.saltLoading, declared])
  const { columns, table, side, salt: saltRef, combos: comboRefs, fit } = useSideFit(open, content)
  // Another Deck, or the same one changed: its combos fold again.
  useEffect(() => setAllCombos(false), [content])

  const saltSection: ReactNode = (
    <section className={`bracket-salty${fit.saltBelow ? ' strip' : ''}`} ref={saltRef}>
      <h4>
        <Icon name="salt" />
        {text.salt}
        {versus && (
          <span
            className={`chip salt-versus${Math.abs(versus.percent) < 5 ? '' : versus.percent > 0 ? ' pricier' : ' cheaper'}`}
            title={text.saltVsHint(versus.level, ui.common.and(versus.commanders))}
          >
            {Math.abs(versus.percent) < 5 ? text.saltAverage : versus.percent > 0 ? text.saltier(versus.percent) : text.lessSalty(-versus.percent)}
          </span>
        )}
      </h4>
      {salt ? (
        <div className="bracket-salt-rows">
          {salt.saltiest.map((card) => (
            <div key={card.name} className="bracket-salt-row" title={text.saltScore(card.salt)}>
              <span className="bracket-salt-name">{card.name}</span>
              <span className="bracket-salt-bar" aria-hidden="true">
                <span style={{ width: `${(card.salt / 4) * 100}%` }} />
              </span>
              <span className="muted">{card.salt.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">{bracket.saltLoading ? text.loading : text.saltUnknown}</p>
      )}
    </section>
  )

  return (
    <Collapsible
      open={open}
      onToggle={toggle}
      className={`bracket-panel${fits ? '' : ' above'}`}
      title={
        <span className="bracket-title">
          <span className={`bracket-medal${declared === null ? ' unset' : ''}${medal.length > 1 ? ' range' : ''}`}>{medal}</span>
          <span className="bracket-heading">
            <span className="bracket-heading-name">{text.title}</span>
            {open && declared !== null && <span className="muted"> · {bracketName(declared)}</span>}
          </span>
        </span>
      }
      summary={
        <span className={fits ? undefined : 'bracket-warn'}>{text.estimated(label)}</span>
      }
    >
      <div className="bracket-body">
        <div className="bracket-head">
          <div className="bracket-status">
            <span className={`bracket-verdict${fits ? (declared === null ? '' : ' good') : ' warn'}`}>
              {declared !== null && <Icon name={fits ? 'check' : 'warning'} />}
              {status}
            </span>
            <span className="muted bracket-turn">
              <Icon name="hourglass" />
              {text.turn(BRACKET_TURNS[declared ?? bracket.floor])}
            </span>
          </div>
          {onDeclare && (
            <div className="bracket-declare">
              <BracketPicker value={declared} onChange={onDeclare} variant="compact" />
              <span className="muted small">{text.declared}</span>
            </div>
          )}
        </div>

        <div className="bracket-columns" ref={columns}>
          <div className="bracket-table-box" ref={table}>
            <table className="bracket-table">
              <thead>
                <tr>
                  <th scope="col">{text.rule}</th>
                  {BRACKET_LEVELS.map((level) => (
                    <th key={level} scope="col" className={level === declared ? 'declared' : undefined}>
                      <span className="bracket-level">{level}</span>
                      <span className="bracket-level-name">{bracketName(level)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <RuleRow rule="gameChangers" bracket={bracket} cards={facts.gameChangers} />
                <RuleRow
                  rule="combos"
                  bracket={bracket}
                  count={facts.combos?.length ?? null}
                  note={
                    facts.combos === null
                      ? bracket.checking
                        ? text.loading
                        : text.notChecked
                      : facts.combos.length === 0
                        ? text.none
                        : text.comboSplit(facts.combos.filter((one) => one.early).length, facts.combos.filter((one) => !one.early).length)
                  }
                />
                <RuleRow rule="landDenial" bracket={bracket} cards={facts.landDenial} note={tagNote} count={tagCount(facts.landDenial)} />
                <RuleRow rule="extraTurns" bracket={bracket} cards={facts.extraTurns} note={tagNote} count={tagCount(facts.extraTurns)} />
              </tbody>
            </table>
          </div>

          <div className="bracket-side" ref={side}>
            <section className="bracket-combos">
              <h4>{text.combos}</h4>
              {facts.combos === null ? (
                bracket.checking ? (
                  <p className="muted small">{text.checking}</p>
                ) : (
                  <p className="bracket-combo offline">
                    <Icon name="combo" />
                    <span>{text.offline}</span>
                    <button type="button" className="small" onClick={bracket.retry}>
                      {text.retry}
                    </button>
                  </p>
                )
              ) : facts.combos.length === 0 ? (
                <p className="muted small">{text.noCombos}</p>
              ) : (
                <>
                  {facts.combos.slice(0, allCombos ? undefined : (fit.combos ?? undefined)).map((combo, index) => (
                    <a
                      key={combo.id}
                      ref={(element) => void (comboRefs.current[index] = element)}
                      className={`bracket-combo${combo.early ? ' early' : ''}`}
                      href={`https://commanderspellbook.com/combo/${combo.id}/`}
                    >
                      <Icon name="combo" />
                      <span className="bracket-combo-text">
                        <b>{combo.pieces.map((piece) => piece.name).join(' + ')}</b>
                        <span className="muted small">{combo.results.join(', ')}</span>
                        <span className="muted small">{text.timing(combo.mana, combo.turn)}</span>
                      </span>
                      <span className="bracket-tag">{combo.early ? text.early : text.late}</span>
                    </a>
                  ))}
                  {fit.combos !== null && fit.combos < facts.combos.length && (
                    <button type="button" className="bracket-more" onClick={() => setAllCombos(!allCombos)}>
                      {allCombos ? text.fewerCombos : text.moreCombos(facts.combos.length - fit.combos)}
                    </button>
                  )}
                </>
              )}
            </section>

            {!fit.saltBelow && saltSection}
          </div>
        </div>

        {fit.saltBelow && saltSection}

        <div className="bracket-foot muted small">
          <span>{text.asOf}</span>
          <span className="bracket-sources">
            <a href="https://commanderspellbook.com/">
              {text.comboSource}
              <Icon name="external" />
            </a>
            <a href="https://edhrec.com/top/salt">
              {text.saltSource}
              <Icon name="external" />
            </a>
          </span>
        </div>
      </div>
    </Collapsible>
  )
}

/** Where the side column's parts go: Salt beside the table or under it, and how many combos show. */
interface SideFit {
  saltBelow: boolean
  /** Combos shown before "+N more"; null for all. */
  combos: number | null
}

/** Everything beside the table: how it is first laid out, and measured. */
const FULL: SideFit = { saltBelow: false, combos: null }

/** The "+N more" button's height and the gap above it. */
const MORE_HEIGHT = 44

/**
 * Keeps the side column from running past the rule table's bottom: Salt moves under the table when
 * the column would, and then, if the combos alone still would, they show as many as fit and "+N
 * more". Each change lays the column out whole and measures it before it paints.
 * @param content - Changes whenever what the table or the column holds does.
 */
function useSideFit(open: boolean, content: string) {
  const columns = useRef<HTMLDivElement>(null)
  const table = useRef<HTMLDivElement>(null)
  const side = useRef<HTMLDivElement>(null)
  const salt = useRef<HTMLElement>(null)
  /** The combos shown, in order; entries past those shown are stale. */
  const combos = useRef<Array<HTMLElement | null>>([])
  const [fit, setFit] = useState<SideFit>(FULL)
  const [pass, setPass] = useState(0)
  const [width, setWidth] = useState(0)

  // Content or width changed: lay everything out beside the table again, to be measured.
  useLayoutEffect(() => {
    if (!open) return
    setFit(FULL)
    setPass((n) => n + 1)
  }, [open, content, width])

  useLayoutEffect(() => {
    if (pass > 0 && table.current && side.current) setFit(measureSide(table.current, side.current, salt.current, combos.current))
  }, [pass])

  // Only the width: the column's own height changes with what it decides, and mustn't ask again.
  useResizeObserver(open, () => [columns.current], () => setWidth(Math.round(columns.current?.getBoundingClientRect().width ?? 0)))

  return { columns, table, side, salt, combos, fit }
}

/** @returns Where the side column's parts go, measured with all of them beside the table. */
function measureSide(table: HTMLElement, side: HTMLElement, salt: HTMLElement | null, shown: Array<HTMLElement | null>): SideFit {
  const limit = table.getBoundingClientRect().bottom + 1
  // Stacked under the table, in a narrow window: nothing to line up with.
  if (side.getBoundingClientRect().top >= limit - 2) return FULL
  if (!salt || salt.getBoundingClientRect().bottom <= limit) return FULL
  const combos = shown.filter((combo): combo is HTMLElement => !!combo?.isConnected)
  const last = combos.at(-1)
  if (!last || last.getBoundingClientRect().bottom <= limit) return { saltBelow: true, combos: null }
  const fitting = combos.filter((combo) => combo.getBoundingClientRect().bottom + MORE_HEIGHT <= limit).length
  return { saltBelow: true, combos: Math.max(1, fitting) }
}

/** Props of {@link RuleRow}. */
interface RuleRowProps {
  rule: BracketRule
  bracket: DeckBracket
  /** The Cards behind the rule, listed under it. */
  cards?: string[]
  /** Its count, when not the Cards'; null when unknown. */
  count?: number | null
  /** Its note, when not the Cards'. */
  note?: string
}

/** One rule: its Cards, then whether the Deck keeps it at each bracket. */
function RuleRow({ rule, bracket, cards = [], count = cards.length, note }: RuleRowProps) {
  return (
    <tr>
      <th scope="row">
        <span className="bracket-rule">
          <Icon name={RULE_ICONS[rule]} />
          {text.rules[rule]} <span className="muted">{count ?? '?'}</span>
        </span>
        <span className="bracket-rule-cards muted small">{note ?? (cards.length === 0 ? text.none : cards.join(', '))}</span>
      </th>
      {BRACKET_LEVELS.map((level) => {
        const fit = fitsRule(bracket.facts, rule, level)
        const state = fit === null ? 'unknown' : fit ? 'fits' : 'breaks'
        const label = fit === null ? text.cell.unknown : fit ? text.cell.fits(level) : text.cell.breaks(level)
        return (
          <td key={level} className={`${state}${level === bracket.declared ? ' declared' : ''}`}>
            <span role="img" aria-label={label} title={label}>
              {state === 'fits' ? <Icon name="check" /> : state === 'breaks' ? <Icon name="close" /> : '?'}
            </span>
          </td>
        )
      })}
    </tr>
  )
}
