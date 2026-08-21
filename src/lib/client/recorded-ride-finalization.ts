import { polylineDistanceMeters } from "@/lib/client/geo-math"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"
import type { PlannedRoute } from "@/lib/routing/types"

export interface RecordedRideFinalizationInput {
  points: RecordedRidePoint[]
  wasFreeRide: boolean
  selectedRoute: PlannedRoute | null
  now: Date
}

export function finalizeRecordedRide({
  points,
  wasFreeRide,
  selectedRoute,
  now
}: RecordedRideFinalizationInput): PlannedRoute {
  if (points.length < 2) throw new Error("Record at least two GPS points before finishing.")
  if (!wasFreeRide && selectedRoute) return selectedRoute

  const first = points[0]!.coordinate
  const last = points.at(-1)!.coordinate
  const durationMinutes = Math.max(0, (Date.parse(points.at(-1)!.recordedAt) - Date.parse(points[0]!.recordedAt)) / 60_000)

  return {
    id: `recording-${now.getTime()}`,
    name: `${wasFreeRide ? "Free Ride" : "Recorded ride"} · ${now.toLocaleDateString()}`,
    profile: wasFreeRide ? "neural" : "quick",
    geometry: points.map((point) => point.coordinate),
    waypoints: [
      { lat: first[1], lon: first[0], label: "Recording start" },
      { lat: last[1], lon: last[0], label: "Recording finish" }
    ],
    instructions: [],
    distanceMiles: polylineDistanceMeters(points.map((point) => point.coordinate)) / 1609.344,
    durationMinutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 0,
    turnCount: 0,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    previewOnly: false
  }
}
