"use client"

import { SpinnerGap, WarningCircle } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import type { AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import type { BrowseCatalog } from "@/app/gpx-library/load-catalog"
import { RouteDiscoverySurface } from "@/components/route-library/RouteDiscoverySurface"
import type { QuickChipId } from "@/components/route-library/route-discovery-state"
import styles from "./ExploreDestination.module.css"

/** The approved Explore chips. `Filters` opens everything else. */
const EXPLORE_CHIPS: readonly QuickChipId[] = ["nearby", "gravel", "twisty", "duration-2-4", "filters"]

const EMPTY: BrowseCatalog = {
  routes: [],
  regions: [],
  ridingAreas: [],
  routeCount: 0,
  totalMiles: 0,
  updatedLabel: null
}

/**
 * Explore: route discovery inside the app shell, map-first.
 *
 * The catalog arrives as browse rows — summary plus precomputed poster art —
 * exactly what `/gpx-library` renders server-side. No per-route geometry is
 * fetched to browse: the real lines on the map and in the previews are
 * recovered from that art.
 */
export function ExploreDestination() {
  const [catalog, setCatalog] = useState<BrowseCatalog>(EMPTY)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/route-catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Route catalog returned ${response.status}`)
        return response.json() as Promise<Partial<BrowseCatalog>>
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        setCatalog({
          routes: Array.isArray(payload.routes) ? payload.routes as AtlasBrowseRoute[] : [],
          regions: Array.isArray(payload.regions) ? payload.regions : [],
          ridingAreas: Array.isArray(payload.ridingAreas) ? payload.ridingAreas : [],
          routeCount: typeof payload.routeCount === "number" ? payload.routeCount : 0,
          totalMiles: typeof payload.totalMiles === "number" ? payload.totalMiles : 0,
          updatedLabel: typeof payload.updatedLabel === "string" ? payload.updatedLabel : null
        })
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return
        setStatus("error")
      })
    return () => controller.abort()
  }, [retryToken])

  if (status === "loading") {
    return (
      <section className={styles.destination} aria-label="Explore">
        <div className={styles.state} role="status" aria-live="polite">
          <SpinnerGap className="spin" aria-hidden="true" />
          <div><strong>Reading the collection</strong><span>Loading routes worth riding…</span></div>
        </div>
      </section>
    )
  }

  if (status === "error") {
    return (
      <section className={styles.destination} aria-label="Explore">
        <div className={styles.state} role="alert">
          <WarningCircle weight="fill" aria-hidden="true" />
          <div>
            <strong>Route collection unavailable</strong>
            <span>Your planner and saved rides are unaffected.</span>
          </div>
          <button type="button" onClick={() => {
            setStatus("loading")
            setRetryToken((token) => token + 1)
          }}>Try again</button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.destination} aria-label="Explore">
      <RouteDiscoverySurface
        routes={catalog.routes}
        regions={catalog.regions}
        ridingAreas={catalog.ridingAreas}
        routeCount={catalog.routeCount}
        totalMiles={catalog.totalMiles}
        updatedLabel={catalog.updatedLabel}
        title="Explore routes"
        searchPlaceholder="Search routes, places, or regions"
        defaultView="map"
        quickChips={EXPLORE_CHIPS}
        className={styles.surface}
      />
    </section>
  )
}
