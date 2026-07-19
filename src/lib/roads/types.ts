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
