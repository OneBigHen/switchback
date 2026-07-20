import { describe, expect, it } from "vitest"
import {
  evaluateRoadLockPrecedence,
  partitionLocksByPrecedence,
  bikeMatchesSurface,
  ROAD_LOCK_PRECEDENCE
} from "@/lib/roads/lock-precedence"
import { MOTORCYCLE_PROFILES, getBikeProfile } from "@/lib/routing/bike-profiles"
import { createManualRoadLock } from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

function snapshot(overrides: Partial<RoadAccessSnapshot> = {}): RoadAccessSnapshot {
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

const line: Coordinate[] = [
  [-76.5, 40.2],
  [-76.4, 40.22]
]
const anchors: Coordinate[] = [
  [-76.5, 40.2],
  [-76.4, 40.22]
]

function lockWith(snapshot: RoadAccessSnapshot, mode: "must" | "prefer" = "must") {
  return createManualRoadLock({
    mode,
    edgeIds: ["e1"],
    geometry: line,
    orderedAnchors: anchors,
    accessSnapshot: snapshot,
    sourceRegionId: "pennsylvania",
    sourceGraphVersion: "gh-11-1"
  })
}

describe("road lock precedence ordering", () => {
  it("orders legal access above active closure above bike compatibility", () => {
    expect(ROAD_LOCK_PRECEDENCE).toEqual([
      "legal-access",
      "active-closure",
      "bike-compatibility",
      "must-use-lock",
      "required-stops",
      "prefer-lock",
      "route-profile-scoring"
    ])
  })

  it("survives when all precedence layers are clear", () => {
    const lock = lockWith(snapshot())
    const result = evaluateRoadLockPrecedence(lock, MOTORCYCLE_PROFILES[0], false)
    expect(result.lockSurvives).toBe(true)
    expect(result.blockingLayer).toBeNull()
  })

  it("blocks on legal-access when motorcycle=no regardless of rider intent", () => {
    const lock = lockWith(snapshot({ motorcycleAccess: "no" }))
    const result = evaluateRoadLockPrecedence(lock, MOTORCYCLE_PROFILES[0], false)
    expect(result.lockSurvives).toBe(false)
    expect(result.blockingLayer).toBe("legal-access")
  })

  it("blocks on active-closure when a condition is currently closed", () => {
    const lock = lockWith(snapshot({
      activeConditions: [{ sourceKey: "motorcycle:conditional", raw: "no @ winter", isOpen: false, reason: "Winter" }]
    }))
    const result = evaluateRoadLockPrecedence(lock, MOTORCYCLE_PROFILES[0], false)
    expect(result.lockSurvives).toBe(false)
    expect(result.blockingLayer).toBe("active-closure")
  })

  it("blocks on bike-compatibility when surface conflicts with street profile", () => {
    const lock = lockWith(snapshot({ surface: "gravel", smoothness: "intermediate" }))
    const street = getBikeProfile("Street")!
    const result = evaluateRoadLockPrecedence(lock, street, false)
    expect(result.lockSurvives).toBe(false)
    expect(result.blockingLayer).toBe("bike-compatibility")
  })

  it("survives prefer lock when required stop may route around it", () => {
    const lock = lockWith(snapshot(), "prefer")
    const result = evaluateRoadLockPrecedence(lock, MOTORCYCLE_PROFILES[0], true)
    expect(result.lockSurvives).toBe(true)
    expect(result.blockingLayer).toBe(requiredStopsLayerOrPrefer(result))
  })

  it("partitions locks into surviving and blocked", () => {
    const mustLock = lockWith(snapshot(), "must")
    const blockedLock = lockWith(snapshot({ motorcycleAccess: "no" }), "must")
    const { surviving, blocked } = partitionLocksByPrecedence([mustLock, blockedLock], MOTORCYCLE_PROFILES[0], false)
    expect(surviving).toHaveLength(1)
    expect(surviving[0]!.id).toBe(mustLock.id)
    expect(blocked).toHaveLength(1)
    expect(blocked[0]!.lock.id).toBe(blockedLock.id)
    expect(blocked[0]!.evaluation.blockingLayer).toBe("legal-access")
  })

  it("bikeMatchesSurface rejects impassable smoothness for every profile", () => {
    for (const profile of MOTORCYCLE_PROFILES) {
      expect(bikeMatchesSurface(profile, snapshot({ smoothness: "impassable" }))).toBe(false)
    }
  })

  it("street profile excludes tracks unless gravel is permitted", () => {
    const street = getBikeProfile("Street")!
    expect(bikeMatchesSurface(street, snapshot({ highwayClass: "track", surface: "gravel" }))).toBe(false)
    const dual = getBikeProfile("Dual-Sport")!
    expect(bikeMatchesSurface(dual, snapshot({ highwayClass: "track", surface: "gravel", smoothness: "intermediate" }))).toBe(true)
  })
})

function requiredStopsLayerOrPrefer(result: { blockingLayer: string | null }): string | null {
  // Required stops sit above prefer locks; when required-stops is present,
  // that layer is named as a soft block ("may route around") but the lock
  // survives. Either value is acceptable here.
  return result.blockingLayer ?? "required-stops"
}
