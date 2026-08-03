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

describe("region policy reference data", () => {
  it("exposes overlays for PA, WV, NJ, and NY as documentation", () => {
    expect(getRegionPolicyOverlay("pennsylvania")?.regionId).toBe("pennsylvania")
    expect(getRegionPolicyOverlay("west-virginia")?.regionId).toBe("west-virginia")
    expect(getRegionPolicyOverlay("new-jersey")?.regionId).toBe("new-jersey")
    expect(getRegionPolicyOverlay("new-york")?.regionId).toBe("new-york")
    expect(REGION_POLICY_OVERLAYS).toHaveLength(4)
  })

  it("never injects degenerate region overlay rules or (0,0) areas at request time", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster]
    })
    const priority = findPriority(body)
    const features = findAreaFeatures(body)

    // Phase 3: region tuning lives in persistent profile models; request-time
    // `in_switchback_region_*` rules referencing (0,0) polygons are gone.
    expect(priority.some((rule) => rule.if?.startsWith("in_switchback_region_"))).toBe(false)
    expect(features.some((feature) => feature.id.startsWith("switchback_region_"))).toBe(false)
    expect(JSON.stringify(body)).not.toContain("switchback_region_")
    expect(JSON.stringify(body)).not.toContain("[[0,0],[0,0]")
  })

  it("merges must lock, prefer lock, bike profile, and highway-avoidance rules without losing precedence", () => {
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
    const preferIdx = priority.findIndex((rule) => rule.if === "!in_switchback_lock_1")
    const bikePathIdx = priority.findIndex((rule) => rule.if === "road_class == PATH")

    expect(highwayIdx).toBeGreaterThanOrEqual(0)
    expect(mustIdx).toBeGreaterThan(highwayIdx)
    expect(preferIdx).toBeGreaterThan(mustIdx)
    expect(bikePathIdx).toBeGreaterThan(preferIdx)
  })

  it("retains rider avoid areas and lock corridors as the only custom-model areas", () => {
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
    const ids = findAreaFeatures(body).map((feature) => feature.id)
    expect(ids).toContain("switchback_avoid_0")
    expect(ids).toContain("switchback_lock_0")
    expect(ids.some((id) => id.startsWith("switchback_region_"))).toBe(false)
  })

  it("keeps a must-use lock rule even when no region overlay applies", () => {
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
  })

  it("emits a request-time zero-priority toll rule only when tolls are explicitly avoided", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster],
      tollPolicy: "avoid"
    })
    const priority = findPriority(body)
    expect(priority.some((rule) => rule.if === "toll == YES" && rule.multiply_by === "0")).toBe(true)

    const allowed = createGraphHopperRequest({
      profile: "twisty",
      points: [harrisburg, lancaster],
      tollPolicy: "allow-with-warning"
    })
    expect(findPriority(allowed).some((rule) => rule.if === "toll == YES")).toBe(false)
  })
})
