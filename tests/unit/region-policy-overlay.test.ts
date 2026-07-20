import { describe, expect, it } from "vitest"
import {
  REGION_POLICY_OVERLAYS,
  getRegionPolicyOverlay
} from "@/lib/routing/region-policy"
import { createGraphHopperRequest } from "@/lib/routing/graphhopper"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { createManualRoadLock } from "@/lib/roads/road-locks"
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

const harrisburg = { lat: 40.27, lon: -76.88 }
const lancaster = { lat: 40.04, lon: -76.30 }

function findPriority(body: Record<string, unknown>): Array<{ if?: string; multiply_by?: string }> {
  const customModel = body.custom_model as { priority?: Array<{ if?: string; multiply_by?: string }> } | undefined
  return customModel?.priority ?? []
}

function findAreaFeatures(body: Record<string, unknown>) {
  const customModel = body.custom_model as {
    areas?: { features: Array<{ id: string }> }
  } | undefined
  return customModel?.areas?.features ?? []
}

describe("region policy overlay", () => {
  it("exposes overlays for PA, WV, NJ, and NY", () => {
    expect(getRegionPolicyOverlay("pennsylvania")?.regionId).toBe("pennsylvania")
    expect(getRegionPolicyOverlay("west-virginia")?.regionId).toBe("west-virginia")
    expect(getRegionPolicyOverlay("new-jersey")?.regionId).toBe("new-jersey")
    expect(getRegionPolicyOverlay("new-york")?.regionId).toBe("new-york")
    expect(REGION_POLICY_OVERLAYS).toHaveLength(4)
  })

  it("emits region overlay priority rules when waypoints fall inside PA", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster]
    })
    const priority = findPriority(body)
    expect(priority.some((rule) => rule.if?.startsWith("in_switchback_region_") && rule.if?.includes("SECONDARY"))).toBe(true)
    expect(priority.some((rule) => rule.if?.startsWith("in_switchback_region_") && rule.if?.includes("TERTIARY"))).toBe(true)
    expect(priority.some((rule) => rule.if?.startsWith("in_switchback_region_") && rule.if?.includes("TRACK"))).toBe(true)
  })

  it("does not emit region overlay priority rules when waypoints fall outside every overlay region", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [
        { lat: 39.29, lon: -76.61 }, // Baltimore — in MD catalog but no overlay
        { lat: 39.20, lon: -76.86 }
      ]
    })
    const priority = findPriority(body)
    expect(priority.some((rule) => rule.if?.startsWith("in_switchback_region_"))).toBe(false)
  })

  it("merges must lock rules, prefer lock rules, bike profile rules, avoid highways, and region overlays without losing precedence", () => {
    const lockLine: Coordinate[] = [
      [-76.7, 40.1],
      [-76.6, 40.12]
    ]
    const mustLock = createManualRoadLock({
      mode: "must",
      displayName: "Ridge",
      edgeIds: ["e-must"],
      geometry: lockLine,
      orderedAnchors: [lockLine[0]!, lockLine[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "pennsylvania",
      sourceGraphVersion: "gh-11-1"
    })
    const preferLock = createManualRoadLock({
      mode: "prefer",
      displayName: "Stream",
      edgeIds: ["e-prefer"],
      geometry: lockLine,
      orderedAnchors: [lockLine[0]!, lockLine[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "pennsylvania",
      sourceGraphVersion: "gh-11-1"
    })
    const street = MOTORCYCLE_PROFILES.find((p) => p.category === "street")!

    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster],
      avoidHighways: true,
      roadLocks: [mustLock, preferLock],
      bikeProfile: { ...street }
    })
    const priority = findPriority(body)

    const highwayIdx = priority.findIndex((rule) => rule.if === "road_class == MOTORWAY || road_class == TRUNK")
    const mustIdx = priority.findIndex((rule) => rule.if === "!in_switchback_lock_0")
    const preferIdx = priority.findIndex((rule) => rule.if === "in_switchback_lock_1")
    const bikePathIdx = priority.findIndex((rule) => rule.if === "road_class == PATH")
    const regionIdx = priority.findIndex((rule) => rule.if?.startsWith("in_switchback_region_"))

    expect(highwayIdx).toBeGreaterThanOrEqual(0)
    expect(mustIdx).toBeGreaterThan(highwayIdx)
    expect(preferIdx).toBeGreaterThan(mustIdx)
    expect(bikePathIdx).toBeGreaterThan(preferIdx)
    expect(regionIdx).toBeGreaterThan(bikePathIdx)
  })

  it("retains avoid areas in the custom model areas alongside lock corridors and region features", () => {
    const lockLine: Coordinate[] = [
      [-76.7, 40.1],
      [-76.6, 40.12]
    ]
    const mustLock = createManualRoadLock({
      mode: "must",
      edgeIds: ["e1"],
      geometry: lockLine,
      orderedAnchors: [lockLine[0]!, lockLine[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "pennsylvania",
      sourceGraphVersion: "gh-11-1"
    })

    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster],
      avoidAreas: [{
        id: "closed-bridge",
        name: "Bridge closure",
        polygon: [
          [-76.82, 40.2],
          [-76.80, 40.2],
          [-76.80, 40.22],
          [-76.82, 40.22]
        ]
      }],
      roadLocks: [mustLock]
    })
    const features = findAreaFeatures(body)
    const ids = features.map((f) => f.id)
    expect(ids).toContain("switchback_avoid_0")
    expect(ids).toContain("switchback_lock_0")
    expect(ids.some((id) => id.startsWith("switchback_region_"))).toBe(true)
  })

  it("multiplies PA secondary road priority rather than zeroing it out", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster]
    })
    const priority = findPriority(body)
    const secondaryRule = priority.find((rule) => rule.if?.startsWith("in_switchback_region_") && rule.if?.includes("SECONDARY"))
    expect(secondaryRule).toBeDefined()
    const multiplier = Number(secondaryRule!.multiply_by)
    expect(multiplier).toBeGreaterThan(1.0)
  })

  it("does not silently drop a lock when both a must lock and a region overlay apply to the same request", () => {
    const lockLine: Coordinate[] = [
      [-76.7, 40.1],
      [-76.6, 40.12]
    ]
    const mustLock = createManualRoadLock({
      mode: "must",
      edgeIds: ["e-must"],
      geometry: lockLine,
      orderedAnchors: [lockLine[0]!, lockLine[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "pennsylvania",
      sourceGraphVersion: "gh-11-1"
    })

    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster],
      roadLocks: [mustLock]
    })
    const priority = findPriority(body)
    expect(priority.some((rule) => rule.if === "!in_switchback_lock_0")).toBe(true)
    expect(priority.some((rule) => rule.if?.startsWith("in_switchback_region_"))).toBe(true)
  })
})
