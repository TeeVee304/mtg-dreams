import { common, crash, prices, time } from './common'
import { list, listDialogs, moves } from './lists'
import { names } from './names'
import { ownership, rules, sections } from './rules'
import { priceBases, sorts, wantedSorts } from './sorts'
import { app, contextMenu, errors, fileDialogs, printingTags } from './system'
import { boards, count, terms } from './terms'
import { sidebar, welcome } from './sidebar'
import { wizard } from './wizard'
import { changes } from './changes'
import { settings } from './settings'
import { dialogs } from './dialogs'
import { precons } from './precons'
import { wanted } from './wanted'
import { trades } from './trades'
import { inventory } from './inventory'
import { value } from './value'
import { card } from './cards'
import { deckTokens, filters, startingHand, stats, swaps, upgradeSwaps } from './panels'

/** The English catalog: every text the app shows, by area. */
export const en = {
  terms,
  boards,
  count,
  common,
  crash,
  time,
  prices,
  moves,
  list,
  listDialogs,
  sidebar,
  welcome,
  wizard,
  changes,
  settings,
  dialogs,
  precons,
  wanted,
  trades,
  inventory,
  value,
  card,
  swaps,
  upgradeSwaps,
  startingHand,
  stats,
  deckTokens,
  filters,
  rules,
  ownership,
  sections,
  names,
  sorts,
  wantedSorts,
  priceBases,
  app,
  contextMenu,
  fileDialogs,
  printingTags,
  errors
}
