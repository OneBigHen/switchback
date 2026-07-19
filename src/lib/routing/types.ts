import type { PaUnpavedRoadEvidence } from "@/lib/roads/types"

export type Coordinate = [longitude: number, latitude: number]

export type RouteProfileId = "quick" | "twisty" | "scenic" | "adventure"

export interface Waypoint {
  lat: number
  lon: number
  label?: string
  locked?: boolean
}

export interface AvoidArea {
  id: string
  name?: string
  polygon: Coordinate[]
}

export interface RouteRequest {
  profile: RouteProfileId
  points: Waypoint[]
  avoidHighways?: boolean
  avoidAreas?: AvoidArea[]
  segmentProfiles?: RouteProfileId[]
  loopTargetMinutes?: number
  roundTrip?: {
    targetMinutes: number
    seed?: number
    heading?: number
  }
}

export interface RouteInstruction {
  distanceMeters: number
  timeMilliseconds: number
  sign: number
  text: string
  streetName: string
  interval: [number, number]
  speedLimitKmh?: number | null
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
  provider?: "graphhopper" | "valhalla"
  providerVersion?: string
  previewOnly: boolean
  overlapPercent?: number
  loopTargetMinutes?: number
  avoidHighways?: boolean
  avoidAreas?: AvoidArea[]
  segmentProfiles?: RouteProfileId[]
  officialUnpavedEvidence?: PaUnpavedRoadEvidence
}
