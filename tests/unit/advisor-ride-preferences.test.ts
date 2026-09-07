import { describe, expect, it } from "vitest"
import {
  applyRidePreferenceEdits,
  preferencesFromRideIntent,
  type RidePreferenceVector
} from "@/lib/ai/ride-preferences"
import type { RideIntent } from "@/lib/ai/ride-intent"

const baseIntent: RideIntent = {
  mode: "loop",
  profile: "adventure",
  rideCharacter: "adventure",
  targetMinutes: 120,
  tollPolicy: "allow-with-warning",
  ambiguous: false,
  startQuery: null,
  destinationQuery: null,
  stopQuery: null,
  preferGravel: true,
  avoidHighways: true,
  summary: "120-minute adventure loop avoiding highways",
  source: "local"
}

const baseline: RidePreferenceVector = {
  twistiness: 0.6,
  scenery: 0.7,
  gravel: 0.65,
  technicality: 0.35,
  elevation: 0.5,
  highwayAversion: 0.9
}

describe("advisor ride preferences", () => {
  it("derives a stable preference vector from the existing coarse ride intent", () => {
    expect(preferencesFromRideIntent(baseIntent)).toEqual({
      twistiness: 0.65,
      scenery: 0.7,
      gravel: 0.7,
      technicality: 0.45,
      elevation: 0.5,
      highwayAversion: 1
    })
  })

  it("changes only axes the rider explicitly edits", () => {
    expect(applyRidePreferenceEdits(baseline, {
      twistiness: "more",
      gravel: "less"
    })).toEqual({
      ...baseline,
      twistiness: 0.75,
      gravel: 0.5
    })
  })

  it("supports strong edits and clamps normalized values", () => {
    expect(applyRidePreferenceEdits({
      ...baseline,
      twistiness: 0.9,
      gravel: 0.1
    }, {
      twistiness: "much-more",
      gravel: "much-less"
    })).toMatchObject({
      twistiness: 1,
      gravel: 0
    })
  })

  it("rejects unknown edit strengths rather than guessing", () => {
    expect(() => applyRidePreferenceEdits(
      baseline,
      { twistiness: "extreme" as never }
    )).toThrow("Unknown ride preference edit")
  })
})
