import { describe, expect, it } from "vitest"
import {
  roadLockAnchorFeatures,
  roadLockDriftArrowFeatures,
  roadLockLineFeatures,
  roadLockMatchColorKey,
  roadLockIsUnresolved,
  readTokenColor,
  resolveRoadLockMatchColorMap,
  ROAD_LOCK_MATCH_TOKEN,
  snapRouteTapToRoutableEdge
} from "@/components/planner/map-drawing"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RoadLock, RoadLockMatchStatus, RoadLockSatisfaction } from "@/lib/roads/road-locks"

const COLOR_MAP = {
  exact: "#80b99a",
  matched: "#f36a2d",
  approximate: "#e35d54",
  unresolved: "#e35d54"
}

function buildLock(overrides: Partial<RoadLock> = {}): RoadLock {
  return {
    id: "lock-1",
    mode: "must",
    edgeIds: ["e1", "e2"],
    geometry: {
      type: "LineString",
      coordinates: [[-77, 40], [-76.9, 40.05], [-76.8, 40.1]]
    },
    orderedAnchors: [[-77, 40], [-76.8, 40.1]],
    fallbackToleranceMeters: 50,
    source: "manual",
    confidence: "exact",
    sourceRegionId: "manual",
    sourceGraphVersion: "manual",
    accessSnapshot: {
      highwayClass: "unknown",
      motorcycleAccess: "unknown",
      generalAccess: "unknown",
      surface: "unknown",
      smoothness: "unknown",
      tracktype: "unknown",
      maxweightTonnes: null,
      seasonalUndated: false,
      activeConditions: [],
      routable: true
    },
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides
  } as RoadLock
}

function buildSatisfaction(overrides: Partial<RoadLockSatisfaction> = {}): RoadLockSatisfaction {
  return {
    lockId: "lock-1",
    mode: "must",
    satisfied: true,
    match: { kind: "exact", edgeIds: ["e1", "e2"] } as RoadLockMatchStatus,
    ...overrides
  }
}

function buildRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-1",
    name: "Test route",
    profile: "twisty",
    geometry: [[-77, 40], [-76.8, 40.1]],
    waypoints: [],
    instructions: [],
    distanceMiles: 14.2,
    durationMinutes: 22,
    ascentMeters: 0,
    descentMeters: 0,
    twistiness: 1,
    turnCount: 5,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    ...overrides
  } as PlannedRoute
}

describe("road lock map drawing helpers", () => {
  it("picks a color key from confidence or satisfaction", () => {
    expect(roadLockMatchColorKey({ confidence: "exact" })).toBe("exact")
    expect(roadLockMatchColorKey({ confidence: "matched" })).toBe("matched")
    expect(roadLockMatchColorKey({ confidence: "approximate" })).toBe("approximate")
    expect(roadLockMatchColorKey({ satisfaction: buildSatisfaction({ match: { kind: "exact", edgeIds: ["e1"] } }) })).toBe("exact")
    expect(roadLockMatchColorKey({ satisfaction: buildSatisfaction({ match: { kind: "approximate" } }) })).toBe("matched")
    expect(roadLockMatchColorKey({ satisfaction: buildSatisfaction({ match: { kind: "unresolved", reason: "no" } }) })).toBe("unresolved")
  })

  it("flags unresolved satisfaction rows", () => {
    expect(roadLockIsUnresolved(buildSatisfaction({ match: { kind: "unresolved", reason: "no" } }))).toBe(true)
    expect(roadLockIsUnresolved(buildSatisfaction({ match: { kind: "exact", edgeIds: [] } }))).toBe(false)
    expect(roadLockIsUnresolved(undefined)).toBe(false)
  })

  it("builds line features colored by the resolved color map", () => {
    const lock = buildLock({ confidence: "approximate" })
    const collection = roadLockLineFeatures([lock], [], COLOR_MAP)
    expect(collection.features[0]?.properties?.color).toBe(COLOR_MAP.approximate)
    expect(collection.features[0]?.properties?.unresolved).toBe(false)
  })

  it("flags unresolved locks as unresolved features", () => {
    const lock = buildLock({ id: "lock-1" })
    const route = buildRoute({
      lockSatisfaction: [{ lockId: "lock-1", mode: "must", satisfied: false, match: { kind: "unresolved", reason: "no" } }]
    })
    const collection = roadLockLineFeatures([lock], [route], COLOR_MAP)
    expect(collection.features[0]?.properties?.unresolved).toBe(true)
    expect(collection.features[0]?.properties?.color).toBe(COLOR_MAP.unresolved)
  })

  it("emits anchor features indexed by their position in the ordered anchors", () => {
    const lock = buildLock()
    const collection = roadLockAnchorFeatures([lock])
    expect(collection.features).toHaveLength(2)
    expect(collection.features[0]?.properties?.index).toBe(0)
    expect(collection.features[1]?.properties?.index).toBe(1)
  })

  it("skips drift arrows when satisfaction is exact", () => {
    const lock = buildLock({ orderedAnchors: [[-77, 40], [-76.8, 40.1]] })
    const route = buildRoute({ lockSatisfaction: [buildSatisfaction({ match: { kind: "exact", edgeIds: [] } })] })
    const collection = roadLockDriftArrowFeatures([lock], [route], COLOR_MAP)
    expect(collection.features).toHaveLength(0)
  })

  it("emits drift arrows between original anchors and the planned route when rematched approximately", () => {
    const lock = buildLock({ orderedAnchors: [[-77, 40.5], [-76.8, 40.6]] })
    const route = buildRoute({
      geometry: [[-77, 40], [-76.8, 40.1]],
      lockSatisfaction: [buildSatisfaction({ match: { kind: "approximate" } })]
    })
    const collection = roadLockDriftArrowFeatures([lock], [route], COLOR_MAP)
    expect(collection.features.length).toBeGreaterThan(0)
    expect(collection.features[0]?.properties?.color).toBe(COLOR_MAP.matched)
  })

  it("resolves the match-state color map from CSS tokens (with safe fallback)", () => {
    const resolved = resolveRoadLockMatchColorMap()
    const keys = ["exact", "matched", "approximate", "unresolved"] as const
    for (const key of keys) {
      expect(typeof resolved[key]).toBe("string")
      expect(resolved[key].length).toBeGreaterThan(0)
      expect(ROAD_LOCK_MATCH_TOKEN[key]).toMatch(/^--road-lock-/)
    }
  })

  it("returns a safe color from readTokenColor even when missing", () => {
    expect(readTokenColor("--this-token-does-not-exist")).toBe("#000")
  })

  it("passes the tapped tap back to the caller with no edge ids (Phase 1 stub)", () => {
    const snap = snapRouteTapToRoutableEdge([-76.9, 40.05])
    expect(snap.coordinate).toEqual([-76.9, 40.05])
    expect(snap.edgeIds).toEqual([])
    expect(snap.geometry).toEqual([[-76.9, 40.05]])
  })
})
