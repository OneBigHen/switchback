import styles from "./graphics.module.css"

export type MapStylePreviewVariant = "standard" | "terrain" | "satellite"

export interface MapStylePreviewProps {
  variant: MapStylePreviewVariant
  label?: string
  className?: string
}

export function MapStylePreview({ variant, label, className }: MapStylePreviewProps) {
  const labelled = Boolean(label?.trim())
  const classes = [styles.graphic, styles.mapPreview, className].filter(Boolean).join(" ")
  return (
    <svg
      className={classes}
      viewBox="0 0 96 64"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      data-map-style={variant}
    >
      <rect x="2" y="2" width="92" height="60" rx="8" fill="none" stroke="currentColor" strokeWidth="2" opacity=".45" />
      {variant === "standard" ? (
        <>
          <path d="M8 48C25 38 29 17 47 23s20 23 41 13" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M12 18h24M58 50h25M47 8v12" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
        </>
      ) : null}
      {variant === "terrain" ? (
        <>
          <path d="M8 48l18-24 12 13 13-18 31 29" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M10 53c14-12 28-9 41-18s26-8 36-18M10 43c17-12 27-7 39-15s25-8 36-15" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
        </>
      ) : null}
      {variant === "satellite" ? (
        <>
          <path d="M8 15l22-7 18 10 21-8 18 12-6 33-25-5-21 7-27-11Z" fill="currentColor" opacity=".11" />
          <path d="M8 15l22-7 18 10 21-8 18 12M30 8l5 49M48 18l8 32M69 10l12 45" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
          <path d="M11 50c19-7 27-24 40-18s18 19 35 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  )
}
