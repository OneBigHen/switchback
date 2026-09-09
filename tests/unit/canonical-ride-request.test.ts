import { describe, expect, it } from "vitest"
import {
  activeSegmentProfiles,
  buildCanonicalRideRequest,
  customSegmentProfiles,
  normalizedSegmentProfiles
} from "@/lib/planner/canonical-ride-request"
import type { RideIntent } from "@/lib/domain/ride-intent"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 40.3643, lon: -74.9513, label: "New Hope" }
const viaA = { lat: 40.30, lon: -76.70, label: "Shaping stop 1" }
const viaB = { lat: 40.32, lon: -76.50, label: "Shaping stop 2" }

function intent(overrides: Partial<RideIntent> = {}): RideIntent {
  return {
    start,
    finish,
    via: [],
    mode: "destination",
    targetMinutes: 120,
    timeShaped: false,
    profile: "balanced",
    bikeProfile: MOTORCYCLE_PROFILES[0]!,
    avoidHighways: false,
    tollPolicy: "allow-with-warning",
    avoidAreas: [],
    roadLocks: [],
    segmentProfiles: [],
    sketchCorridor: null,
    ...overrides
  }
}

/**
 * The request is the last place a rider's stated ride can quietly change into a
 * different one. These assertions are about that seam only: what the canonical
 * intent says is what the provider is asked for.
 */
describe("canonical ride request", () => {
  it("carries the rider's toll policy into the request, not a default", () => {
    const avoided = buildCanonicalRideRequest(intent({ tollPolicy: "avoid" }), { seed: 18 })
    const allowed = buildCanonicalRideRequest(intent({ tollPolicy: "allow-with-warning" }), { seed: 18 })

    expect(avoided.tollPolicy).toBe("avoid")
    expect(allowed.tollPolicy).toBe("allow-with-warning")
  })

  it("sends no per-leg styles for a ride the rider never varied", () => {
    const request = buildCanonicalRideRequest(
      intent({ via: [viaA, viaB], profile: "twisty", segmentProfiles: ["twisty", "twisty", "twisty"] }),
      { seed: 18 }
    )

    expect(request.segmentProfiles).toBeUndefined()
  })

  it("never sends more per-leg styles than the ride has legs", () => {
    // Three legs collapsed to one: the described legs stopped existing.
    const request = buildCanonicalRideRequest(
      intent({ via: [], profile: "balanced", segmentProfiles: ["twisty", "scenic", "gravel"] }),
      { seed: 18 }
    )

    expect(request.segmentProfiles).toEqual(["twisty"])
  })

  it("pads a widened topology with the ride's own style rather than repeating a leg", () => {
    const request = buildCanonicalRideRequest(
      intent({ via: [viaA, viaB], profile: "balanced", segmentProfiles: ["twisty"] }),
      { seed: 18 }
    )

    expect(request.segmentProfiles).toEqual(["twisty", "balanced", "balanced"])
  })

  it("keeps per-leg styles off a loop, which has no rider-authored legs", () => {
    const loop = intent({ mode: "loop", finish: null, segmentProfiles: ["twisty", "scenic"] })

    expect(customSegmentProfiles(loop)).toBeUndefined()
    expect(activeSegmentProfiles(loop)).toEqual([])
    expect(buildCanonicalRideRequest(loop, { seed: 18 }).segmentProfiles).toBeUndefined()
  })

  it("reports the deck's per-leg styles for the topology the ride actually has", () => {
    expect(activeSegmentProfiles(intent({ via: [viaA], profile: "scenic", segmentProfiles: [] })))
      .toEqual(["scenic", "scenic"])
    expect(normalizedSegmentProfiles(["twisty"], 3, "balanced")).toEqual(["twisty", "balanced", "balanced"])
    expect(normalizedSegmentProfiles(["twisty", "scenic"], 0, "balanced")).toEqual([])
  })

  it("shares one planning id across a lifecycle and a fresh one otherwise", () => {
    const pinned = buildCanonicalRideRequest(intent(), { seed: 18, planningId: "lifecycle-1" })
    expect(pinned.planningId).toBe("lifecycle-1")

    const first = buildCanonicalRideRequest(intent(), { seed: 18 })
    const second = buildCanonicalRideRequest(intent(), { seed: 18 })
    expect(first.planningId).not.toBe(second.planningId)
  })

  it("refuses to build a request for a ride that has no routable points", () => {
    expect(() => buildCanonicalRideRequest(intent({ start: null }), { seed: 18 })).toThrow()
  })

  it("carries the rider's drawn corridor only when they drew one", () => {
    const corridor: [number, number][] = [[-76.9, 40.2], [-76.8, 40.3]]

    expect(buildCanonicalRideRequest(intent({ sketchCorridor: corridor }), { seed: 18 }).sketchCorridor)
      .toEqual(corridor)
    expect(buildCanonicalRideRequest(intent(), { seed: 18 })).not.toHaveProperty("sketchCorridor")
  })
})
