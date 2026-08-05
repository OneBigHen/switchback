/**
 * Provider-neutral contracts for first-class motorcycle routing.
 *
 * The existing application contracts in `lib/routing/types.ts` are kept
 * stable for the GraphHopper/Valhalla wire path. These contracts describe the
 * normalized product domain that provider adapters and future recommendation
 * code can share without leaking engine response shapes into the UI.
 */

export type Coordinate = [longitude: number, latitude: number]

export type RideProfile =
  | "quick"
  | "balanced"
  | "twisty"
  | "scenic"
  | "adventure"
  | "gravel"
  | "avoid-highways"
  | "neural"

export type DaylightState = "day" | "dawn" | "dusk" | "night"
export type Season = "winter" | "spring" | "summer" | "fall"
export type CapabilityStatus = "available" | "historical" | "degraded" | "unavailable"

export interface WeatherContext {
  condition?: "clear" | "cloudy" | "rain" | "snow" | "ice" | "unknown"
  precipitationProbability?: number
  temperatureCelsius?: number
  surfaceRisk?: "low" | "moderate" | "high" | "unknown"
}

export interface TrafficContext {
  status: CapabilityStatus
  congestionRatio?: number
  observedAt?: string
  incidentCount?: number
  closureCount?: number
}

export interface TemporalContext {
  departureTime: string
  timezone: string
  daylight: DaylightState
  weather?: WeatherContext
  traffic?: TrafficContext
  season?: Season
}

export interface RouteRequest {
  origin: Coordinate
  destination?: Coordinate
  via?: Coordinate[]
  loop?: {
    minutes?: number
    miles?: number
    directionBias?: number
  }
  profile: RideProfile
  avoid?: {
    highways?: boolean
    tolls?: boolean
    ferries?: boolean
    unpaved?: boolean
    cityCenters?: boolean
    heavyTraffic?: boolean
  }
  desired?: {
    twistiness?: number
    scenic?: number
    elevation?: number
    gravel?: number
    pace?: "relaxed" | "normal" | "spirited"
    maxDetourPct?: number
  }
  temporal?: TemporalContext
}

export type RoadAccess = "permitted" | "designated" | "discouraged" | "private" | "forbidden"
export type SeasonalAccess = "open" | "conditional" | "closed" | "unknown"

export interface RoadSegmentFeature {
  segmentId: string
  geometry: Coordinate[]
  roadClass?: string
  surface?: string
  smoothness?: string
  trackType?: string
  speedLimitKph?: number
  laneCount?: number
  curvature: number
  curveDensity: number
  curveSeverity: number
  headingChangePerKilometer: number
  elevationGainMeters?: number
  elevationLossMeters?: number
  elevationInterest: number
  scenicProxy: number
  proximityToWater?: number
  proximityToPark?: number
  proximityToMountain?: number
  trafficPenalty: number
  signalDensity: number
  stopDensity: number
  intersectionDensity?: number
  urbanDensityPenalty: number
  highwayPenalty: number
  incidentPenalty?: number
  gravelSuitability: number
  legalAccess: RoadAccess
  seasonalAccess: SeasonalAccess
  familiarity: number
  novelty: number
  dataConfidence: number
  safetyFlags: string[]
  distanceMeters: number
  /** Optional provider/profile-specific hard compatibility result. */
  profileCompatibility?: Partial<Record<RideProfile, "compatible" | "discouraged" | "incompatible">>
}

export type ManeuverKind =
  | "depart"
  | "continue"
  | "turn-left"
  | "turn-right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "u-turn"
  | "merge"
  | "roundabout"
  | "arrive"

export interface Maneuver {
  id: string
  kind: ManeuverKind
  coordinate: Coordinate
  distanceFromStartMeters: number
  distanceToNextMeters: number
  streetName?: string
  instruction: string
  laneGuidance?: string[]
  speedLimitKph?: number
}

export type RouteWarningCode =
  | "provider-degraded"
  | "traffic-unavailable"
  | "closure"
  | "private-access"
  | "low-confidence"
  | "excessive-detour"
  | "offline-only"
  | "unsafe-interaction"

export interface RouteWarning {
  code: RouteWarningCode
  message: string
  severity: "info" | "warning" | "blocking"
  segmentId?: string
}

export interface RouteScore {
  total: number
  fun: number
  twistiness: number
  scenic: number
  elevation: number
  gravel: number
  traffic: number
  simplicity: number
  safety: number
  novelty: number
  confidence: number
  preferenceFit: number
  etaPenalty: number
  explanations: string[]
  /** Kept as an alias for clients that use the shorter product wording. */
  explanation: string[]
}

export interface CandidateRoute {
  id: string
  provider: "graphhopper" | "valhalla" | "mapbox" | "google" | "here" | "synthetic"
  geometry: { type: "LineString"; coordinates: Coordinate[] }
  distanceMeters: number
  durationSeconds: number
  confidence: number
  maneuvers: Maneuver[]
  segments: RoadSegmentFeature[]
  score: RouteScore
  warnings: RouteWarning[]
}

export interface PlannedRoute {
  id: string
  request: RouteRequest
  candidate: CandidateRoute
  selectedAt?: string
  completedAt?: string
}

export interface RiderPreferenceModel {
  version: number
  profileWeights: {
    twistiness: number
    scenic: number
    gravel: number
    elevation: number
    novelty: number
    lowTraffic: number
    etaSensitivity: number
    simplicity: number
  }
  contextWeights: {
    daylightOnlyBias: number
    rainAvoidanceBias: number
    weekendLongRideBias: number
    weekdayDirectBias: number
  }
  learnedFromRideCount: number
  confidence: number
}

export type RideEventType =
  | "ride-started"
  | "ride-completed"
  | "ride-abandoned"
  | "suggestion-accepted"
  | "suggestion-ignored"
  | "suggestion-rejected"
  | "more-like-this"
  | "less-like-this"
  | "road-selected"
  | "road-avoided"

export interface RideEvent {
  id: string
  type: RideEventType
  at: string
  coordinate?: Coordinate
  routeId?: string
  suggestionId?: string
  segmentIds?: string[]
  context?: TemporalContext
  privateMode: boolean
}

export type FreeRideSuggestionKind =
  | "fun-road"
  | "scenic-detour"
  | "traffic-escape"
  | "overlook"
  | "stop"
  | "loop"

export interface FreeRideSuggestion {
  id: string
  kind: FreeRideSuggestionKind
  title: string
  actionLabel: string
  origin: Coordinate
  destination: Coordinate
  routeFragment: Coordinate[]
  triggerDistanceMeters: number
  addedDurationSeconds: number
  score: RouteScore
  reasons: string[]
  confidence: number
  expiresAt: string
}

export interface TrafficProvider {
  id: string
  capabilities: {
    traffic: CapabilityStatus
    incidents: CapabilityStatus
    closures: CapabilityStatus
    speedLimits: CapabilityStatus
    signalTiming: CapabilityStatus
  }
  corridorContext(request: RouteRequest): Promise<TrafficContext>
  warnings(request: RouteRequest): Promise<RouteWarning[]>
}

export interface SearchProvider {
  id: string
  search(query: string, near?: Coordinate): Promise<Array<{
    id: string
    label: string
    coordinate: Coordinate
    category?: string
  }>>
}

export interface MapMatchingProvider {
  id: string
  match(points: Array<{
    coordinate: Coordinate
    at: string
    headingDegrees?: number
    speedMetersPerSecond?: number
  }>): Promise<{
    coordinate: Coordinate
    segmentId?: string
    confidence: number
  }[]>
}

export interface OfflineRegionPack {
  id: string
  name: string
  version: string
  bounds: { west: number; south: number; east: number; north: number }
  sizeBytes: number
  features: Array<"tiles" | "roads" | "pois" | "route-graph" | "maneuvers">
  installedAt?: string
  updatedAt?: string
  checksum: string
  status: "available" | "downloading" | "installed" | "stale" | "failed"
}
