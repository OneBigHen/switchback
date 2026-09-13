import type { RecordedRide, RecordedRidePoint } from "@/lib/storage/ride-journal"
import type { PlannedRoute } from "@/lib/routing/types"

/**
 * Test-only fixtures for the Recon presentation adapters. Production code
 * never imports this module.
 */

/** Fixed ride start so assertions never depend on the wall clock. */
export const TEST_RIDE_START_MS = Date.UTC(2026, 6, 4, 14, 0, 0)

export function makePlannedRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-test-1",
    name: "Bald Eagle Test Loop",
    profile: "balanced",
    geometry: [
      [-77.9, 40.75],
      [-77.5, 40.9],
      [-77.25, 41.1],
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 24,
    durationMinutes: 48,
    ascentMeters: 310,
    descentMeters: 280,
    twistiness: 0.42,
    turnCount: 17,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    ...overrides,
  }
}

export function makeRidePoint(
  coordinate: [number, number],
  recordedAt: string,
  extras: Partial<Omit<RecordedRidePoint, "coordinate" | "recordedAt">> = {}
): RecordedRidePoint {
  return { coordinate, recordedAt, speedMph: null, ...extras }
}

/** Three points marching north at 0.001° latitude steps, one minute apart. */
export function makeRecordedRidePoints(): RecordedRidePoint[] {
  return [
    makeRidePoint([0, 0], iso(TEST_RIDE_START_MS), { speedMph: 10, altitudeMeters: 100 }),
    makeRidePoint([0, 0.001], iso(TEST_RIDE_START_MS + 60_000), { speedMph: 20, altitudeMeters: 140 }),
    makeRidePoint([0, 0.002], iso(TEST_RIDE_START_MS + 120_000), { speedMph: 30, altitudeMeters: 120 }),
  ]
}

export function makeRecordedRide(overrides: Partial<RecordedRide> = {}): RecordedRide {
  const points = overrides.points ?? makeRecordedRidePoints()
  const first = points[0]!
  const last = points[points.length - 1]!
  return {
    id: "ride-test-1",
    routeId: "route-test-1",
    routeName: "Test Ride",
    route: makePlannedRoute(),
    points,
    notes: "",
    photos: [],
    startedAt: first.recordedAt,
    endedAt: last.recordedAt,
    createdAt: iso(TEST_RIDE_START_MS),
    updatedAt: iso(TEST_RIDE_START_MS),
    ...overrides,
  }
}

export function iso(ms: number): string {
  return new Date(ms).toISOString()
}

/** Recursively freezes a value so any mutation attempt fails the test. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}
