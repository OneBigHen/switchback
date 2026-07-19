import { describe, expect, it } from "vitest"
import { maneuverKind } from "@/lib/client/maneuver"

describe("GraphHopper maneuver signs", () => {
  it("maps sign codes to expanded maneuver kinds", () => {
    expect(maneuverKind(-2)).toBe("merge-left")
    expect(maneuverKind(2)).toBe("merge-right")
    expect(maneuverKind(6)).toBe("roundabout")
    expect(maneuverKind(-98)).toBe("sharp-left")
    expect(maneuverKind(4)).toBe("finish")
    expect(maneuverKind(0)).toBe("straight")
    expect(maneuverKind(-7)).toBe("slight-left")
    expect(maneuverKind(7)).toBe("slight-right")
    expect(maneuverKind(-3)).toBe("keep-left")
    expect(maneuverKind(3)).toBe("keep-right")
    expect(maneuverKind(-8)).toBe("left")
    expect(maneuverKind(8)).toBe("right")
    expect(maneuverKind(5)).toBe("arrive-via")
  })
})
