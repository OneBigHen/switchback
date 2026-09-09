import type { ProjectGpxRoutePreview } from "@/lib/gpx/catalog"
import styles from "./graphics.module.css"

export interface AtlasRouteThumbnailProps {
  preview: ProjectGpxRoutePreview
  label?: string
  className?: string
}

/** Render precomputed route geometry only; no scenic or procedural placeholder art. */
export function AtlasRouteThumbnail({ preview, label, className }: AtlasRouteThumbnailProps) {
  const labelled = Boolean(label?.trim())
  const classes = [styles.graphic, styles.routeFrame, className].filter(Boolean).join(" ")

  return (
    <svg
      className={classes}
      viewBox="0 0 100 125"
      preserveAspectRatio="xMidYMid meet"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      data-testid="route-preview-ready"
    >
      {preview.paths.map((d, index) => (
        <g key={`${index}:${d.slice(0, 16)}`}>
          <path className={styles.routeHalo} d={d} />
          <path className={styles.routeLine} d={d} data-route-line="true" />
        </g>
      ))}
      {preview.start ? (
        <circle className={styles.routeStart} cx={preview.start[0]} cy={preview.start[1]} r="2.5" data-route-start="true" />
      ) : null}
      {preview.end ? (
        <circle className={styles.routeFinish} cx={preview.end[0]} cy={preview.end[1]} r="2.7" data-route-finish="true" />
      ) : null}
    </svg>
  )
}
