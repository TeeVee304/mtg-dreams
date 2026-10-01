import { getRefreshProgress, usePrintingsVersion } from '../printings'

/** A thin bar across the top while card versions are refreshed from Scryfall in the background. */
export function PriceProgress() {
  usePrintingsVersion()
  const progress = getRefreshProgress()
  if (!progress) return null
  const percent = Math.round((progress.done / progress.total) * 100)
  return (
    <div
      className="price-progress"
      role="progressbar"
      aria-label="Updating card data"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
    >
      <div className="price-progress-fill" style={{ width: `${percent}%` }} />
      <span className="price-progress-label">
        Updating card data {progress.done}/{progress.total}
      </span>
    </div>
  )
}
