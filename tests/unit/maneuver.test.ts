import { describe, expect, it } from "vitest"
import { maneuverKind } from "@/lib/client/maneuver"

describe("GraphHopper maneuver signs", () => {
  it("does not render left turns, roundabouts, u-turns, or arrival as straight", () => {
    expect(maneuverKind(-2)).toBe("left")
    expect(maneuverKind(2)).toBe("right")
    expect(maneuverKind(6)).toBe("roundabout")
    expect(maneuverKind(-98)).toBe("uturn-left")
    expect(maneuverKind(4)).toBe("finish")
    expect(maneuverKind(0)).toBe("straight")
  })
})
