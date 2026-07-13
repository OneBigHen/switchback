export type Coordinate = [longitude: number, latitude: number]

export type RouteProfileId = "quick" | "twisty" | "scenic" | "adventure"

export interface Waypoint {
  lat: number
  lon: number
  label?: string
}

export interface RouteRequest {
  profile: RouteProfileId
  points: Waypoint[]
}

export interface RouteInstruction {
  distanceMeters: number
  timeMilliseconds: number
  sign: number
  text: string
  streetName: string
  interval: [number, number]
}

export interface PlannedRoute {
  id: string
  name: string
  profile: RouteProfileId
  geometry: Coordinate[]
  waypoints: Waypoint[]
  instructions: RouteInstruction[]
  distanceMiles: number
  durationMinutes: number
  ascentMeters: number | null
  descentMeters: number | null
  twistiness: number
  turnCount: number
  roadMix: Record<string, number>
  surfaceMix: Record<string, number>
  routingSource: "live" | "imported" | "preview"
  previewOnly: boolean
  overlapPercent?: number
}
