import { describe, expect, it } from "vitest"
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter"
import { adaptCatalogRoute } from "@/features/recon/data/catalog-route-adapter"
import { polylineDistanceMeters } from "@/lib/client/geo-math"
import {
  deepFreeze,
  makePlannedRoute,
  makeRidePoint,
  makeRecordedRide,
  makeRecordedRidePoints,
  TEST_RIDE_START_MS,
} from "./fixtures/recon-fixtures"

describe("adaptRecordedRide", () => {
  it("adapts a timestamped ride as a recorded track with observed facts", () => {
    const ride = makeRecordedRide()
    const track = adaptRecordedRide(ride)

    expect(track).not.toBeNull()
    expect(track!.id).toBe("ride-test-1")
    expect(track!.name).toBe("Test Ride")
    expect(track!.sourceKind).toBe("recorded-ride")
    expect(track!.playbackKind).toBe("recorded")
    expect(track!.routeId).toBe("route-test-1")
    // 0.001° of latitude is ~111.19 m near the equator; the ride has two legs.
    expect(track!.distanceMeters).toBeCloseTo(222.39, 1)
    expect(track!.startedAt).toBe(TEST_RIDE_START_MS)
    expect(track!.endedAt).toBe(TEST_RIDE_START_MS + 120_000)
    expect(track!.points).toHaveLength(3)
    expect(track!.points[0]!.recordedAt).toBe(TEST_RIDE_START_MS)
    expect(track!.points[1]!.coordinate).toEqual([0, 0.001])
    expect(track!.points[1]!.speedMph).toBe(20)
    expect(track!.points[1]!.altitudeMeters).toBe(140)
  })

  it("derives duration, ascent and descent from observed values only", () => {
    const track = adaptRecordedRide(makeRecordedRide())!

    expect(track.facts.durationMinutes).toBe(2)
    expect(track.facts.ascentMeters).toBeCloseTo(40, 6)
    expect(track.facts.descentMeters).toBeCloseTo(20, 6)
  })

  it("keeps heading and accuracy passthrough fields", () => {
    const ride = makeRecordedRide({
      points: [
        makeRidePoint([0, 0], isoAt(0), { speedMph: 12, headingDegrees: 359, accuracyMeters: 4.5 }),
        makeRidePoint([0, 0.001], isoAt(60_000), { speedMph: 14, headingDegrees: 1, accuracyMeters: 6 }),
      ],
    })
    const track = adaptRecordedRide(ride)!

    expect(track.points[0]!.headingDegrees).toBe(359)
    expect(track.points[0]!.accuracyMeters).toBe(4.5)
    expect(track.points[1]!.headingDegrees).toBe(1)
  })

  it("reports unknown speed, altitude and heading as null, never zero", () => {
    const ride = makeRecordedRide({
      points: [
        makeRidePoint([0, 0], isoAt(0)),
        makeRidePoint([0, 0.001], isoAt(60_000)),
      ],
    })
    const track = adaptRecordedRide(ride)!

    expect(track.playbackKind).toBe("recorded")
    expect(track.points[0]!.speedMph).toBeNull()
    expect(track.points[0]!.altitudeMeters).toBeNull()
    expect(track.facts.ascentMeters).toBeNull()
    expect(track.facts.descentMeters).toBeNull()
  })

  it("normalizes non-finite scalar readings to unknown instead of carrying garbage", () => {
    const ride = makeRecordedRide({
      points: [
        makeRidePoint([0, 0], isoAt(0), { speedMph: Number.NaN, altitudeMeters: Number.POSITIVE_INFINITY }),
        makeRidePoint([0, 0.001], isoAt(60_000), { speedMph: 20, altitudeMeters: 140 }),
      ],
    })
    const track = adaptRecordedRide(ride)!

    expect(track).not.toBeNull()
    expect(track!.points[0]!.speedMph).toBeNull()
    expect(track!.points[0]!.altitudeMeters).toBeNull()
  })

  it("becomes a preview when no point carries a usable timestamp", () => {
    const ride = makeRecordedRide({
      points: makeRecordedRidePoints().map((point) => ({ ...point, recordedAt: "" })),
      startedAt: "",
      endedAt: "",
    })
    const track = adaptRecordedRide(ride)!

    expect(track.playbackKind).toBe("preview")
    expect(track.startedAt).toBeNull()
    expect(track.endedAt).toBeNull()
    expect(track.facts.durationMinutes).toBeNull()
    expect(track.points.every((point) => point.recordedAt === null)).toBe(true)
  })

  it("rejects a ride with mixed present and missing timestamps", () => {
    const ride = makeRecordedRide({
      points: [
        makeRidePoint([0, 0], isoAt(0), { speedMph: 10 }),
        makeRidePoint([0, 0.001], "", { speedMph: 20 }),
        makeRidePoint([0, 0.002], isoAt(120_000), { speedMph: 30 }),
      ],
    })

    expect(adaptRecordedRide(ride)).toBeNull()
  })

  it("rejects an impossible timestamp sequence instead of sorting it", () => {
    const ride = makeRecordedRide({
      points: [
        makeRidePoint([0, 0], isoAt(120_000), { speedMph: 10 }),
        makeRidePoint([0, 0.001], isoAt(60_000), { speedMph: 20 }),
        makeRidePoint([0, 0.002], isoAt(0), { speedMph: 30 }),
      ],
    })

    expect(adaptRecordedRide(ride)).toBeNull()
  })

  it("rejects invalid geometry closed: too few points, NaN, out-of-range", () => {
    const onePoint = makeRecordedRide({
      points: [makeRidePoint([0, 0], isoAt(0), { speedMph: 10 })],
    })
    const nanCoordinate = makeRecordedRide({
      points: [
        makeRidePoint([Number.NaN, 0], isoAt(0), { speedMph: 10 }),
        makeRidePoint([0, 0.001], isoAt(60_000), { speedMph: 20 }),
      ],
    })
    const outOfRange = makeRecordedRide({
      points: [
        makeRidePoint([0, 95], isoAt(0), { speedMph: 10 }),
        makeRidePoint([0, 95.001], isoAt(60_000), { speedMph: 20 }),
      ],
    })

    expect(adaptRecordedRide(onePoint)).toBeNull()
    expect(adaptRecordedRide(nanCoordinate)).toBeNull()
    expect(adaptRecordedRide(outOfRange)).toBeNull()
  })

  it("never mutates the source ride", () => {
    const ride = deepFreeze(makeRecordedRide())
    const before = structuredClone(ride)

    const track = adaptRecordedRide(ride)

    expect(track).not.toBeNull()
    expect(ride).toEqual(before)
  })
})

describe("adaptCatalogRoute", () => {
  it("adapts a catalog route as a preview with no observed time or speed", () => {
    const route = makePlannedRoute()
    const track = adaptCatalogRoute(route)!

    expect(track.sourceKind).toBe("catalog-route")
    expect(track.playbackKind).toBe("preview")
    expect(track.id).toBe("catalog:route-test-1")
    expect(track.routeId).toBe("route-test-1")
    expect(track.name).toBe("Bald Eagle Test Loop")
    expect(track.startedAt).toBeNull()
    expect(track.endedAt).toBeNull()
    expect(track.facts.durationMinutes).toBeNull()
    expect(track.points.every((point) => point.recordedAt === null)).toBe(true)
    expect(track.points.every((point) => point.speedMph === null)).toBe(true)
    expect(track.points).toHaveLength(3)
    expect(track.distanceMeters).toBeCloseTo(polylineDistanceMeters(route.geometry), 6)
  })

  it("reuses the route's own ascent and descent facts, including unknown", () => {
    const known = adaptCatalogRoute(makePlannedRoute())!
    expect(known.facts.ascentMeters).toBe(310)
    expect(known.facts.descentMeters).toBe(280)

    const unknown = adaptCatalogRoute(makePlannedRoute({ ascentMeters: null, descentMeters: null }))!
    expect(unknown.facts.ascentMeters).toBeNull()
    expect(unknown.facts.descentMeters).toBeNull()
  })

  it("carries no surface or match claims in phase 0", () => {
    const track = adaptCatalogRoute(makePlannedRoute())!

    expect(track.facts.surfaceKnown).toBe(false)
    expect(track.facts.matchPercent).toBeNull()
    expect(track.facts.confidence).toBeNull()
  })

  it("rejects invalid catalog geometry", () => {
    expect(adaptCatalogRoute(makePlannedRoute({ geometry: [[-77.9, 40.75]] }))).toBeNull()
    expect(
      adaptCatalogRoute(
        makePlannedRoute({
          geometry: [
            [-77.9, 40.75],
            [-77.5, Number.NaN],
          ],
        })
      )
    ).toBeNull()
  })

  it("never mutates the source route", () => {
    const route = deepFreeze(makePlannedRoute())
    const before = structuredClone(route)

    const track = adaptCatalogRoute(route)

    expect(track).not.toBeNull()
    expect(route).toEqual(before)
  })
})

function isoAt(offsetMs: number): string {
  return new Date(TEST_RIDE_START_MS + offsetMs).toISOString()
}
