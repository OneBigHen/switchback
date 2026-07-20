import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  convertMustLockToPrefer,
  createGpxRoadLock,
  createImageTraceRoadLock,
  createManualRoadLock,
  describePreferSkipReason,
  evaluateRoadLockSatisfaction,
  generateRoadLockId,
  rematchRoadLock,
  RoadLockLibrary,
  IMAGE_TRACE_ACCURACY_STATEMENT,
  anchorsInOrder,
  distanceToLineMeters,
  type RoadLock
} from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

function accessibleSnapshot(overrides: Partial<RoadAccessSnapshot> = {}): RoadAccessSnapshot {
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

const baseLine: Coordinate[] = [
  [-76.5, 40.2],
  [-76.45, 40.21],
  [-76.4, 40.22]
]

const baseAnchors: Coordinate[] = [
  [-76.5, 40.2],
  [-76.4, 40.22]
]

interface ManualLockOverrides {
  mode?: "must" | "prefer"
  displayName?: string
  edgeIds?: string[]
  geometry?: Coordinate[]
  orderedAnchors?: Coordinate[]
  fallbackToleranceMeters?: number
  accessSnapshot?: RoadAccessSnapshot
}

function baseManualLock(overrides: ManualLockOverrides = {}): RoadLock {
  return createManualRoadLock({
    mode: overrides.mode ?? "must",
    displayName: overrides.displayName,
    edgeIds: overrides.edgeIds ?? ["e1", "e2", "e3"],
    geometry: overrides.geometry ?? baseLine,
    orderedAnchors: overrides.orderedAnchors ?? baseAnchors,
    fallbackToleranceMeters: overrides.fallbackToleranceMeters,
    accessSnapshot: overrides.accessSnapshot ?? accessibleSnapshot(),
    sourceRegionId: "pennsylvania",
    sourceGraphVersion: "gh-11-1"
  })
}

describe("road locks", () => {
  let library: RoadLockLibrary

  beforeEach(() => {
    library = new RoadLockLibrary(`switchback-road-locks-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await library.destroy()
  })

  it("creates manual locks with at least two ordered anchors", () => {
    const lock = baseManualLock()
    expect(lock.mode).toBe("must")
    expect(lock.source).toBe("manual")
    expect(lock.confidence).toBe("exact")
    expect(lock.edgeIds).toEqual(["e1", "e2", "e3"])
    expect(lock.geometry.coordinates).toHaveLength(3)
    expect(lock.orderedAnchors).toHaveLength(2)
    expect(lock.fallbackToleranceMeters).toBeGreaterThanOrEqual(10)
  })

  it("rejects locks with fewer than two ordered anchors", () => {
    expect(() =>
      createManualRoadLock({
        mode: "must",
        edgeIds: ["e1"],
        geometry: [baseLine[0]!, baseLine[1]!],
        orderedAnchors: [baseAnchors[0]!],
        accessSnapshot: accessibleSnapshot(),
        sourceRegionId: "pennsylvania",
        sourceGraphVersion: "gh-11-1"
      })
    ).toThrow()
  })

  it("persists and reloads locks through the library", async () => {
    const lock = baseManualLock({ displayName: "Hawk Mountain climb" })
    await library.save(lock)
    const reloaded = await library.get(lock.id)
    expect(reloaded?.displayName).toBe("Hawk Mountain climb")
    expect(reloaded?.source).toBe("manual")
    const listed = await library.list({ sourceRegionId: "pennsylvania" })
    expect(listed).toHaveLength(1)
  })

  it("gpx and image-trace locks carry the right provenance", () => {
    const gpx = createGpxRoadLock({
      mode: "prefer",
      edgeIds: ["e1"],
      geometry: baseLine,
      orderedAnchors: baseAnchors,
      accessSnapshot: accessibleSnapshot(),
      sourceRegionId: "pennsylvania",
      sourceGraphVersion: "gh-11-1"
    })
    expect(gpx.source).toBe("gpx")
    expect(gpx.confidence).toBe("matched")

    const trace = createImageTraceRoadLock({
      mode: "prefer",
      edgeIds: [],
      geometry: baseLine,
      orderedAnchors: baseAnchors,
      accessSnapshot: accessibleSnapshot(),
      sourceRegionId: "pennsylvania",
      sourceGraphVersion: "gh-11-1"
    })
    expect(trace.source).toBe("image-trace")
    expect(trace.confidence).toBe("approximate")
    expect(IMAGE_TRACE_ACCURACY_STATEMENT).toContain("Approximate trace")
  })

  it("rematches a lock when the new graph still contains the anchors in order", () => {
    const lock = baseManualLock()
    const current = {
      edgeIds: ["e-other", "e-other-2", "e-other-3"],
      geometry: [
        [-76.50001, 40.20001],
        [-76.44999, 40.21001],
        [-76.40002, 40.22002]
      ] as Coordinate[]
    }
    const result = rematchRoadLock(lock, current, 60)
    expect(result.match.kind).toBe("approximate")
    expect(result.updated?.source).toBe("rematched")
    expect(result.updated?.rematchedAt).toBeTruthy()
    expect(result.updated?.edgeIds).toEqual(current.edgeIds)
  })

  it("rematches as exact when the edge ids are all preserved", () => {
    const lock = baseManualLock()
    const result = rematchRoadLock(lock, { edgeIds: lock.edgeIds, geometry: lock.geometry.coordinates })
    expect(result.match.kind).toBe("exact")
    if (result.match.kind === "exact") {
      expect(result.match.edgeIds).toEqual(lock.edgeIds)
    }
  })

  it("refuses to slide a lock when anchors are out of order", () => {
    const lock = baseManualLock()
    const reversed: Coordinate[] = [
      [-76.4, 40.22],
      [-76.45, 40.21],
      [-76.5, 40.2]
    ]
    const result = rematchRoadLock(lock, { edgeIds: lock.edgeIds, geometry: reversed }, 1000)
    expect(result.match.kind).toBe("unresolved")
    expect(result.updated).toBeNull()
  })

  it("refuses to rematch when an anchor falls outside the fallback corridor", () => {
    const lock = baseManualLock({ fallbackToleranceMeters: 50 })
    const far: Coordinate[] = [
      [-76.5, 40.2],
      [-76.45, 40.21],
      [-76.0, 41.0]
    ]
    const result = rematchRoadLock(lock, { edgeIds: lock.edgeIds, geometry: far })
    expect(result.match.kind).toBe("unresolved")
    expect(result.updated).toBeNull()
  })

  it("satisfies a must lock whose route geometry walks the stored anchors", () => {
    const lock = baseManualLock({ fallbackToleranceMeters: 200 })
    const route: Coordinate[] = [
      [-76.5, 40.2],
      [-76.46, 40.205],
      [-76.42, 40.218],
      [-76.4, 40.22]
    ]
    const result = evaluateRoadLockSatisfaction(lock, route)
    expect(result.satisfied).toBe(true)
    expect(result.mode).toBe("must")
  })

  it("fails a must lock when legal access forbids the corridor", () => {
    const lock = baseManualLock({
      accessSnapshot: accessibleSnapshot({ motorcycleAccess: "no" })
    })
    const result = evaluateRoadLockSatisfaction(lock, baseLine)
    expect(result.satisfied).toBe(false)
    expect(result.match.kind).toBe("unresolved")
  })

  it("fails a must lock when an active closure covers the corridor", () => {
    const lock = baseManualLock({
      accessSnapshot: accessibleSnapshot({
        activeConditions: [
          { sourceKey: "motorcycle:conditional", raw: "no @ winter", isOpen: false, reason: "Seasonal closure" }
        ]
      })
    })
    const result = evaluateRoadLockSatisfaction(lock, baseLine)
    expect(result.satisfied).toBe(false)
    expect(result.match.kind).toBe("unresolved")
    if (result.match.kind === "unresolved") {
      expect(result.match.reason).toContain("closure")
    }
  })

  it("for prefer locks, surfaces a skip reason when the route cannot include the corridor", () => {
    const lock = baseManualLock({ mode: "prefer", fallbackToleranceMeters: 50 })
    // The route approaches the first anchor but cuts far south of the second.
    const route: Coordinate[] = [
      [-76.5, 40.2],
      [-76.45, 40.0],
      [-76.0, 39.7]
    ]
    const result = evaluateRoadLockSatisfaction(lock, route)
    expect(result.satisfied).toBe(false)
    expect(result.skippedReason).toBeTruthy()
  })

  it("converts a must lock to a prefer lock while preserving provenance", () => {
    const lock = baseManualLock()
    const converted = convertMustLockToPrefer(lock)
    expect(converted.mode).toBe("prefer")
    expect(converted.source).toBe(lock.source)
    expect(converted.edgeIds).toEqual(lock.edgeIds)
  })

  it("generates unique ids", () => {
    const a = generateRoadLockId()
    const b = generateRoadLockId()
    expect(a).not.toBe(b)
  })

  it("describes prefer skip reasons with detour miles when supplied", () => {
    const reason = describePreferSkipReason("Preferred road skipped.", 47)
    expect(reason).toContain("47-mile backtrack")
  })

  it("computes distance from a point to a stored LineString", () => {
    const far: Coordinate = [-75.0, 41.0]
    const distance = distanceToLineMeters(far, baseLine)
    expect(distance).toBeGreaterThan(50_000)
    const close = distanceToLineMeters([-76.45, 40.21], baseLine)
    expect(close).toBeLessThan(20)
  })

  it("detects ordered anchors walking a line", () => {
    expect(anchorsInOrder(baseAnchors, baseLine)).toBe(true)
    expect(anchorsInOrder([baseAnchors[1]!, baseAnchors[0]!], baseLine)).toBe(false)
  })
})
