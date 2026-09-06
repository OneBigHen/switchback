/**
 * Lowest map zoom the official unpaved-road query will serve.
 *
 * Shared by the client gate, the layer catalog, and the API handler so a
 * zoomed-out view says "zoom in" instead of firing a request the server is
 * always going to reject and painting the overlay as broken.
 */
export const PA_UNPAVED_ROADS_MIN_ZOOM = 9

/** Provider/version label for the historic unpaved-road surface survey. */
export const PA_UNPAVED_ROADS_PROVENANCE = "PA DEP/PASDA — Unpaved Roads 2009_07"

/**
 * The one wording for what the survey does and does not establish. Shared by the
 * advisor briefing and the advisor toolbox so a single safety-truth boundary is
 * never phrased two ways.
 */
export const PA_UNPAVED_ROADS_SURFACE_BOUNDARY =
  `${PA_UNPAVED_ROADS_PROVENANCE} is historic surveyed/mapped unpaved surface evidence only; it does not establish ` +
  "legal access, public access, current openness, passability, maintenance, closures, or other current conditions"

export interface PaUnpavedRoadBounds {
  south: number
  west: number
  north: number
  east: number
}

export interface PaUnpavedRoadQuery {
  bounds: PaUnpavedRoadBounds
  limit: number
}

export interface PaUnpavedRoadCorridorQuery {
  paths: GeoJsonPosition[][]
  bufferMeters?: number
  limit?: number
}

export type GeoJsonPosition = [number, number]

export type PaUnpavedRoadGeometry =
  | { type: "LineString"; coordinates: GeoJsonPosition[] }
  | { type: "MultiLineString"; coordinates: GeoJsonPosition[][] }

export interface PaUnpavedRoadProperties {
  id: string
  county: string | null
  lengthMeters: number | null
  source: "Pennsylvania Department of Environmental Protection"
  dataset: "Unpaved Roads 2009_07"
}

export interface PaUnpavedRoadFeature {
  type: "Feature"
  id: string
  geometry: PaUnpavedRoadGeometry
  properties: PaUnpavedRoadProperties
}

export interface PaUnpavedRoadFeatureCollection {
  type: "FeatureCollection"
  features: PaUnpavedRoadFeature[]
  metadata?: {
    count: number
    limit: number
    truncated: boolean
    source: "Pennsylvania Department of Environmental Protection"
    dataset: "Unpaved Roads 2009_07"
  }
}

export interface PaUnpavedRoadEvidence {
  source: "Pennsylvania Department of Environmental Protection"
  dataset: "Unpaved Roads 2009_07"
  matchedMeters: number
  sharePercent: number
  matchedFeatureCount: number
  matchRadiusMeters: number
  minimumContiguousMeters: number
}
