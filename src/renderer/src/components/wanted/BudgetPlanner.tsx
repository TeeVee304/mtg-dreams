import { useState } from 'react'
import { countLines } from '@shared/decklist'
import { sumOf } from '@shared/totals'
import { planPurchases, sortWanted } from '@shared/wanted'
import { useStoredToggle } from '../../hooks/useStoredToggle'
import { useStoredValue } from '../../hooks/useStoredValue'
import { cardCount, formatEur } from '../../lib/format'
import type { WantedOverview } from '../../lib/wanted'
import type { LibraryActions } from '../../stores/library'
import { Collapsible } from '../Collapsible'
import { Icon } from '../Icon'
import { useToast } from '../Toasts'

/** Valid stored budget: a positive number. */
const isBudget = (value: string): value is string => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0

/** Props of {@link BudgetPlanner}. */
interface BudgetPlannerProps {
  overview: WantedOverview
  actions: LibraryActions
  onCopy: (text: string, what: string) => void
}

/**
 * Collapsible budget planner, closed by default: picks the cards with the most benefit per euro
 * within a budget ({@link planPurchases}).
 */
export function BudgetPlanner({ overview, actions, onCopy }: BudgetPlannerProps) {
  const toast = useToast()
  const [open, toggle] = useStoredToggle('mtg-dreams.plannerOpen', false)
  const [budgetText, setBudgetText] = useStoredValue<string>('mtg-dreams.budget', '50', isBudget)
  const [draft, setDraft] = useState(budgetText)
  const budget = Number(budgetText)
  const ordered = sortWanted(overview.cards, 'value', overview.unitOf, () => null)
  const plan = open ? planPurchases(ordered, overview.unitOf, budget, overview) : null
  const needs = plan ? sumOf(plan.items, (item) => item.lists.length) : 0
  const copies = plan ? sumOf(plan.items, (item) => item.copies) : 0

  return (
    <Collapsible open={open} onToggle={toggle} title="Budget planner" summary="The most list progress for your money">
      {plan && (
        <div className="planner-body">
          <div className="planner-head">
            <label className="field-inline">
              Budget
              <input
                type="number"
                min={1}
                step={5}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  if (isBudget(event.target.value)) setBudgetText(event.target.value)
                }}
                aria-label="Budget in euros"
              />
              €
            </label>
            <span>
              <strong>{cardCount(copies)}</strong> for <strong>{formatEur(plan.total)}</strong> · covers {needs} list{' '}
              {needs === 1 ? 'need' : 'needs'}
              {plan.completes.length > 0 && (
                <span title="Every card these lists miss, basic lands aside"> · completes {plan.completes.map((list) => list.name).join(', ')}</span>
              )}
            </span>
            <span className="spacer" />
            <button
              type="button"
              disabled={plan.items.length === 0}
              onClick={() => onCopy(countLines(plan.items.map((item) => ({ qty: item.copies, name: item.card.name }))).join('\n'), 'Shopping list')}
            >
              Copy as text
            </button>
            <button
              type="button"
              disabled={plan.items.length === 0}
              onClick={() => {
                actions.addOwned(plan.items.map((item) => ({ name: item.card.name, qty: item.copies })))
                toast(`Marked ${cardCount(copies)} as bought (Ctrl+Z to undo)`)
              }}
            >
              <Icon name="check" /> Mark all as bought
            </button>
          </div>
          {plan.items.length > 0 ? (
            <ol className="plan-list">
              {plan.items.map((item) => (
                <li key={item.card.key}>
                  <span className="plan-name">
                    {item.copies}× {item.card.name}
                  </span>
                  <span className="muted small">{item.lists.map((list) => list.name).join(', ')}</span>
                  <span className="plan-cost">{formatEur(item.cost)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">Nothing fits this budget.</p>
          )}
          {plan.unpriced > 0 && (
            <p className="muted small">
              {cardCount(plan.unpriced)} without a price {overview.loading > 0 ? '(or still loading) ' : ''}are left out.
            </p>
          )}
        </div>
      )}
    </Collapsible>
  )
}
