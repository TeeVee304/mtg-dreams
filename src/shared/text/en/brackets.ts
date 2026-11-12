/** The Bracket section: a Deck's declared bracket, the estimated one, and why. */
export const bracket = {
  title: 'Bracket',
  estimated: (label: string) => `Estimated ${label}`,
  fits: (level: number) => `Fits Bracket ${level}`,
  aboveStatus: (level: number, label: string) => `Above Bracket ${level} · Estimated ${label}`,
  turn: (turn: number | null) => (turn ? `No win expected before Turn ${turn}` : 'Games can end on any Turn'),
  declared: 'Declared bracket',
  notSet: 'Automatic',
  levelHint: (level: number, name: string) => `Bracket ${level} · ${name}`,
  rule: 'Rule',
  rules: {
    gameChangers: 'Game Changers',
    combos: 'Two-Card combos',
    landDenial: 'Mass Land denial',
    extraTurns: 'Extra Turns'
  },
  none: 'None',
  notChecked: 'Not checked',
  loading: 'Loading…',
  comboSplit: (early: number, late: number) => [early > 0 && `${early} early`, late > 0 && `${late} late`].filter(Boolean).join(', '),
  cell: {
    fits: (level: number) => `Fits Bracket ${level}`,
    breaks: (level: number) => `Breaks Bracket ${level}`,
    unknown: 'Not checked'
  },
  combos: 'Combos',
  noCombos: 'No game-ending two-card combos.',
  checking: 'Checking combos…',
  offline: 'Commander Spellbook unreachable',
  retry: 'Retry',
  moreCombos: (n: number) => `+${n} more`,
  fewerCombos: 'Show fewer',
  timing: (mana: number, turn: number | null) => (turn ? `${mana} Mana · likely Turn ${turn}` : `${mana} Mana`),
  early: 'Early',
  late: 'Late',
  salt: 'Salt',
  saltier: (percent: number) => `↑ ${percent}% above average`,
  lessSalty: (percent: number) => `↓ ${percent}% below average`,
  saltAverage: 'About average',
  saltVsHint: (level: number | null, commanders: string) =>
    `Salt per Card, against EDHREC's average${level ? ` Bracket ${level}` : ''} Deck for ${commanders}`,
  saltScore: (salt: number) => `${salt.toFixed(2)} of 4 in EDHREC's salt survey`,
  saltUnknown: 'EDHREC unreachable',
  asOf: 'Rules of 9 Feb 2026',
  comboSource: 'Combos: Commander Spellbook',
  saltSource: 'Salt: EDHREC',
  /** Card marks. */
  above: (level: number) => `Above Bracket ${level}`,
  aboveHint: (reason: string, level: number) => `${reason}, above Bracket ${level}`,
  reasons: {
    gameChangers: 'Game Changer',
    combos: 'Two-Card combo',
    landDenial: 'Mass Land denial',
    extraTurns: 'Extra Turn'
  },
  comboPiece: 'Two-Card combo piece',
  earlyComboPiece: 'Early two-Card combo piece',
  /** The New list dialog. */
  optional: 'Optional'
}
