import { describe, expect, it } from "vitest"
import { createGraphHopperRequest } from "@/lib/routing/graphhopper"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { createGpxRoadLock, createManualRoadLock } from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

const accessibleSnapshot: RoadAccessSnapshot = {
  highwayClass: "secondary",
  motorcycleAccess: "yes",
  generalAccess: "yes",
  surface: "asphalt",
  smoothness: "good",
  tracktype: "unknown",
  maxweightTonnes: null,
  seasonalUndated: false,
  activeConditions: [],
  routable: true
}

// Maryland coordinates — not in any REGION_POLICY_OVERLAYS — so the only
// custom_model entries come from locks/bike profile rather than region rules.
const baltimore = { lat: 39.29, lon: -76.61, label: "Baltimore" }
const bethesda = { lat: 38.98, lon: -77.04, label: "Bethesda" }

const lockLine: Coordinate[] = [
  [-76.61, 39.29],
  [-76.62, 39.30]
]

function mustLock(displayName?: string) {
  return createManualRoadLock({
    mode: "must",
    displayName,
    edgeIds: ["edge-must-1"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot: accessibleSnapshot,
    sourceRegionId: "maryland",
    sourceGraphVersion: "gh-11-1"
  })
}

function preferLock(displayName?: string) {
  return createGpxRoadLock({
    mode: "prefer",
    displayName,
    edgeIds: ["edge-prefer-1", "edge-prefer-2"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot: accessibleSnapshot,
    sourceRegionId: "maryland",
    sourceGraphVersion: "gh-11-1"
  })
}

function findPriority(body: Record<string, unknown>): Array<{ if?: string; multiply_by?: string }> {
  const customModel = body.custom_model as { priority?: Array<{ if?: string; multiply_by?: string }> } | undefined
  return customModel?.priority ?? []
}

function findAreaFeature(body: Record<string, unknown>, id: string) {
  const customModel = body.custom_model as {
    areas?: { features: Array<{ id: string; geometry: { coordinates: number[][][] } }> }
  } | undefined
  return customModel?.areas?.features.find((f) => f.id === id)
}

describe("GraphHopper road lock translation", () => {
  it("zeros out edges outside a must-use corridor via custom_model.priority", () => {
    const lock = mustLock()
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [lock]
    })

    const priority = findPriority(body)
    expect(priority).toContainEqual({
      if: "!in_switchback_lock_0",
      multiply_by: "0"
    })
  })

  it("prefers a corridor by penalizing edges outside it with a legal multiplier", () => {
    const lock = preferLock()
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [lock]
    })

    const priority = findPriority(body)
    expect(priority).toContainEqual({
      if: "!in_switchback_lock_0",
      multiply_by: "0.625"
    })
  })

  it("emits lock corridor polygons as GraphHopper area features", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock(), preferLock()]
    })

    expect(findAreaFeature(body, "switchback_lock_0")).toBeDefined()
    expect(findAreaFeature(body, "switchback_lock_1")).toBeDefined()
  })

  it("orders must rules before prefer rules when both tiers are present", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock(), preferLock()]
    })

    const priority = findPriority(body)
    const mustIndex = priority.findIndex((rule) => rule.if === "!in_switchback_lock_0")
    const preferIndex = priority.findIndex((rule) => rule.if === "!in_switchback_lock_1")
    expect(mustIndex).toBeGreaterThanOrEqual(0)
    expect(preferIndex).toBeGreaterThan(mustIndex)
  })

  it("preserves the lock corridor polygon ring even when the source geometry is unclosed", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock()]
    })

    const feature = findAreaFeature(body, "switchback_lock_0")
    expect(feature).toBeDefined()
    const ring = feature!.geometry.coordinates[0]!
    expect(ring.length).toBeGreaterThanOrEqual(4)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it("skips a lock whose LineString collapses to a single point with no length", () => {
    const collapsed: Coordinate[] = [[-76.61, 39.29], [-76.61, 39.29]]
    const lock = createManualRoadLock({
      mode: "must",
      edgeIds: ["e1"],
      geometry: collapsed,
      orderedAnchors: [collapsed[0]!, collapsed[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "maryland",
      sourceGraphVersion: "gh-11-1"
    })

    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [lock]
    })

    expect(findAreaFeature(body, "switchback_lock_0")).toBeUndefined()
    expect(findPriority(body)).not.toContainEqual({ if: "!in_switchback_lock_0", multiply_by: "0" })
  })

  it("emits bike-profile surface/smoothness/tracktype exclusions for a street bike", () => {
    const street = MOTORCYCLE_PROFILES.find((p) => p.category === "street")!
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      bikeProfile: { ...street }
    })
    const priority = findPriority(body)
    expect(priority.some((rule) => rule.multiply_by === "0" && rule.if?.includes("surface =="))).toBe(true)
    expect(priority.some((rule) => rule.multiply_by === "0" && rule.if?.includes("smoothness =="))).toBe(true)
    expect(priority.some((rule) => rule.multiply_by === "0" && rule.if?.includes("track_type =="))).toBe(true)
    expect(priority.some((rule) => rule.if === "road_class == PATH")).toBe(true)
  })

  it("keeps dual-sport bikes permissive by emitting only the impassable smoothness floor", () => {
    const dual = MOTORCYCLE_PROFILES.find((p) => p.category === "dual-sport")!
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      bikeProfile: { ...dual }
    })
    const priority = findPriority(body)
    const smoothnessRules = priority.filter((rule) => rule.if?.includes("smoothness ==") && rule.multiply_by === "0")
    expect(smoothnessRules).toHaveLength(1)
    expect(smoothnessRules[0]!.if).toContain("IMPASSABLE")
    expect(priority.some((rule) => rule.if?.includes("track_type =="))).toBe(false)
    expect(priority.some((rule) => rule.if === "road_class == PATH")).toBe(false)
  })

  it("combines must locks, prefer locks, and bike profile rules into one custom_model", () => {
    const street = MOTORCYCLE_PROFILES.find((p) => p.category === "street")!
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock(), preferLock()],
      bikeProfile: { ...street }
    })
    const priority = findPriority(body)
    expect(priority).toContainEqual({ if: "!in_switchback_lock_0", multiply_by: "0" })
    expect(priority).toContainEqual({ if: "!in_switchback_lock_1", multiply_by: "0.625" })
    expect(priority.some((rule) => rule.if === "road_class == PATH" && rule.multiply_by === "0")).toBe(true)
  })
})
