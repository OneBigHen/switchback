import { describe, expect, it } from "vitest"
import { formatManeuverDistance } from "@/lib/settings/rider-units"

describe("rider distance units", () => {
  it("uses feet for short imperial maneuver distances", () => {
    expect(formatManeuverDistance(100, "imperial")).toBe("330 ft")
  })

  it("uses metric units when selected", () => {
    expect(formatManeuverDistance(100, "metric")).toBe("100 m")
    expect(formatManeuverDistance(1_250, "metric")).toBe("1.3 km")
  })
})
