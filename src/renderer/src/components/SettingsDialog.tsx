import { useState } from 'react'
import type { AppSettings, Theme } from '@shared/api'
import { PRICE_BASES } from '@shared/pricing'
import { cleanError, formatDate } from '../lib/format'
import { updateSettings, useSettings } from '../stores/settings'
import { ColorOptions } from './Controls'
import { Modal } from './Modal'

const THEMES: Array<{ id: Theme; label: string; hint: string }> = [
  { id: 'system', label: 'System', hint: 'Follow Windows' },
  { id: 'light', label: 'Light', hint: 'Always light' },
  { id: 'dark', label: 'Dark', hint: 'Always dark' }
]

/** Props of {@link SettingsDialog}. */
interface SettingsDialogProps {
  onClose: () => void
  /** Folder holding decks, wishlists, the inventory and trades. */
  dataDir: string
  onOpenDataDir: () => void
  onChangeDataDir: () => void
  /** Publication time of the Cardmarket price guide in use; null if none yet. */
  pricedAt: number | null
  /** Checks Cardmarket for newer prices. */
  onRefreshPrices: () => Promise<void>
}

/** Settings dialog; changes apply immediately. */
export function SettingsDialog(props: SettingsDialogProps) {
  const { onClose, dataDir, onOpenDataDir, onChangeDataDir, pricedAt, onRefreshPrices } = props
  const settings = useSettings()
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const change = (patch: Partial<AppSettings>) => {
    setError(null)
    updateSettings(patch).catch((e) => setError(cleanError(e)))
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Color</h3>
        <ColorOptions value={settings.color} onChange={(color) => color && change({ color })} />
      </section>

      <section className="settings-section">
        <h3>Mode</h3>
        <div className="theme-options" role="radiogroup" aria-label="Mode">
          {THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={settings.theme === option.id}
              className={`theme-option theme-${option.id}${settings.theme === option.id ? ' selected' : ''}`}
              onClick={() => change({ theme: option.id })}
            >
              <span className="theme-swatch" aria-hidden="true" />
              <span className="theme-label">{option.label}</span>
              <span className="muted tiny">{option.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Prices</h3>
        <div className="radio-options" role="radiogroup" aria-label="Price basis">
          {PRICE_BASES.map((basis) => (
            <label key={basis.id} className="radio-option">
              <input
                type="radio"
                name="price-basis"
                checked={settings.priceBasis === basis.id}
                onChange={() => change({ priceBasis: basis.id })}
              />
              <span className="setting-text">
                <span className="setting-label">{basis.label}</span>
                <span className="muted small">{basis.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="muted tiny settings-note">
          Cardmarket’s daily price guide, in EUR{pricedAt ? `, from ${formatDate(pricedAt)}` : ''}.{' '}
          <button
            type="button"
            className="link-btn"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true)
              void onRefreshPrices().finally(() => setRefreshing(false))
            }}
          >
            {refreshing ? 'Checking…' : 'Check now'}
          </button>
          <br />
          Inventory Value always uses Typical.
        </p>
        <div className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Price change alerts</span>
            <span className="muted small">
              Flags wishlist cards whose price moved since you added them, by both the percentage and the amount.
            </span>
          </span>
          <span className="alert-fields">
            <span className="percent-field">
              At least
              <input
                type="number"
                min={1}
                max={90}
                step={1}
                value={settings.dropAlertPercent}
                aria-label="Price change alert threshold in percent"
                onChange={(event) => {
                  const percent = Math.round(Number(event.target.value))
                  if (percent >= 1 && percent <= 90) change({ dropAlertPercent: percent })
                }}
              />
              %
            </span>
            <span className="percent-field">
              <span className="move-down">↓ cheaper</span> by
              <input
                type="number"
                min={0}
                max={100}
                step={0.05}
                value={settings.dropAlertMinEur}
                aria-label="Smallest price drop for an alert, in euros"
                onChange={(event) => {
                  const euros = Math.round(Number(event.target.value) * 100) / 100
                  if (euros >= 0 && euros <= 100) change({ dropAlertMinEur: euros })
                }}
              />
              €
            </span>
            <span className="percent-field">
              <span className="move-up">↑ pricier</span> by
              <input
                type="number"
                min={0}
                max={100}
                step={0.05}
                value={settings.riseAlertMinEur}
                aria-label="Smallest price rise for an alert, in euros"
                onChange={(event) => {
                  const euros = Math.round(Number(event.target.value) * 100) / 100
                  if (euros >= 0 && euros <= 100) change({ riseAlertMinEur: euros })
                }}
              />
              €
            </span>
          </span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Decks &amp; wishlists</h3>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Card Images</span>
            <span className="muted small">A thumbnail beside each card.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.cardImages}
            onChange={(event) => change({ cardImages: event.target.checked })}
          />
        </label>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Simple Basic Lands</span>
            <span className="muted small">
              Every basic land version counts as one free card. Faster; your files keep their versions.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.bundleBasics}
            onChange={(event) => change({ bundleBasics: event.target.checked })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>Copies</h3>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Wishlists reserve Copies</span>
            <span className="muted small">
              After built decks, wishlists hold copies from the top down. Off: each wishlist uses every copy decks
              don&apos;t hold.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.wishlistsReserve}
            onChange={(event) => change({ wishlistsReserve: event.target.checked })}
          />
        </label>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Brews ignore Inventory</span>
            <span className="muted small">Brews show only their cards and prices, with nothing owned.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.plainBrews}
            onChange={(event) => change({ plainBrews: event.target.checked })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>Data folder</h3>
        <p className="data-dir" title={dataDir}>
          {dataDir}
        </p>
        <div className="foot-row">
          <button type="button" onClick={onOpenDataDir}>
            Open
          </button>
          <button type="button" onClick={onChangeDataDir}>
            Change…
          </button>
        </div>
        <p className="muted tiny settings-note">
          Your lists, inventory and trades, as text files.
        </p>
      </section>
      {error && <p className="warn">{error}</p>}
      <p className="muted tiny settings-credits">
        Card data &amp; images © Scryfall / Wizards of the Coast. Prices from Cardmarket. MTG Dreams is not affiliated
        with them.
      </p>
    </Modal>
  )
}
