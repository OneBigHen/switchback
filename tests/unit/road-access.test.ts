import { describe, expect, it } from "vitest"
import {
  isActivelyClosed,
  isLegallyProhibitedForMotorcycle,
  isPavementLike,
  type RoadAccessSnapshot
} from "@/lib/roads/road-access"

function baseSnapshot(overrides: Partial<RoadAccessSnapshot> = {}): RoadAccessSnapshot {
  return {
    highwayClass: "secondary",
    motorcycleAccess: "yes",
    generalAccess: "yes",
    surface: "asphalt",
    smoothness: "good",
    tracktype: "unknown",
    maxweightTonnes: null,
    seasonalUndated: false,
    activeConditions: [],
    routable: true,
    ...overrides
  }
}

describe("road access", () => {
  it("blocks motorcycle=no regardless of rider lock intent", () => {
    const snapshot = baseSnapshot({ motorcycleAccess: "no" })
    expect(isLegallyProhibitedForMotorcycle(snapshot)).toBe(true)
  })

  it("blocks access=private when motorcycle access is unknown", () => {
    const snapshot = baseSnapshot({ motorcycleAccess: "unknown", generalAccess: "private" })
    expect(isLegallyProhibitedForMotorcycle(snapshot)).toBe(true)
  })

  it("allows pedestrian-only ways only when motorcycle=yes is explicit", () => {
    const snapshot = baseSnapshot({
      highwayClass: "pedestrian",
      motorcycleAccess: "unknown",
      generalAccess: "yes"
    })
    expect(isLegallyProhibitedForMotorcycle(snapshot)).toBe(true)
    const permitted = baseSnapshot({
      highwayClass: "pedestrian",
      motorcycleAccess: "designated"
    })
    expect(isLegallyProhibitedForMotorcycle(permitted)).toBe(false)
  })

  it("treats an open condition as not active and a closed condition as active", () => {
    const open = baseSnapshot({
      activeConditions: [{ sourceKey: "motorcycle:conditional", raw: "yes @ (May-Oct)", isOpen: true, reason: "Summer access" }]
    })
    const closed = baseSnapshot({
      activeConditions: [{ sourceKey: "motorcycle:conditional", raw: "no @ (Nov-Apr)", isOpen: false, reason: "Winter closure" }]
    })
    expect(isActivelyClosed(open)).toBe(false)
    expect(isActivelyClosed(closed)).toBe(true)
  })

  it("classifies pavement-like surfaces", () => {
    expect(isPavementLike("asphalt")).toBe(true)
    expect(isPavementLike("concrete")).toBe(true)
    expect(isPavementLike("paving_stones")).toBe(true)
    expect(isPavementLike("gravel")).toBe(false)
    expect(isPavementLike("dirt")).toBe(false)
    expect(isPavementLike("mud")).toBe(false)
    expect(isPavementLike("unknown")).toBe(false)
  })
})
