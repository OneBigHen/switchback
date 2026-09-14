import { describe, expect, it } from "vitest"
import type { Coordinate } from "@/lib/routing/types"
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter"
import { classifyExploration, priorRecordedRides } from "@/features/recon/intel/exploration"
import { buildXRay, shareNear } from "@/features/recon/intel/xray"
import type { ReconTrack } from "@/features/recon/types"
import { deepFreeze, iso, makeRecordedRide, makeRidePoint, TEST_RIDE_START_MS } from "./fixtures/recon-fixtures"

const DAY = 86_400_000

/** A straight ride north along a meridian: ~111 m per 0.001°, one fix per 10 s. */
function rideAlong(id: string, coordinates: Coordinate[], startMs: number): ReconTrack {
  const points = coordinates.map((coordinate, index) => makeRidePoint(coordinate, iso(startMs + index * 10_000), { speedMph: 25 }))
  return adaptRecordedRide(makeRecordedRide({ id, points, startedAt: points[0]!.recordedAt, endedAt: points[points.length - 1]!.recordedAt }))!
}

function line(fromLat: number, toLat: number, lng = -77.5, steps = 40): Coordinate[] {
  return Array.from({ length: steps + 1 }, (_, index) => [lng, fromLat + ((toLat - fromLat) * index) / steps] as Coordinate)
}

describe("new-to-you truth rules", () => {
  const selected = rideAlong("today", line(40.8, 40.84), TEST_RIDE_START_MS)

  it("is 100% new to you with no prior history", () => {
    const result = classifyExploration(selected, [])
    expect(result.newToYouMeters).toBeCloseTo(selected.distanceMeters, 3)
    expect(result.previouslyRiddenMeters).toBe(0)
    expect(result.segments).toEqual([{ fromMeters: 0, toMeters: selected.distanceMeters, status: "new-to-you" }])
  })

  it("is ~0% new to you against identical history", () => {
    const earlier = rideAlong("earlier", line(40.8, 40.84), TEST_RIDE_START_MS - DAY)
    const result = classifyExploration(selected, [earlier])
    expect(result.newToYouMeters / selected.distanceMeters).toBeLessThan(0.02)
  })

  it("counts a reverse-direction historic ride as previously ridden", () => {
    const reversed = rideAlong("reversed", line(40.84, 40.8), TEST_RIDE_START_MS - DAY)
    const result = classifyExploration(selected, [reversed])
    expect(result.previouslyRiddenMeters / selected.distanceMeters).toBeGreaterThan(0.98)
  })

  it("does not count a separate parallel road outside tolerance", () => {
    // ~85 m east at this latitude: a different road, not GPS drift.
    const parallel = rideAlong("parallel", line(40.8, 40.84, -77.499), TEST_RIDE_START_MS - DAY)
    const result = classifyExploration(selected, [parallel])
    expect(result.newToYouMeters).toBeCloseTo(selected.distanceMeters, 3)
  })

  it("splits a ride that overlaps history for only part of its length", () => {
    const half = rideAlong("half", line(40.8, 40.82, -77.5, 20), TEST_RIDE_START_MS - DAY)
    const result = classifyExploration(selected, [half])
    expect(result.segments.map((segment) => segment.status)).toEqual(["previously-ridden", "new-to-you"])
    expect(result.previouslyRiddenMeters / selected.distanceMeters).toBeGreaterThan(0.45)
    expect(result.previouslyRiddenMeters / selected.distanceMeters).toBeLessThan(0.55)
  })

  it("never paints history across a GPS gap", () => {
    // Earlier ride lost signal between its two ends; the gap is not a road.
    const gappy = rideAlong("gappy", [...line(40.8, 40.801, -77.5, 2), ...line(40.839, 40.84, -77.5, 2)], TEST_RIDE_START_MS - DAY)
    const result = classifyExploration(selected, [gappy])
    expect(result.newToYouMeters / selected.distanceMeters).toBeGreaterThan(0.9)
  })

  it("only compares against rides that finished before this one started", () => {
    const later = rideAlong("later", line(40.8, 40.84), TEST_RIDE_START_MS + DAY)
    const earlier = rideAlong("earlier", line(40.8, 40.84), TEST_RIDE_START_MS - DAY)
    expect(priorRecordedRides(selected, [selected, later, earlier]).map((ride) => ride.id)).toEqual(["earlier"])
  })

  it("leaves source geometry unchanged", () => {
    const frozen = deepFreeze(rideAlong("frozen", line(40.8, 40.84), TEST_RIDE_START_MS))
    const history = deepFreeze(rideAlong("history", line(40.84, 40.8), TEST_RIDE_START_MS - DAY))
    expect(() => classifyExploration(frozen, [history])).not.toThrow()
  })
})

describe("X-Ray facts", () => {
  it("reports on-plan share only against the planned geometry", () => {
    const ride = line(40.8, 40.84)
    expect(shareNear(ride, ride, 60)).toBe(100)
    expect(shareNear(ride, line(40.8, 40.84, -77.49), 60)).toBe(0)
  })

  it("matches a planned route drawn with long, sparse segments", () => {
    // Planned routes can be a handful of vertices kilometers apart, diagonal.
    const planned: Coordinate[] = [
      [-77.6, 40.7],
      [-77.5, 40.85],
      [-77.3, 40.9]
    ]
    const ride: Coordinate[] = []
    for (let index = 1; index < planned.length; index += 1) {
      const [a, b] = [planned[index - 1]!, planned[index]!]
      for (let step = 0; step < 400; step += 1) ride.push([a[0] + ((b[0] - a[0]) * step) / 400, a[1] + ((b[1] - a[1]) * step) / 400])
    }
    expect(shareNear(ride, planned, 60)).toBe(100)
  })

  it("keeps unknown elevation and speed unknown instead of zero", () => {
    const points = line(40.8, 40.84).map((coordinate, index) => makeRidePoint(coordinate, iso(TEST_RIDE_START_MS + index * 10_000)))
    const track = adaptRecordedRide(makeRecordedRide({ points, startedAt: points[0]!.recordedAt, endedAt: points[points.length - 1]!.recordedAt }))!
    const report = buildXRay(track, null)!
    expect(report.altitudeRange).toBeNull()
    expect(report.bins.every((bin) => bin.altitudeMeters === null)).toBe(true)
    expect(report.summary.speedSource).toBe("timestamps")
    expect(report.summary.knownGravelMeters).toBeNull()
  })

  it("places photo moments on the ride by their timestamp", () => {
    const coordinates = line(40.8, 40.84)
    const points = coordinates.map((coordinate, index) => makeRidePoint(coordinate, iso(TEST_RIDE_START_MS + index * 10_000)))
    const track = adaptRecordedRide(
      makeRecordedRide({
        points,
        startedAt: points[0]!.recordedAt,
        endedAt: points[points.length - 1]!.recordedAt,
        photos: [
          { id: "halfway", caption: "Overlook", takenAt: iso(TEST_RIDE_START_MS + 200_000) },
          { id: "after", caption: "At home", takenAt: iso(TEST_RIDE_START_MS + 10 * DAY) }
        ]
      })
    )!
    const report = buildXRay(track, null)!
    expect(report.moments.map((moment) => moment.id)).toEqual(["halfway"])
    expect(report.moments[0]!.atMeters / track.distanceMeters).toBeCloseTo(0.5, 2)
  })
})
