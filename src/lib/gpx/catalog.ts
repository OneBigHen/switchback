import type { RouteStory } from "@/lib/gpx/route-story"

export interface ProjectGpxRoutePreview {
  /** Precomputed atlas SVG path data in a 100x125 viewBox. */
  paths: string[]
  start?: readonly [number, number]
  end?: readonly [number, number]
  aspect?: number
}

export interface ProjectGpxRouteSummary {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  profile?: string
  /** Grounded deterministic rider-facing copy built from this route's own stats. */
  story?: RouteStory
  /** True when precomputed atlas art exists for this route. */
  art?: boolean
  /** Geometry-identical atlas re-import. The referenced route is the visual canonical. */
  duplicateOf?: string
  /** Optional lightweight shape requested by clients that actually render route cards. */
  preview?: ProjectGpxRoutePreview
  // Redacted from the public /api/gpx-library catalog (see handler.ts)
  // because they carry host filesystem paths; anonymous clients see them
  // as absent, not present-and-empty.
  sourceFile?: string
  sources?: string[]
  duplicateFamilyId?: string
  duplicateFamilySize?: number
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  mapMatchStatus?: "not-configured" | "matched" | "unmatched" | "failed" | "cancelled"
  matchPercent?: number | null
  unmatchedPercent?: number | null
  unmatchedSpanCount?: number
  dataConfidenceLevel?: "high" | "medium" | "low"
  /**
   * Real-world extent as `[west, south, east, north]` in degrees, echoed from
   * the atlas art so the Rides library can order imports by distance from the
   * rider without downloading every route's geometry. Absent when no poster art
   * exists for the route.
   */
  bbox?: readonly [number, number, number, number]
}

export interface ProjectGpxCatalog {
  generatedAt?: string
  scannedFiles?: number
  duplicateFiles?: number
  uniqueFiles?: number
  importedRoutes?: number
  rejectedFiles?: number
  duplicateFamilies?: number
  nearDuplicateFamilies?: number
  nearDuplicateRoutes?: number
  routes: ProjectGpxRouteSummary[]
}
