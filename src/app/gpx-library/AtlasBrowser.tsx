"use client"

import { RouteDiscoverySurface } from "@/components/route-library/RouteDiscoverySurface"
import type { QuickChipId } from "@/components/route-library/route-discovery-state"
import type { AtlasBrowseRoute } from "./atlas-browse"

/**
 * The GPX Library, list-first.
 *
 * Explore and this page are two entry points to one catalog, so the browsing
 * itself lives in `RouteDiscoverySurface`: same filter model, same cards, same
 * geographic previews. What differs here is the framing — this page names the
 * collection and states its size, because a rider who deep-linked into it has
 * no app shell around them to say where they are.
 *
 * It carries no breadcrumb of its own: the page renders the same primary
 * navigation as the rest of the app, and a second row of links back to Plan
 * and Saved would be the same two destinations twice.
 */

/** `Duration` and `Difficulty` are the catalog's own truthful dimensions. */
const LIBRARY_CHIPS: readonly QuickChipId[] = ["nearby", "gravel", "twisty", "filters"]

export interface AtlasBrowserProps {
  routes: readonly AtlasBrowseRoute[]
  regions: readonly string[]
  ridingAreas: readonly string[]
  routeCount: number
  totalMiles: number
  updatedLabel: string | null
}

export function AtlasBrowser({
  routes,
  regions,
  ridingAreas,
  routeCount,
  totalMiles,
  updatedLabel
}: AtlasBrowserProps) {
  return (
    <RouteDiscoverySurface
      routes={routes}
      regions={regions}
      ridingAreas={ridingAreas}
      routeCount={routeCount}
      totalMiles={totalMiles}
      updatedLabel={updatedLabel}
      title="GPX Library"
      searchPlaceholder="Search routes, locations, or keywords"
      defaultView="list"
      quickChips={LIBRARY_CHIPS}
      showCatalogSummary
    />
  )
}
