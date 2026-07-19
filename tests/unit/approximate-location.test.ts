import { describe, expect, it } from "vitest"
import { approximateCurrentLocation } from "@/lib/client/approximate-location"

describe("approximate planner location", () => {
  it("rounds an allowed browser GPS point to a coarse, non-persisted map start", () => {
    expect(approximateCurrentLocation(40.3752676, -75.0115386)).toEqual({
      lat: 40.38,
      lon: -75.01,
      label: "Approximate current location"
    })
  })

  it("does not turn malformed browser coordinates into a route start", () => {
    expect(approximateCurrentLocation(Number.NaN, -75)).toBeNull()
    expect(approximateCurrentLocation(91, -75)).toBeNull()
  })
})
