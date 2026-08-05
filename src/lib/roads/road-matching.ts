import type { Coordinate } from "@/lib/routing/types"

/**
 * Result of graph-matching two anchor points onto the live routing graph
 * (SB-013). Unlike a manual tap, this carries real edge ids and the actual
 * routed geometry between the anchors, so a road requirement can be honored
 * and validated instead of being a straight-line placeholder.
 */

export interface RoadMatchAccessEvidence {
  motorcycle: "permitted" | "unknown"
  toll: boolean
  surface: string | null
}

export interface RoadMatchResult {
  displayName: string | null
  edgeIds: string[]
  geometry: Coordinate[]
  entry: Coordinate
  exit: Coordinate
  streetNames: string[]
  access: RoadMatchAccessEvidence
  graphVersion: string
  match: {
    status: "exact-edge" | "unresolved"
    confidence: number
    maximumDriftMeters: number
  }
}

export interface RoadMatchRequestInput {
  start: { lat: number; lon: number; label?: string }
  end: { lat: number; lon: number; label?: string }
  profile: string
  bikeProfile?: { category: string; allowMaintainedGravel: boolean; allowRoughTracks: boolean; avoidUnknownSurface: boolean }
  avoidHighways?: boolean
}

type DetailInterval = [number, number, unknown]

/**
 * Build a MatchedRoadRequirement-shaped result from a GraphHopper /route
 * payload. The route must have been requested with `edge_id`, `street_name`,
 * `road_class`, `surface`, and `toll` details.
 */
export function roadMatchFromGraphHopperPayload(
  payload: {
    paths?: Array<{
      points?: { coordinates?: [number, number][] }
      details?: Record<string, DetailInterval[]>
    }>
    info?: { version?: string }
  },
  entry: Coordinate,
  exit: Coordinate
): RoadMatchResult | null {
  const path = payload.paths?.[0]
  const geometry = path?.points?.coordinates
  if (!path || !geometry || geometry.length < 2) return null

  const edgeIds = (path.details?.edge_id ?? [])
    .map((interval) => interval[2])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
  const streetNames = (path.details?.street_name ?? [])
    .map((interval) => interval[2])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
  const toll = (path.details?.toll ?? []).some((interval) => interval[2] !== "NO" && interval[2] !== "HGV")
  const surfaces = (path.details?.surface ?? [])
    .map((interval) => interval[2])
    .filter((value): value is string => typeof value === "string")
  const surface = surfaces.length > 0 ? surfaces[0]! : null

  return {
    displayName: streetNames.length > 0 ? streetNames[0]! : null,
    edgeIds: [...new Set(edgeIds)],
    geometry,
    entry,
    exit,
    streetNames: [...new Set(streetNames)],
    access: {
      // A successful GraphHopper motorcycle route already proved legal access
      // for this profile; the detail itself carries no access flag.
      motorcycle: "permitted",
      toll,
      surface
    },
    graphVersion: payload.info?.version ?? "unknown",
    match: {
      status: edgeIds.length > 0 ? "exact-edge" : "unresolved",
      confidence: edgeIds.length > 0 ? 1 : 0,
      // The matched geometry is the router's own line; drift is measured at
      // the anchors when the caller validates them against a corridor.
      maximumDriftMeters: 0
    }
  }
}
