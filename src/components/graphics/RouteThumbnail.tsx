import type { CoordinatePoint } from "./graphics-types"
import { normalizePoints } from "./graphics-math"
import styles from "./graphics.module.css"

export interface RouteThumbnailProps {
  points: ReadonlyArray<CoordinatePoint>
  label?: string
  className?: string
}

function pathFrom(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
}

export function RouteThumbnail({ points, label, className }: RouteThumbnailProps) {
  const normalized = normalizePoints(points, { width: 100, height: 72, padding: 7 })
  const labelled = Boolean(label?.trim())
  const classes = [styles.graphic, styles.routeFrame, className].filter(Boolean).join(" ")

  if (normalized.length < 2) {
    return (
      <svg
        className={classes}
        viewBox="0 0 100 72"
        role={labelled ? "img" : undefined}
        aria-label={labelled ? label : undefined}
        aria-hidden={labelled ? undefined : "true"}
        focusable="false"
        data-route-thumbnail="unavailable"
      >
        <path className={styles.routeHalo} d="M18 42 C34 22 54 52 81 30" />
        <path className={styles.routeLine} d="M18 42 C34 22 54 52 81 30" strokeDasharray="3 5" />
        <text className={styles.unavailableText} x="50" y="64" textAnchor="middle">Route shape unavailable</text>
      </svg>
    )
  }

  const d = pathFrom(normalized)
  const start = normalized[0]!
  const finish = normalized[normalized.length - 1]!

  return (
    <svg
      className={classes}
      viewBox="0 0 100 72"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      data-route-thumbnail="ready"
    >
      <path className={styles.routeHalo} d={d} />
      <path className={styles.routeLine} d={d} data-route-line="true" />
      <circle className={styles.routeStart} cx={start.x} cy={start.y} r="3" data-route-start="true" />
      <circle className={styles.routeFinish} cx={finish.x} cy={finish.y} r="3.2" data-route-finish="true" />
    </svg>
  )
}
