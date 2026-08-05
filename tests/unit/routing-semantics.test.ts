import { describe, expect, it } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { evaluateEligibility, isEligible } from "@/lib/domain/routing/eligibility"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RoadLockSatisfaction } from "@/lib/roads/road-locks"

const baseRequest = {
  profile: "twisty" as const,
  points: [{ lat: 40.2, lon: -76.9, label: "Start" }]
}

const eligibleRoute: PlannedRoute = {
  id: "r1",
  name: "Ride",
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 25,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 70,
  turnCount: 12,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

describe("normalizeRouteRequest (SB-001)", () => {
  it("derives shape from the request kind", () => {
    expect(normalizeRouteRequest(baseRequest).shape).toBe("destination")
    expect(normalizeRouteRequest({
      ...baseRequest,
      roundTrip: { targetMinutes: 90 }
    }).shape).toBe("loop")
    expect(normalizeRouteRequest({
      ...baseRequest,
      loopTargetMinutes: 120
    }).shape).toBe("loop")
  })

  it("defaults source to manual and preserves an explicit source", () => {
    expect(normalizeRouteRequest(baseRequest).source).toBe("manual")
    expect(normalizeRouteRequest({ ...baseRequest, source: "intent" }).source).toBe("intent")
    expect(normalizeRouteRequest({ ...baseRequest, source: "offline-recovery" }).source).toBe("offline-recovery")
  })

  it("generates a request id when absent and preserves one when present", () => {
    const first = normalizeRouteRequest(baseRequest)
    expect(first.requestId).toMatch(/^req-/)
    expect(normalizeRouteRequest({ ...baseRequest, requestId: "fixed-id" }).requestId).toBe("fixed-id")
  })

  it("makes every constraint field explicit so adapters never guess defaults", () => {
    const normalized = normalizeRouteRequest(baseRequest)
    expect(normalized.avoidHighways).toBe(false)
    expect(normalized.avoidAreas).toEqual([])
    expect(normalized.tollPolicy).toBe("allow-with-warning")
    expect(normalized.roadLocks).toEqual([])
    // Explicit values survive.
    expect(normalizeRouteRequest({
      ...baseRequest,
      avoidHighways: true,
      tollPolicy: "avoid"
    })).toMatchObject({ avoidHighways: true, tollPolicy: "avoid" })
  })

  it("is idempotent for already-normalized requests", () => {
    const normalized = normalizeRouteRequest(baseRequest)
    const again = normalizeRouteRequest(normalized)
    expect(again.requestId).toBe(normalized.requestId)
    expect(again.shape).toBe(normalized.shape)
    expect(again.source).toBe(normalized.source)
  })
})

describe("route eligibility (SB-002)", () => {
  it("accepts a real routed candidate", () => {
    expect(evaluateEligibility(eligibleRoute).eligible).toBe(true)
  })

  it("rejects geometry with fewer than two points", () => {
    const report = evaluateEligibility({ ...eligibleRoute, geometry: [[-76.9, 40.2]] })
    expect(report.eligible).toBe(false)
    expect(report.failures[0]?.code).toBe("invalid-geometry")
  })

  it("rejects preview-only geometry used for guidance", () => {
    const report = evaluateEligibility({ ...eligibleRoute, previewOnly: true })
    expect(report.eligible).toBe(false)
    expect(report.failures[0]?.code).toBe("preview-only")
  })

  it("rejects a route that fails an unresolved must-use road", () => {
    const mustFailure: RoadLockSatisfaction = {
      lockId: "lock-1",
      mode: "must",
      satisfied: false,
      match: { kind: "unresolved", reason: "Lock conflicts with a legal motorcycle access restriction." }
    }
    const report = evaluateEligibility({ ...eligibleRoute, lockSatisfaction: [mustFailure] })
    expect(report.eligible).toBe(false)
    expect(report.failures[0]?.code).toBe("must-road-unresolved")
  })

  it("ignores an unsatisfied prefer road when judging hard eligibility", () => {
    const preferMiss: RoadLockSatisfaction = {
      lockId: "lock-2",
      mode: "prefer",
      satisfied: false,
      match: { kind: "unresolved", reason: "Preferred road skipped." }
    }
    expect(isEligible({ ...eligibleRoute, lockSatisfaction: [preferMiss] })).toBe(true)
  })
})
