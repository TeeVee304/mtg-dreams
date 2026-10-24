import { useState } from 'react'
import type { AppSettings, Theme } from '@shared/api'
import { PRICE_BASES } from '@shared/pricing'
import { ui } from '@shared/text'
import { cleanError, formatDate } from '../lib/format'
import { updateSettings, useSettings } from '../stores/settings'
import { ColorOptions } from './Controls'
import { Modal } from './Modal'

/** Window modes, in the order offered; their names are `ui.settings.themes`. */
const THEMES: Theme[] = ['system', 'light', 'dark']

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
  const text = ui.settings

  const change = (patch: Partial<AppSettings>) => {
    setError(null)
    updateSettings(patch).catch((e) => setError(cleanError(e)))
  }

  return (
    <Modal title={text.title} onClose={onClose}>
      <section className="settings-section">
        <h3>{text.color}</h3>
        <ColorOptions value={settings.color} onChange={(color) => color && change({ color })} />
      </section>

      <section className="settings-section">
        <h3>{text.mode}</h3>
        <div className="theme-options" role="radiogroup" aria-label={text.mode}>
          {THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={settings.theme === theme}
              className={`theme-option theme-${theme}${settings.theme === theme ? ' selected' : ''}`}
              onClick={() => change({ theme })}
            >
              <span className="theme-swatch" aria-hidden="true" />
              <span className="theme-label">{text.themes[theme].label}</span>
              <span className="muted tiny">{text.themes[theme].hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>{text.prices}</h3>
        <div className="radio-options" role="radiogroup" aria-label={text.priceBasis}>
          {PRICE_BASES.map((basis) => (
            <label key={basis} className="radio-option">
              <input
                type="radio"
                name="price-basis"
                checked={settings.priceBasis === basis}
                onChange={() => change({ priceBasis: basis })}
              />
              <span className="setting-text">
                <span className="setting-label">{ui.priceBases[basis].label}</span>
                <span className="muted small">{ui.priceBases[basis].hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="muted tiny settings-note">
          {text.priceSource(pricedAt ? formatDate(pricedAt) : null)}{' '}
          <button
            type="button"
            className="link-btn"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true)
              void onRefreshPrices().finally(() => setRefreshing(false))
            }}
          >
            {refreshing ? text.checking : text.checkNow}
          </button>
          <br />
          {text.inventoryUsesTypical}
        </p>
        <div className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">{text.alerts}</span>
            <span className="muted small">{text.alertsHint}</span>
          </span>
          <span className="alert-fields">
            <span className="percent-field">
              {text.atLeast}
              <input
                type="number"
                min={1}
                max={90}
                step={1}
                value={settings.dropAlertPercent}
                aria-label={text.thresholdLabel}
                onChange={(event) => {
                  const percent = Math.round(Number(event.target.value))
                  if (percent >= 1 && percent <= 90) change({ dropAlertPercent: percent })
                }}
              />
              %
            </span>
            <span className="percent-field">
              <span className="move-down">{text.cheaper}</span> {text.by}
              <input
                type="number"
                min={0}
                max={100}
                step={0.05}
                value={settings.dropAlertMinEur}
                aria-label={text.dropLabel}
                onChange={(event) => {
                  const euros = Math.round(Number(event.target.value) * 100) / 100
                  if (euros >= 0 && euros <= 100) change({ dropAlertMinEur: euros })
                }}
              />
              €
            </span>
            <span className="percent-field">
              <span className="move-up">{text.pricier}</span> {text.by}
              <input
                type="number"
                min={0}
                max={100}
                step={0.05}
                value={settings.riseAlertMinEur}
                aria-label={text.riseLabel}
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
        <h3>{text.lists}</h3>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">{text.cardImages}</span>
            <span className="muted small">{text.cardImagesHint}</span>
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
            <span className="setting-label">{text.basics}</span>
            <span className="muted small">{text.basicsHint}</span>
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
        <h3>{text.copies}</h3>
        <label className="setting-toggle">
          <span className="setting-text">
            <span className="setting-label">{text.wishlistsReserve}</span>
            <span className="muted small">{text.wishlistsReserveHint}</span>
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
            <span className="setting-label">{text.plainBrews}</span>
            <span className="muted small">{text.plainBrewsHint}</span>
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
        <h3>{text.dataFolder}</h3>
        <p className="data-dir" title={dataDir}>
          {dataDir}
        </p>
        <div className="foot-row">
          <button type="button" onClick={onOpenDataDir}>
            {text.open}
          </button>
          <button type="button" onClick={onChangeDataDir}>
            {text.change}
          </button>
        </div>
        <p className="muted tiny settings-note">{text.dataFolderHint}</p>
      </section>
      {error && <p className="warn">{error}</p>}
      <p className="muted tiny settings-credits">{text.credits}</p>
    </Modal>
  )
}
