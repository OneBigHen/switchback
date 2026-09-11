import { describe, expect, it } from "vitest"
import {
  activeSegmentProfiles,
  buildCanonicalRideRequest,
  customSegmentProfiles,
  normalizedSegmentProfiles
} from "@/lib/planner/canonical-ride-request"
import { defaultRideIntent, type RideIntent } from "@/lib/domain/ride-intent"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 40.3643, lon: -74.9513, label: "New Hope" }
const viaA = { lat: 40.30, lon: -76.70, label: "Shaping stop 1" }
const viaB = { lat: 40.32, lon: -76.50, label: "Shaping stop 2" }

function intent(overrides: Partial<RideIntent> = {}): RideIntent {
  return {
    ...defaultRideIntent(),
    start,
    finish,
    profile: "balanced",
    bikeProfile: MOTORCYCLE_PROFILES[0]!,
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

    expect(activeSegmentProfiles(loop)).toEqual([])
    expect(customSegmentProfiles(loop)).toBeUndefined()
  })

  it("normalizes segment profiles deterministically", () => {
    expect(normalizedSegmentProfiles(["twisty"], 3, "balanced")).toEqual(["twisty", "balanced", "balanced"])
    expect(normalizedSegmentProfiles(["twisty", "scenic", "gravel"], 1, "balanced")).toEqual(["twisty"])
  })
})
