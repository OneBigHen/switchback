import styles from "./graphics.module.css"

export type SurfaceKind = "paved" | "gravel" | "dirt" | "unknown"

export interface SurfaceShare {
  kind: SurfaceKind
  percent: number
}

export interface SurfaceMixBarProps {
  shares: ReadonlyArray<SurfaceShare>
  label?: string
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "")
}

export function SurfaceMixBar({ shares, label = "Surface mix" }: SurfaceMixBarProps) {
  const valid = shares.filter((share) => Number.isFinite(share.percent) && share.percent > 0)
  const quantified = valid.reduce((sum, share) => sum + share.percent, 0)

  if (valid.length === 0 || !Number.isFinite(quantified) || quantified <= 0) {
    return <div className={styles.surfaceRoot} data-surface-state="unknown">No quantified surface evidence</div>
  }

  // Shares that do not account for the whole route leave a genuinely
  // unmeasured remainder. Scaling the supplied shares up to fill the bar would
  // draw missing evidence as certainty, so the remainder keeps its own segment
  // and the bar is only ever divided by the route's real total.
  const unmeasured = quantified < 100 ? 100 - quantified : 0
  const total = quantified + unmeasured

  return (
    <div className={styles.surfaceRoot} data-surface-state="ready">
      <div className={styles.surfaceTrack} role="img" aria-label={label}>
        {valid.map((share, index) => (
          <span
            key={`${share.kind}-${index}`}
            className={styles.surfaceSegment}
            data-surface-segment="true"
            data-surface-kind={share.kind}
            style={{ width: `${(share.percent / total) * 100}%` }}
          />
        ))}
        {unmeasured > 0 ? (
          <span
            className={styles.surfaceSegment}
            data-surface-segment="true"
            data-surface-kind="unknown"
            data-surface-unmeasured="true"
            style={{ width: `${(unmeasured / total) * 100}%` }}
          />
        ) : null}
      </div>
      <ul className={styles.surfaceLabels} aria-label={`${label} values`}>
        {valid.map((share, index) => (
          <li key={`${share.kind}-label-${index}`}>{formatPercent(share.percent)}% {share.kind}</li>
        ))}
        {unmeasured > 0 ? <li>{formatPercent(unmeasured)}% unmeasured</li> : null}
      </ul>
    </div>
  )
}
