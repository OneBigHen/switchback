import type { CoordinatePoint } from "./graphics-types"
import { normalizePoints, projectGeographicPoints } from "./graphics-math"
import styles from "./graphics.module.css"

export interface RouteThumbnailProps {
  /** Stored route polyline as `[longitude, latitude]` degrees. */
  points: ReadonlyArray<CoordinatePoint>
  label?: string
  className?: string
}

function pathFrom(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
}

export function RouteThumbnail({ points, label, className }: RouteThumbnailProps) {
  const normalized = normalizePoints(projectGeographicPoints(points), { width: 100, height: 72, padding: 7 })
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
        {/*
          A generic route-file glyph, never a drawn line. A placeholder curve
          here would read as this ride's shape, which is exactly the fact that
          is missing.
        */}
        <path
          className={styles.unavailableGlyph}
          d="M40 14h14l8 8v22H40zM54 14v8h8"
          strokeDasharray="4 3"
        />
        <text className={styles.unavailableText} x="50" y="62" textAnchor="middle">Route shape unavailable</text>
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
