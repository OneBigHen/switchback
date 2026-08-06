import { describe, expect, it, afterEach } from "vitest"
import { createGraphHopperRequest, expandMustLockWaypoints } from "@/lib/routing/graphhopper"
import { featureFlags } from "@/lib/domain/feature-flags"
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
  afterEach(() => {
    featureFlags.roadRequirements = true
  })

  it("excludes every road lock from the provider model while the flag is off", () => {
    featureFlags.roadRequirements = false
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock(), preferLock()]
    })

    const priority = findPriority(body)
    expect(priority.some((rule) => rule.if?.includes("switchback_lock"))).toBe(false)
    expect(findAreaFeature(body, "switchback_lock_0")).toBeUndefined()
    expect(findAreaFeature(body, "switchback_lock_1")).toBeUndefined()
  })

  it("emits bounded inside-corridor rewards when the flag is enabled and locks carry graph edges", () => {
    featureFlags.roadRequirements = true
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock(), preferLock()]
    })

    const priority = findPriority(body)
    // SB-014/015: the corridor is a bounded reward, never a global outside zero.
    expect(priority).toContainEqual({ if: "in_switchback_lock_0", multiply_by: "1.8" })
    expect(priority).toContainEqual({ if: "in_switchback_lock_1", multiply_by: "1.6" })
    expect(findAreaFeature(body, "switchback_lock_0")).toBeDefined()
    expect(findAreaFeature(body, "switchback_lock_1")).toBeDefined()
    const mustIndex = priority.findIndex((rule) => rule.if === "in_switchback_lock_0")
    const preferIndex = priority.findIndex((rule) => rule.if === "in_switchback_lock_1")
    expect(mustIndex).toBeGreaterThanOrEqual(0)
    expect(preferIndex).toBeGreaterThan(mustIndex)
  })

  it("expands must-lock entry/exit anchors into ordered wire via-waypoints (SB-014)", () => {
    featureFlags.roadRequirements = true
    const request = {
      profile: "twisty" as const,
      points: [baltimore, bethesda],
      roadLocks: [mustLock("PA-125")]
    }
    const expanded = expandMustLockWaypoints(request)

    // start → must entry → must exit → finish, in lock order
    expect(expanded.points.map((point) => point.label)).toEqual([
      "Baltimore",
      "Must-use PA-125: entry",
      "Must-use PA-125: exit",
      "Bethesda"
    ])
    expect(expanded.wireToOriginal).toEqual([0, -1, -1, 1])

    // The injected anchors map back to -1 so the parsed route drops them.
    const wirePoints = expanded.points.map((point) => [point.lon, point.lat] as Coordinate)
    expect(wirePoints.length).toBe(4)
    expect(expanded.wireToOriginal).toContain(-1)
  })

  it("does not expand wire waypoints while the flag is off", () => {
    featureFlags.roadRequirements = false
    const request = {
      profile: "twisty" as const,
      points: [baltimore, bethesda],
      roadLocks: [mustLock("PA-125")]
    }
    const expanded = expandMustLockWaypoints(request)
    expect(expanded.points.map((point) => point.label)).toEqual(["Baltimore", "Bethesda"])
    expect(expanded.wireToOriginal).toEqual([0, 1])
  })

  it("keeps a manual lock without graph edge ids out of the provider model even when enabled", () => {
    featureFlags.roadRequirements = true
    const placeholder = createManualRoadLock({
      mode: "must",
      edgeIds: [], // browser cannot snap yet; empty is the placeholder state
      geometry: lockLine,
      orderedAnchors: [lockLine[0]!, lockLine[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "maryland",
      sourceGraphVersion: "gh-11-1"
    })

    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [placeholder]
    })

    const priority = findPriority(body)
    expect(priority.some((rule) => rule.if?.includes("switchback_lock"))).toBe(false)
    expect(findAreaFeature(body, "switchback_lock_0")).toBeUndefined()
  })

  it("skips a lock whose LineString collapses to a single point with no length", () => {
    featureFlags.roadRequirements = true
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

  it("combines bike profile safety rules with bounded lock rewards", () => {
    const street = MOTORCYCLE_PROFILES.find((p) => p.category === "street")!
    const body = createGraphHopperRequest({
      profile: "twisty",
      points: [baltimore, bethesda],
      roadLocks: [mustLock(), preferLock()],
      bikeProfile: { ...street }
    })
    const priority = findPriority(body)
    // Bike safety exclusions always apply…
    expect(priority.some((rule) => rule.if === "road_class == PATH" && rule.multiply_by === "0")).toBe(true)
    // …and graph-edged locks now contribute their bounded inside rewards.
    expect(priority.some((rule) => rule.if === "in_switchback_lock_0" && rule.multiply_by === "1.8")).toBe(true)
    expect(priority.some((rule) => rule.if === "in_switchback_lock_1" && rule.multiply_by === "1.6")).toBe(true)
  })
})
