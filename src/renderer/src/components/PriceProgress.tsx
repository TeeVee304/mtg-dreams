import { getRefreshProgress, usePrintingsVersion } from '../stores/printings'
import { ui } from '@shared/text'

/** Top progress bar for background printings refreshes ({@link getRefreshProgress}). */
export function PriceProgress() {
  usePrintingsVersion()
  const progress = getRefreshProgress()
  if (!progress) return null
  const percent = Math.round((progress.done / progress.total) * 100)
  return (
    <div
      className="price-progress"
      role="progressbar"
      aria-label={ui.common.updatingCardData}
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
    >
      <div className="price-progress-fill" style={{ width: `${percent}%` }} />
      <span className="price-progress-label">
        {ui.common.updatingCardData} {progress.done}/{progress.total}
      </span>
    </div>
  )
}
