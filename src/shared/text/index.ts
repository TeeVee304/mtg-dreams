import { en } from './en'

/**
 * The app's text: every string it shows, kept out of the code in one catalog per language, by
 * area (`ui.inventory.empty`, `ui.count.cards(3)`). Texts with values are functions, so each
 * language words and pluralizes them its own way. Another language is a folder beside `en/` whose
 * catalog satisfies {@link Text}; the compiler then flags any text it lacks.
 *
 * What stays in code: text the app reads back (file headers, decklists, keys), and Magic's own
 * vocabulary that doubles as data (format, card type, color and basic land names).
 *
 * @packageDocumentation
 */

/** The shape every language's catalog has. */
export type Text = typeof en

/** The catalog in use. */
export const ui: Text = en
