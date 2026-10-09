/**
 * The Deck Wizard's own service endpoints, kept apart from the app's `Environment`. Set by
 * `registerDeckWizard` at startup; tests point them at local stubs.
 *
 * @packageDocumentation
 */

/** Endpoints the wizard talks to. */
export interface WizardServices {
  /** Commander Spellbook API base URL, for combos and bracket checks. */
  spellbookApi: string
}

/** Production endpoints. */
export const WIZARD_SERVICES: WizardServices = {
  spellbookApi: 'https://backend.commanderspellbook.com'
}

let current: WizardServices = WIZARD_SERVICES

/** Sets the endpoints returned by {@link wizardServices}; unset ones keep their production URL. */
export function setWizardServices(services: Partial<WizardServices>): void {
  current = { ...WIZARD_SERVICES, ...services }
}

/** @returns The endpoints in use. */
export function wizardServices(): WizardServices {
  return current
}
