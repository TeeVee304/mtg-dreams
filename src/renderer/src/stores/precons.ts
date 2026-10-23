import { promiseCache } from '@shared/promiseCache'
import type { PreconDeck, PreconSummary } from '@shared/types'

/** The precon list, asked for once while it holds. */
const index = promiseCache<PreconSummary[]>(1)
/** Decklists opened lately. */
const decks = promiseCache<PreconDeck>(20)

/** @returns Paper precons, newest first. */
export const preconIndex = () => index.get('index', () => window.api.getPreconIndex())

/** @returns A precon's decklist by its MTGJSON file name. */
export const preconDeck = (fileName: string) => decks.get(fileName, () => window.api.getPrecon(fileName))
