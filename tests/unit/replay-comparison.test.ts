import { describe, expect, it } from "vitest"
import {
  buildReplaySegments,
  comparePlannedVsActual,
  DEFAULT_REPLAY_CONFIG,
  replayPercentOnTrack,
  replayDeviationSegments,
  replayGapSegments,
  type ReplayComparisonResult
} from "@/lib/client/replay-comparison"
import type { RecordedRide, RecordedRidePoint } from "@/lib/storage/ride-journal"
import type { PlannedRoute, Coordinate } from "@/lib/routing/types"

function makePlannedRoute(geometry: Coordinate[], distanceMiles = 10): PlannedRoute {
  return {
    id: "route-1",
    name: "Test route",
    geometry,
    distanceMiles,
    durationMinutes: 30,
    instructions: [],
    waypoints: [
      { lat: geometry[0]![1], lon: geometry[0]![0], label: "Start" },
      { lat: geometry.at(-1)![1], lon: geometry.at(-1)![0], label: "End" }
    ],
    profile: "twisty",
    routingSource: "imported",
    ascentMeters: null,
    descentMeters: null,
    twistiness: 0.5,
    turnCount: 3,
    roadMix: {},
    surfaceMix: {},
    avoidHighways: false,
    avoidAreas: [],
    previewOnly: false
  }
}

function makeRecordedRide(
  plannedRoute: PlannedRoute,
  points: RecordedRidePoint[],
  id = "ride-1"
): RecordedRide {
  return {
    id,
    routeId: plannedRoute.id,
    routeName: plannedRoute.name,
    route: plannedRoute,
    points,
    notes: "",
    photos: [],
    startedAt: points[0]?.recordedAt ?? "2026-07-19T12:00:00Z",
    endedAt: points.at(-1)?.recordedAt ?? "2026-07-19T12:30:00Z",
    createdAt: "2026-07-19T12:30:00Z",
    updatedAt: "2026-07-19T12:30:00Z"
  }
}

function pointAt(
  coordinate: Coordinate,
  recordedAt = "2026-07-19T12:00:00Z",
  speedMph = 30
): RecordedRidePoint {
  return { coordinate, recordedAt, speedMph }
}

function straightLineGeometry(count: number): Coordinate[] {
  return Array.from({ length: count }, (_, i) => [-76.5 + i * 0.01, 40.0 + i * 0.005])
}

describe("replay comparison", () => {
  it("returns empty segments when geometry is too short", () => {
    const planned = makePlannedRoute([[-76.5, 40.0]])
    const recorded = makeRecordedRide(planned, [
      pointAt([-76.5, 40.0]),
      pointAt([-76.51, 40.05])
    ])

    const segments = buildReplaySegments(
      planned.geometry,
      recorded.points,
      DEFAULT_REPLAY_CONFIG
    )

    expect(segments).toHaveLength(0)
  })

  it("returns empty segments when recorded points are too few", () => {
    const planned = makePlannedRoute(straightLineGeometry(20))
    const recorded = makeRecordedRide(planned, [
      pointAt([-76.5, 40.0]),
      pointAt([-76.51, 40.005])
    ])

    const segments = buildReplaySegments(
      planned.geometry,
      recorded.points,
      DEFAULT_REPLAY_CONFIG
    )

    expect(segments).toHaveLength(0)
  })

  it("detects all points as on-track when recorded follows planned exactly", () => {
    const geometry = straightLineGeometry(20)
    const planned = makePlannedRoute(geometry)
    const recorded = makeRecordedRide(
      planned,
      geometry.map((c, i) =>
        pointAt(c, `2026-07-19T12:${String(i).padStart(2, "0")}:00Z`)
      )
    )

    const result = comparePlannedVsActual(planned, recorded)

    expect(result.onTrackPercent).toBe(100)
    expect(result.segments.length).toBe(1)
    expect(result.segments[0]!.status).toBe("on-track")
  })

  it("detects deviating segments when rider drifts far from planned", () => {
    const geometry = straightLineGeometry(20)
    const planned = makePlannedRoute(geometry)

    const onTrack = geometry.slice(0, 5).map((c, i) =>
      pointAt(c, `2026-07-19T12:${String(i).padStart(2, "0")}:00Z`)
    )
    const deviation = [
      pointAt([-76.40, 40.10], "2026-07-19T12:05:00Z"),
      pointAt([-76.39, 40.15], "2026-07-19T12:05:30Z"),
      pointAt([-76.38, 40.20], "2026-07-19T12:06:00Z"),
      pointAt([-76.37, 40.25], "2026-07-19T12:06:30Z")
    ]

    const recorded = makeRecordedRide(planned, [...onTrack, ...deviation])

    const result = comparePlannedVsActual(planned, recorded)

    expect(result.onTrackPercent).toBeLessThan(100)
    const deviatingSegments = replayDeviationSegments(result)
    expect(deviatingSegments.length).toBeGreaterThan(0)
  })

  it("detects gaps when recorded has large time jumps", () => {
    const geometry = straightLineGeometry(20)
    const planned = makePlannedRoute(geometry)

    const firstSegment = geometry.slice(0, 5).map((c, i) =>
      pointAt(c, `2026-07-19T12:${String(i).padStart(2, "0")}:00Z`)
    )
    // 5-minute gap
    const secondSegment = geometry.slice(5, 10).map((c, i) =>
      pointAt(c, `2026-07-19T12:${String(i + 5 + 5).padStart(2, "0")}:00Z`)
    )

    const recorded = makeRecordedRide(planned, [...firstSegment, ...secondSegment])

    const result = comparePlannedVsActual(planned, recorded)

    const gaps = replayGapSegments(result)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0]!.status).toBe("gap")
  })

  it("includes privacy note in every result", () => {
    const geometry = straightLineGeometry(20)
    const planned = makePlannedRoute(geometry)
    const recorded = makeRecordedRide(
      planned,
      geometry.map((c, i) =>
        pointAt(c, `2026-07-19T12:${String(i).padStart(2, "0")}:00Z`)
      )
    )

    const result = comparePlannedVsActual(planned, recorded)

    expect(result.privacyNote).toContain("only on this device")
    expect(result.contractVersion).toBe(1)
  })

  it("replayPercentOnTrack returns the score", () => {
    const result: ReplayComparisonResult = {
      contractVersion: 1,
      plannedRouteId: "r1",
      rideId: "ride-1",
      plannedDistanceMiles: 10,
      recordedDistanceMiles: 10.2,
      plannedDurationMinutes: 30,
      recordedDurationMinutes: 32,
      onTrackPercent: 85.3,
      averageOffsetMeters: 15,
      maxOffsetMeters: 80,
      segments: [
        {
          status: "on-track",
          plannedStartIndex: 0,
          plannedEndIndex: 10,
          actualStartIndex: 0,
          actualEndIndex: 10,
          averageOffsetMeters: 10,
          maxOffsetMeters: 50
        },
        {
          status: "deviating",
          plannedStartIndex: 10,
          plannedEndIndex: 15,
          actualStartIndex: 10,
          actualEndIndex: 18,
          averageOffsetMeters: 200,
          maxOffsetMeters: 400
        }
      ],
      privacyNote: "privacy"
    }

    expect(replayPercentOnTrack(result)).toBe(85.3)
    expect(replayDeviationSegments(result)).toHaveLength(1)
    expect(replayGapSegments(result)).toHaveLength(0)
  })

  it("handles empty recorded rides gracefully", () => {
    const planned = makePlannedRoute(straightLineGeometry(20))
    const recorded = makeRecordedRide(planned, [])

    const result = comparePlannedVsActual(planned, recorded)

    expect(result.segments).toHaveLength(0)
    expect(result.onTrackPercent).toBe(0)
    expect(result.recordedDistanceMiles).toBe(0)
  })
})
