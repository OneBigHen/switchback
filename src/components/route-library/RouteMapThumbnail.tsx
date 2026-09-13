"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  buildRoutePreviewSpec,
  mercatorY,
  padBoundingBox,
  type GeoBoundingBox,
  type RoutePreviewSize
} from "@/lib/routes/route-preview"
import type { Coordinate } from "@/lib/routing/types"
import { cachedRoutePreview, requestRoutePreview } from "./route-preview-renderer"
import styles from "./RouteMapThumbnail.module.css"

export interface RouteMapThumbnailProps {
  routeId: string
  /** Real-world route line in `[longitude, latitude]` degrees. */
  geometry: ReadonlyArray<Coordinate>
  bbox: GeoBoundingBox | null
  start?: Coordinate | null
  end?: Coordinate | null
  /** Distinguishes two routes that share a bbox but not a line. */
  fingerprint?: string | null
  size?: RoutePreviewSize
  /** Rider-facing area, shown on the fallback plate so "where" survives. */
  areaLabel?: string | null
  /** Accessible description of what this preview shows. */
  label: string
  className?: string
}

type PreviewState = "pending" | "map" | "unavailable"

/**
 * A geographic preview of one route.
 *
 * The rendered image comes from the single shared preview map, so a list of a
 * hundred cards costs one WebGL context and one render per unique route/size,
 * not one map per card.
 *
 * Until that image arrives — and permanently if the renderer cannot run — the
 * card shows the route's real line in true Mercator over a land wash with the
 * riding area named. That is deliberately *not* the old normalised silhouette:
 * the shape is in its real projection and the place is stated, so the card
 * never implies geography it does not have.
 */
export function RouteMapThumbnail({
  routeId,
  geometry,
  bbox,
  start = null,
  end = null,
  fingerprint = null,
  size = "small",
  areaLabel = null,
  label,
  className
}: RouteMapThumbnailProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const placeable = Boolean(bbox) && geometry.length >= 2

  const spec = useMemo(
    () => placeable
      ? buildRoutePreviewSpec({ routeId, bbox, size, styleId: "clean", geometryFingerprint: fingerprint })
      : null,
    [bbox, fingerprint, placeable, routeId, size]
  )

  // Rendered previews are keyed, so a card whose route changes can never paint
  // the previous route's map for a frame.
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null)
  const image = spec
    ? rendered?.key === spec.key ? rendered.url : cachedRoutePreview(spec.key)
    : null

  // Only previews the rider can actually see are worth rendering: scrolling a
  // long library must not queue a render for every row below the fold.
  useEffect(() => {
    const node = frameRef.current
    if (!node || typeof IntersectionObserver !== "function") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: "320px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!spec || !visible || cachedRoutePreview(spec.key)) return
    let cancelled = false
    const key = spec.key
    void requestRoutePreview({ spec, geometry, start, end }).then((result) => {
      if (!cancelled && result) setRendered({ key, url: result })
    })
    return () => {
      cancelled = true
    }
    // `geometry`/`start`/`end` are derived from the same art the spec key
    // fingerprints, so the key is the honest dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.key, visible])

  const state: PreviewState = !placeable ? "unavailable" : image ? "map" : "pending"

  return (
    <div
      ref={frameRef}
      className={[styles.frame, className].filter(Boolean).join(" ")}
      data-route-preview={state}
      data-route-id={routeId}
    >
      {placeable ? (
        <>
          <MercatorPlate geometry={geometry} bbox={bbox!} start={start} end={end} label={label} />
          {areaLabel ? <span className={styles.areaLabel}>{areaLabel}</span> : null}
          {/* The source is a data URL produced in-browser by the shared
              preview map, so there is nothing for an image optimizer to fetch
              or resize. `next/image` would only add a loader in front of bytes
              that are already local and already the right size. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image ? <img className={styles.image} src={image} alt={label} loading="lazy" decoding="async" /> : null}
        </>
      ) : (
        <span className={styles.unplaceable} role="img" aria-label={`${label} — location unknown`}>
          <strong>Location unknown</strong>
          <span>This import kept no geography to place the ride.</span>
        </span>
      )}
    </div>
  )
}

const PLATE = { width: 120, height: 120, padding: 9 }

/**
 * The route in its own Mercator projection, fitted to the same padded frame
 * the rendered map uses — so the fallback and the finished image agree about
 * where the line sits in the box.
 */
function MercatorPlate({
  geometry,
  bbox,
  start,
  end,
  label
}: {
  geometry: ReadonlyArray<Coordinate>
  bbox: GeoBoundingBox
  start: Coordinate | null
  end: Coordinate | null
  label: string
}) {
  const projected = useMemo(() => {
    const [west, south, east, north] = padBoundingBox(bbox)
    const spanX = east - west
    const spanY = mercatorY(north) - mercatorY(south)
    if (!(spanX > 0) || !(spanY > 0)) return null
    const boxWidth = PLATE.width - PLATE.padding * 2
    const boxHeight = PLATE.height - PLATE.padding * 2
    const scale = Math.min(boxWidth / spanX, boxHeight / spanY)
    const offsetX = PLATE.padding + (boxWidth - spanX * scale) / 2
    const offsetY = PLATE.padding + (boxHeight - spanY * scale) / 2
    const topMercator = mercatorY(north)
    const project = (point: Coordinate) => [
      offsetX + (point[0] - west) * scale,
      offsetY + (topMercator - mercatorY(point[1])) * scale
    ] as const
    return {
      d: geometry
        .map((point, index) => {
          const [x, y] = project(point)
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
        })
        .join(" "),
      start: start ? project(start) : null,
      end: end ? project(end) : null
    }
  }, [bbox, end, geometry, start])

  if (!projected) return <span className={styles.plate} aria-hidden="true" />

  return (
    <svg
      className={styles.plate}
      viewBox={`0 0 ${PLATE.width} ${PLATE.height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      <path className={styles.plateHalo} d={projected.d} />
      <path className={styles.plateLine} d={projected.d} data-route-line="true" />
      {projected.start ? <circle className={styles.plateStart} cx={projected.start[0]} cy={projected.start[1]} r="3" /> : null}
      {projected.end ? <circle className={styles.plateEnd} cx={projected.end[0]} cy={projected.end[1]} r="3" /> : null}
    </svg>
  )
}
