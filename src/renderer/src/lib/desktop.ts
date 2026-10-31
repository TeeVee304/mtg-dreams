/**
 * The desktop around the app, reached through the main process: the clipboard, the browser, the
 * data folder, trade files, the caches and window focus. Components use these rather than `window.api`, so the
 * transport stays in the stores and here.
 *
 * @packageDocumentation
 */

/** Puts text on the clipboard. */
export const copyText = (text: string) => window.api.copyText(text)

/** Opens a Cardmarket, Scryfall or EDHREC page in the browser; other addresses are ignored. */
export const openExternal = (url: string) => window.api.openExternal(url)

/** Shows the data folder in Explorer. */
export const openDataFolder = () => window.api.openDataDir()

/** Asks for a trade list file to import. @returns Its name and text; null if none was picked. */
export const openTradeFile = () => window.api.openTradeFile()

/** Saves a trade list file where the user picks. @returns Its path; null if cancelled. */
export const saveTradeFile = (name: string, text: string) => window.api.saveTradeFile(name, text)

/** @returns Disk used by each cache, and how many Cards the Scryfall cache holds. */
export const getCacheSizes = () => window.api.getCacheSizes()

/** Deletes every cache, then restarts the app. */
export const clearCaches = () => window.api.clearCaches()

/** Calls `listener` whenever the window gets focus. @returns Unsubscribe. */
export const onWindowFocus = (listener: () => void) => window.api.onWindowFocus(listener)
