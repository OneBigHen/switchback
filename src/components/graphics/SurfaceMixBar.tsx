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
  const total = valid.reduce((sum, share) => sum + share.percent, 0)

  if (valid.length === 0 || !Number.isFinite(total) || total <= 0) {
    return <div className={styles.surfaceRoot} data-surface-state="unknown">No quantified surface evidence</div>
  }

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
      </div>
      <ul className={styles.surfaceLabels} aria-label={`${label} values`}>
        {valid.map((share, index) => (
          <li key={`${share.kind}-label-${index}`}>{formatPercent(share.percent)}% {share.kind}</li>
        ))}
      </ul>
    </div>
  )
}
