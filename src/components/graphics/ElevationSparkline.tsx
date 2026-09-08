import { normalizePoints } from "./graphics-math"
import styles from "./graphics.module.css"

export interface ElevationSample {
  distanceMiles: number
  elevationFeet: number
}

export interface ElevationSparklineProps {
  samples: ReadonlyArray<ElevationSample>
  label?: string
  className?: string
}

function pathFrom(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
}

export function ElevationSparkline({ samples, label, className }: ElevationSparklineProps) {
  const valid = samples
    .filter((sample) => Number.isFinite(sample.distanceMiles) && Number.isFinite(sample.elevationFeet))
    .slice()
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
  const normalized = normalizePoints(valid.map((sample) => [sample.distanceMiles, sample.elevationFeet] as const), {
    width: 100,
    height: 40,
    padding: 4
  })
  const labelled = Boolean(label?.trim())
  const classes = [styles.graphic, styles.sparkFrame, className].filter(Boolean).join(" ")

  return (
    <svg
      className={classes}
      viewBox="0 0 100 40"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      data-elevation-state={normalized.length >= 2 ? "ready" : "unavailable"}
    >
      {normalized.length >= 2 ? (
        <path className={styles.sparkLine} d={pathFrom(normalized)} data-elevation-line="true" />
      ) : (
        <>
          <path className={styles.sparkLine} d="M8 26 H92" strokeDasharray="3 5" />
          <text className={styles.unavailableText} x="50" y="37" textAnchor="middle">Elevation unavailable</text>
        </>
      )}
    </svg>
  )
}
