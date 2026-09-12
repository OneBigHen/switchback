export type TrafficEvidenceStatus = "available" | "degraded" | "unknown"

export type TrafficIncidentKind =
  | "accident"
  | "jam"
  | "closure"
  | "roadworks"
  | "weather"
  | "breakdown"
  | "hazard"
  | "other"

export interface TrafficRoutePoint {
  lat: number
  lon: number
}

export interface TrafficPointGeometry {
  type: "Point"
  coordinates: [number, number]
}

export interface TrafficLineStringGeometry {
  type: "LineString"
  coordinates: [number, number][]
}

export type TrafficIncidentGeometry = TrafficPointGeometry | TrafficLineStringGeometry

export interface TrafficIncidentEvidence {
  id: string
  kind: TrafficIncidentKind
  providerCategory: string
  magnitude: string | null
  description: string | null
  delaySeconds: number | null
  lengthMeters: number | null
  roadNumbers: string[]
  from: string | null
  to: string | null
  geometry: TrafficIncidentGeometry | null
}

export interface RouteTrafficEvidence {
  provider: "tomtom"
  status: TrafficEvidenceStatus
  observedAt: string
  totalDelaySeconds: number | null
  hasClosure: boolean
  incidents: TrafficIncidentEvidence[]
}
