/**
 * Card search: Scryfall's name suggestions and the small images shown beside them.
 *
 * @packageDocumentation
 */

/** @returns Card names Scryfall suggests for what was typed. */
export const suggestCardNames = (query: string) => window.api.autocomplete(query)

/** @returns Small image URLs by nameKey; null for a card without one. */
export const smallCardImages = (names: string[]) => window.api.getCardImages(names)
