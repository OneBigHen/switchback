import { describe, expect, it } from "vitest"
import {
  aggregateRigEvidence,
  inferRouteRole,
  isRigEvidenceObservation,
  type RigEvidenceObservation
} from "@/lib/roads/rig-evidence"

const segmentUid = "a".repeat(64)
const now = "2026-08-11T12:00:00.000Z"

function observation(overrides: Partial<RigEvidenceObservation> = {}): RigEvidenceObservation {
  return {
    segmentUid,
    contributorId: "rider-a",
    duplicateFamilyId: "family-a",
    source: "device-recorded-human-ride",
    kind: "desirability",
    routeRole: "highlight",
    routeRoleWeight: 1,
    observedAt: now,
    mapMatchConfidence: 1,
    coveredFraction: 1,
    dimensions: { twistyInterest: 0.9, scenicProxy: 0.8 },
    surfaceConfidence: 0.9,
    ...overrides
  }
}

describe("RIG route roles", () => {
  it("classifies high, low, middle, and low-confidence runs without inventing a role", () => {
    expect(inferRouteRole({
      intrinsicInterest: 0.9,
      independentRepeatSelection: 0.9,
      contiguousLengthQuality: 0.9,
      deviationFromFastConnector: 0.8,
      explicitPositiveNotes: 0.8,
      signalConfidence: 1
    }).role).toBe("highlight")
    expect(inferRouteRole({
      intrinsicInterest: 0.1,
      independentRepeatSelection: 0.1,
      contiguousLengthQuality: 0.1,
      deviationFromFastConnector: 0.1,
      explicitPositiveNotes: 0.1,
      signalConfidence: 1
    }).role).toBe("connector")
    expect(inferRouteRole({
      intrinsicInterest: 0.4,
      independentRepeatSelection: 0.4,
      contiguousLengthQuality: 0.4,
      deviationFromFastConnector: 0.4,
      explicitPositiveNotes: 0.4,
      signalConfidence: 1
    }).role).toBe("unknown")
    expect(inferRouteRole({
      intrinsicInterest: 1,
      independentRepeatSelection: 1,
      contiguousLengthQuality: 1,
      deviationFromFastConnector: 1,
      explicitPositiveNotes: 1,
      signalConfidence: 0.2
    }).role).toBe("unknown")
  })
})

describe("RIG evidence boundary and aggregation", () => {
  it("accepts canonical geometry-free observations and rejects provider edge ids", () => {
    expect(isRigEvidenceObservation(observation())).toBe(true)
    expect(isRigEvidenceObservation({ ...observation(), segmentUid: "edge-42" })).toBe(false)
    expect(isRigEvidenceObservation({ ...observation(), dimensions: { madeUp: 0.5 } })).toBe(false)
  })

  it("keeps desirability, authority, current reports, and preference posterior separate", () => {
    const result = aggregateRigEvidence([
      observation(),
      observation({ duplicateFamilyId: "family-b", dimensions: { twistyInterest: 0.95 } }),
      observation({
        contributorId: "curator-b",
        duplicateFamilyId: "family-c",
        source: "curated-planned-route",
        routeRole: "supporting",
        routeRoleWeight: 0.6,
        dimensions: { twistyInterest: 0.2 },
        surfaceConfidence: undefined
      }),
      observation({
        source: "switchback-generated-route",
        duplicateFamilyId: "generated-family",
        dimensions: { twistyInterest: 1 }
      }),
      observation({
        contributorId: "official-dataset",
        duplicateFamilyId: "official-build",
        source: "official-authority",
        kind: "hard-authority",
        routeRole: "unknown",
        routeRoleWeight: 0
      }),
      observation({ kind: "soft-current-report", routeRole: "unknown", routeRoleWeight: 0 }),
      observation({ kind: "preference-positive", routeRole: "unknown", routeRoleWeight: 0 }),
      observation({ kind: "preference-negative", routeRole: "unknown", routeRoleWeight: 0 })
    ], { now, contributorCap: 1 })
    const aggregate = result[0]!

    expect(aggregate.segmentUid).toBe(segmentUid)
    expect(aggregate.dimensions.twistyInterest).toBeGreaterThan(0.2)
    expect(aggregate.dimensions.twistyInterest).toBeLessThan(0.95)
    expect(aggregate.evidenceConfidence).toBeGreaterThan(0)
    expect(aggregate.accessConfidence).toBeGreaterThan(0)
    expect(aggregate.softCurrentReportWeight).toBeGreaterThan(0)
    expect(aggregate.preference.alpha).toBeGreaterThan(1)
    expect(aggregate.preference.beta).toBeGreaterThan(1)
    expect(aggregate.preference.mean).toBeCloseTo(0.5, 3)
    expect(aggregate.independentSourceCount).toBe(2)
    expect(aggregate.maxContributorWeight).toBeLessThanOrEqual(1)
  })

  it("caps contributors and rejects oversized batches instead of growing without bound", () => {
    const aggregate = aggregateRigEvidence(
      Array.from({ length: 3 }, (_, index) => observation({ duplicateFamilyId: `family-${index}` })),
      { now, contributorCap: 0.5 }
    )[0]!
    expect(aggregate.totalEvidenceWeight).toBeLessThanOrEqual(0.5)
    expect(() => aggregateRigEvidence([observation(), observation()], { maxObservations: 1 })).toThrow(/maximum/i)
  })

  it("does not turn an absent negative preference into negative evidence", () => {
    const aggregate = aggregateRigEvidence([
      observation({ kind: "preference-positive", routeRole: "unknown", routeRoleWeight: 0 })
    ], { now })[0]!
    expect(aggregate.preference.beta).toBe(1)
    expect(aggregate.preference.mean).toBeGreaterThan(0.5)
  })
})
