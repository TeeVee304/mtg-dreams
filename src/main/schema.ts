/**
 * Schema versions of saved files, and the steps that upgrade older ones. Each kind of file has a list
 * of steps: `steps[0]` upgrades version 1 to 2, `steps[1]` version 2 to 3, and so on, so its latest
 * version is one more than its number of steps. Version 1 is the format from before versioning, so a
 * file without a version is version 1.
 *
 * Steps must be safe to run twice: a lost version (a deleted `lists.json`) reads as version 1 and runs
 * them all again. A file newer than the app (saved by a newer MTG Dreams) is never upgraded or
 * overwritten.
 *
 * Caches and trade files keep their own `version` fields: caches are re-downloadable, and trade files
 * travel between players.
 *
 * @packageDocumentation
 */

/** Upgrades the data folder (lists, inventory, trades, `lists.json`) by one version. */
export type DataStep = (dir: string) => Promise<void>

/** Upgrades the settings by one version, in place. */
export type SettingsStep = (settings: Record<string, unknown>) => void

/** Data folder steps; the version is kept in `lists.json`. */
export const DATA_STEPS: DataStep[] = []

/** Settings steps; the version is kept in `settings.json`. */
export const SETTINGS_STEPS: SettingsStep[] = []

/** @returns The latest version of a kind of file with these steps. */
export const latestVersion = (steps: unknown[]): number => steps.length + 1

/** Latest data folder version. */
export const DATA_VERSION = latestVersion(DATA_STEPS)

/** Latest settings version. */
export const SETTINGS_VERSION = latestVersion(SETTINGS_STEPS)

/** @returns A stored version; 1 if missing or invalid. */
export function readVersion(raw: unknown): number {
  return Number.isSafeInteger(raw) && (raw as number) >= 1 ? (raw as number) : 1
}

/**
 * @returns The steps that upgrade version `from` to the latest, each with the version it reaches; none
 * if `from` is the latest or newer.
 */
export function pendingSteps<S>(from: number, steps: S[]): { step: S; to: number }[] {
  return steps.slice(from - 1).map((step, i) => ({ step, to: from + i + 1 }))
}
