import { count } from './terms'

/** Inventory Value: what your Collection is worth, and how that moved. */
export const value = {
  title: 'Inventory Value',
  empty: "Your Inventory is empty. Add Cards or a Precon you own to see what it's worth.",
  totals: (unique: number, copies: number) => `${unique} unique Cards · ${copies} Copies`,
  pricing: (n: number) => `Pricing ${n} more ${count.cardWord(n)}…`,
  mostValuable: 'Most valuable Cards',
  foil: ' · Foil',
  cheapest: ' · cheapest Version',
  cheapestVersion: (foil: boolean) => `cheapest Version${foil ? ' · Foil' : ''}`,
  showMore: (n: number) => `Show ${n} more`,
  note: (basis: string, bundled: boolean, unpriced: number) =>
    `Estimated at Cardmarket prices (${basis}): Copies at the Version you recorded, the rest at each Card's cheapest Version${bundled ? '; bundled basic Lands count as free' : ''}.${
      unpriced > 0 ? ` ${unpriced} ${unpriced === 1 ? 'Card has' : 'Cards have'} no price and ${unpriced === 1 ? 'is' : 'are'} left out.` : ''
    }`,
  period: 'Period',
  ranges: { week: 'This week', month: 'This month' },
  since: (date: string) => `since ${date}`,
  rises: 'Biggest rises',
  falls: 'Biggest falls',
  none: 'None',
  noHistory: "Price changes show up here after Cardmarket's next daily price update: MTG Dreams keeps its own history from the day it first sees your Cards."
}
