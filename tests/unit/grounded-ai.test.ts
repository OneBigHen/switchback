import { describe, expect, it } from "vitest"

import { describeRouteGrounded, searchRoutesSpatialFirst } from "@/lib/ai/grounded"
import { parseStrictRideIntent } from "@/lib/ai/ride-intent"

describe("grounded AI boundaries", () => {
  it("describes supplied route facts and names unsupported facts", () => {
    const description = describeRouteGrounded({
      distanceMiles: 40,
      durationMinutes: 80,
      turnCount: 14,
      twistiness: 0.7,
      routingSource: "live",
      provider: "graphhopper",
      surfaceMix: { asphalt: 1 },
      roadMix: { tertiary: 1 },
      tollEvidence: { known: false, tollSharePercent: null },
      officialUnpavedEvidence: undefined
    })
    expect(description.summary).toContain("40.0 miles")
    expect(description.unsupported).toEqual(expect.arrayContaining(["toll exposure", "official surface legality"]))
  })

  it("filters spatially before lexical scoring", () => {
    const results = searchRoutesSpatialFirst([
      { id: "near", title: "River roads", center: [-75, 40], searchableText: "twisty" },
      { id: "far", title: "River roads", center: [-90, 45], searchableText: "twisty" }
    ], { query: "river", bounds: { minLon: -76, minLat: 39, maxLon: -74, maxLat: 41 } })
    expect(results.map((route) => route.id)).toEqual(["near"])
  })

  it("rejects non-schema model output", () => {
    expect(() => parseStrictRideIntent({ profile: "twisty" })).toThrow(/strict schema/i)
  })
})
