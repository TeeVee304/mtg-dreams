/**
 * Languages cards are printed in, by Scryfall's code. A copy's language is only a note: it never
 * changes the price. English is the default and is never written.
 *
 * @packageDocumentation
 */

/** Printed languages besides English, by Scryfall code. */
export const LANGUAGES = [
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'it', label: 'Italian' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'zhs', label: 'Chinese (Simplified)' },
  { code: 'zht', label: 'Chinese (Traditional)' },
  { code: 'ph', label: 'Phyrexian' }
] as const

/** A printed language besides English. */
export type Language = (typeof LANGUAGES)[number]['code']

/** @returns The language a code names (any case); undefined for English or an unknown code. */
export function languageOf(code: string | undefined): Language | undefined {
  const lower = code?.toLowerCase()
  return LANGUAGES.find((language) => language.code === lower)?.code
}

/** @returns A language's name, e.g. `German`. */
export const languageLabel = (code: Language) => LANGUAGES.find((language) => language.code === code)!.label
