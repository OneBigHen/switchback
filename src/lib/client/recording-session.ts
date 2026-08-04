import type { RecordedRidePoint } from "@/lib/storage/ride-journal"

export type RecordingStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "paused"
  | "finished"
  | "denied"
  | "error"

export interface RecordingSessionState {
  status: RecordingStatus
  startedAt: number | null
  pausedAt: number | null
  pausedMillis: number
  endedAt: number | null
  points: RecordedRidePoint[]
  error: string | null
}

export type RecordingSessionSnapshot = Pick<
  RecordingSessionState,
  "status" | "startedAt" | "pausedAt" | "pausedMillis" | "endedAt" | "points"
>

export type RecordingSessionAction =
  | { type: "request_permission" }
  | { type: "ready" }
  | { type: "start"; at: number }
  | { type: "sample"; point: RecordedRidePoint }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "finish"; at: number }
  | { type: "recover"; snapshot: RecordingSessionSnapshot }
  | { type: "permission_denied"; message: string }
  | { type: "error"; message: string }
  | { type: "reset" }

export function createRecordingState(): RecordingSessionState {
  return {
    status: "idle",
    startedAt: null,
    pausedAt: null,
    pausedMillis: 0,
    endedAt: null,
    points: [],
    error: null
  }
}

export function recordingSessionReducer(
  state: RecordingSessionState,
  action: RecordingSessionAction
): RecordingSessionState {
  switch (action.type) {
    case "request_permission":
      return { ...state, status: "requesting", error: null }
    case "ready":
      return { ...state, status: "ready", error: null }
    case "start":
      return { ...createRecordingState(), status: "recording", startedAt: action.at }
    case "sample":
      return state.status === "recording"
        ? { ...state, points: [...state.points, action.point] }
        : state
    case "pause":
      return state.status === "recording"
        ? { ...state, status: "paused", pausedAt: action.at }
        : state
    case "resume":
      return state.status === "paused"
        ? {
            ...state,
            status: "recording",
            pausedAt: null,
            pausedMillis: state.pausedMillis + Math.max(0, action.at - (state.pausedAt ?? action.at))
          }
        : state
    case "finish":
      return state.status === "recording" || state.status === "paused"
        ? {
            ...state,
            status: "finished",
            endedAt: action.at,
            pausedMillis: state.pausedMillis + (state.status === "paused"
              ? Math.max(0, action.at - (state.pausedAt ?? action.at))
              : 0),
            pausedAt: null
          }
        : state
    case "recover": {
      const interrupted = action.snapshot.status === "recording"
      return {
        ...createRecordingState(),
        ...action.snapshot,
        status: interrupted ? "paused" : action.snapshot.status,
        pausedAt: interrupted ? Date.now() : action.snapshot.pausedAt,
        error: null
      }
    }
    case "permission_denied":
      return { ...state, status: "denied", error: action.message }
    case "error":
      return { ...state, status: "error", error: action.message }
    case "reset":
      return createRecordingState()
  }
}

export function activeRecordingMillis(state: RecordingSessionState, now: number): number {
  if (state.startedAt == null) return 0
  const end = state.endedAt ?? (state.pausedAt ?? now)
  return Math.max(0, end - state.startedAt - state.pausedMillis)
}

export interface RecordingTelemetry {
  distanceMiles: number
  elapsedMillis: number
  averageSpeedMph: number | null
  maxSpeedMph: number | null
  currentSpeedMph: number | null
  currentAltitudeMeters: number | null
  ascentMeters: number
  descentMeters: number
  headingDegrees: number | null
  accuracyMeters: number | null
}

const EARTH_RADIUS_METERS = 6_371_000

function radians(value: number): number {
  return value * Math.PI / 180
}

/** Distance in meters between two [lon, lat] coordinates (haversine). */
export function recordedSegmentMeters(
  from: [number, number],
  to: [number, number]
): number {
  const latitudeDelta = radians(to[1] - from[1])
  const longitudeDelta = radians(to[0] - from[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from[1])) * Math.cos(radians(to[1])) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

/**
 * Live telemetry for the recording HUD: distance, elevation gain/loss,
 * current/max/average speed, heading, and accuracy — all derived from the
 * captured GPS samples, so no extra tracking is needed.
 */
export function recordingTelemetry(
  state: RecordingSessionState,
  now: number
): RecordingTelemetry {
  const points = state.points
  const latest = points.at(-1) ?? null
  let distanceMeters = 0
  let ascentMeters = 0
  let descentMeters = 0
  let speedSum = 0
  let speedCount = 0
  let maxSpeedMph: number | null = null
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    distanceMeters += recordedSegmentMeters(previous.coordinate, current.coordinate)
    if (previous.altitudeMeters != null && current.altitudeMeters != null) {
      const delta = current.altitudeMeters - previous.altitudeMeters
      if (delta > 0) ascentMeters += delta
      else descentMeters += Math.abs(delta)
    }
  }
  // Speed aggregates every sample (including the first), unlike the
  // segment-based distance/elevation loops above.
  for (const point of points) {
    if (point.speedMph != null && point.speedMph > 0) {
      speedSum += point.speedMph
      speedCount += 1
      maxSpeedMph = maxSpeedMph == null ? point.speedMph : Math.max(maxSpeedMph, point.speedMph)
    }
  }
  return {
    distanceMiles: distanceMeters / 1609.344,
    elapsedMillis: activeRecordingMillis(state, now),
    averageSpeedMph: speedCount > 0 ? speedSum / speedCount : null,
    maxSpeedMph,
    currentSpeedMph: latest?.speedMph ?? null,
    currentAltitudeMeters: latest?.altitudeMeters ?? null,
    ascentMeters,
    descentMeters,
    headingDegrees: latest?.headingDegrees ?? null,
    accuracyMeters: latest?.accuracyMeters ?? null
  }
}
