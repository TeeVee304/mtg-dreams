import { useState } from 'react'
import type { AppSettings, Theme } from '@shared/api'
import { COPIES_MODES } from '@shared/copies'
import { PRICE_BASES } from '@shared/pricing'
import { THEME_COLORS } from '@shared/themes'
import { MANA_SYMBOLS, THEME_ICONS } from '../lib/artwork'
import { cleanError, formatDate } from '../lib/format'
import { updateSettings, useSettings } from '../stores/settings'
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
        <div className="color-options" role="radiogroup" aria-label="Color">
          {THEME_COLORS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={settings.color === option.id}
              className={`color-option${settings.color === option.id ? ' selected' : ''}`}
              onClick={() => change({ color: option.id })}
              title={`${option.label} (${option.look})`}
            >
              <img className="color-icon" src={THEME_ICONS[option.id]} alt="" draggable={false} />
              <span className="color-label">
                <img className="color-mana" src={MANA_SYMBOLS[option.id]} alt="" draggable={false} />
                {option.label}
              </span>
            </button>
          ))}
        </div>
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
          From Cardmarket’s daily price guide, in EUR{pricedAt ? `, published ${formatDate(pricedAt)}` : ''}. Checked
          hourly.{' '}
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
          Inventory Value always uses the typical price.
        </p>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Price drop alerts</span>
            <span className="muted small">
              Flags wishlist cards you still need once they&apos;re this much cheaper than when you added them.
            </span>
          </span>
          <span className="percent-field">
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              value={settings.dropAlertPercent}
              aria-label="Price drop alert threshold in percent"
              onChange={(event) => {
                const percent = Math.round(Number(event.target.value))
                if (percent >= 1 && percent <= 90) change({ dropAlertPercent: percent })
              }}
            />
            %
          </span>
        </label>
      </section>

      <section className="settings-section">
        <h3>Decks &amp; wishlists</h3>
        <div className="radio-options" role="radiogroup" aria-label="Owned copies">
          {COPIES_MODES.map((mode) => (
            <label key={mode.id} className="radio-option">
              <input type="radio" name="copies" checked={settings.copies === mode.id} onChange={() => change({ copies: mode.id })} />
              <span className="setting-text">
                <span className="setting-label">{mode.label}</span>
                <span className="muted small">{mode.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">Card images in lists and search</span>
            <span className="muted small">
              A small picture beside each card in decks, wishlists, the inventory and card search. Hovering a card still
              shows it large.
            </span>
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
            <span className="setting-label">Bundle basic lands</span>
            <span className="muted small">
              Counts every version of Plains, Island, Swamp, Mountain and Forest as one generic card, free of charge.
              Faster, since their versions aren't looked up. Your files keep their versions; turn this off to see them.
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
          Your decks, wishlists, inventory and trades, as plain text files. Settings and caches stay with Windows.
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
