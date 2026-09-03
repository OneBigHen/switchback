import { describe, expect, it } from "vitest"
import { buildLoopStopVia, buildRideTripRequest, createPlanningId } from "@/lib/planner/ride-plan-request"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { createManualRoadLock } from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 39.8309, lon: -77.2311, label: "Gettysburg" }

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

const lockLine: Coordinate[] = [
  [-76.7, 40.1],
  [-76.6, 40.12]
]

function mustLock() {
  return createManualRoadLock({
    mode: "must",
    displayName: "River bend",
    edgeIds: ["edge-1", "edge-2"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot: accessibleSnapshot,
    sourceRegionId: "pennsylvania",
    sourceGraphVersion: "gh-11-1"
  })
}

describe("ride trip request builder", () => {
  it("keeps a destination ride fast by default — no hidden time target", () => {
    expect(buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "twisty",
      targetMinutes: 120,
      seed: 8,
      via: [{ lat: 40.1, lon: -76.8, label: "Fun stop" }]
    })).toEqual({
      profile: "twisty",
      compare: true,
      points: [start, { lat: 40.1, lon: -76.8, label: "Fun stop" }, finish]
    })
  })

  it("carries the time target only when the rider opts into a time-shaped ride", () => {
    expect(buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "twisty",
      targetMinutes: 120,
      timeShaped: true,
      seed: 8,
      via: [{ lat: 40.1, lon: -76.8, label: "Fun stop" }]
    })).toEqual({
      profile: "twisty",
      compare: true,
      points: [start, { lat: 40.1, lon: -76.8, label: "Fun stop" }, finish],
      targetMinutes: 120
    })
  })

  it("carries toll policy, planning id, and candidate set into a destination request", () => {
    expect(buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "twisty",
      targetMinutes: 120,
      seed: 8,
      tollPolicy: "avoid",
      planningId: "plan-test-1234",
      candidateSet: "primary"
    })).toMatchObject({
      tollPolicy: "avoid",
      planningId: "plan-test-1234",
      candidateSet: "primary"
    })
  })

  it("omits an out-of-range destination time target even when time-shaped", () => {
    expect(buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "scenic",
      targetMinutes: 500,
      timeShaped: true,
      seed: 1
    })).not.toHaveProperty("targetMinutes")
  })

  it("carries an explicit highway-avoidance preference into routing", () => {
    expect(buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "quick",
      targetMinutes: 120,
      seed: 8,
      avoidHighways: true
    })).toMatchObject({
      profile: "quick",
      avoidHighways: true
    })
  })

  it("carries per-leg road character and rider-drawn avoid zones into an A-to-B request", () => {
    const avoidAreas = [{
      id: "closed bridge",
      polygon: [
        [-76.84, 40.2], [-76.82, 40.2], [-76.82, 40.22], [-76.84, 40.22]
      ] as [number, number][]
    }]
    expect(buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "twisty",
      targetMinutes: 120,
      seed: 8,
      via: [{ lat: 40.1, lon: -76.8, label: "Locked overlook", locked: true }],
      segmentProfiles: ["twisty", "adventure"],
      avoidAreas
    })).toMatchObject({
      segmentProfiles: ["twisty", "adventure"],
      avoidAreas
    })
  })

  it("builds a seeded time-boxed loop from only the start", () => {
    expect(buildRideTripRequest({
      mode: "loop",
      start,
      finish: null,
      profile: "adventure",
      targetMinutes: 90,
      seed: 37
    })).toEqual({
      profile: "adventure",
      compare: true,
      points: [start],
      // No heading: GraphHopper's round_trip + headings fails in some areas.
      roundTrip: {
        targetMinutes: 90,
        seed: 37
      }
    })
  })

  it("keeps the requested timebox as metadata when a loop has shaping stops", () => {
    const stop = { lat: 40.1, lon: -76.8, label: "Fun stop" }
    expect(buildRideTripRequest({
      mode: "loop",
      start,
      finish: null,
      profile: "scenic",
      targetMinutes: 120,
      seed: 9,
      via: [stop]
    })).toEqual({
      profile: "scenic",
      compare: true,
      points: [start, stop, start],
      loopTargetMinutes: 120
    })
  })

  it("rejects missing points before making a network request", () => {
    expect(() => buildRideTripRequest({
      mode: "destination",
      start,
      finish: null,
      profile: "scenic",
      targetMinutes: 120,
      seed: 1
    })).toThrow(/finish/i)
  })

  it("keeps the shape of a time-boxed loop when routing through a fun stop", () => {
    const geometry = [
      [-77, 40], [-76.9, 40.1], [-76.8, 40.2], [-76.7, 40.3],
      [-76.6, 40.4], [-76.7, 40.5], [-76.8, 40.4], [-76.9, 40.2], [-77, 40]
    ] as [number, number][]
    const stop = { lat: 40.41, lon: -76.61, label: "Good beer" }

    expect(buildLoopStopVia(geometry, stop)).toEqual([
      { lat: 40.2, lon: -76.8, label: "Loop shape 1" },
      stop,
      { lat: 40.4, lon: -76.8, label: "Loop shape 2" }
    ])
  })

  it("carries road locks and bike profile into a destination request", () => {
    const lock = mustLock()
    const bikeProfile = MOTORCYCLE_PROFILES.find((p) => p.category === "adventure")!
    const request = buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "twisty",
      bikeProfile: { ...bikeProfile },
      roadLocks: [lock],
      targetMinutes: 120,
      seed: 8
    })

    expect(request).toMatchObject({
      profile: "twisty",
      bikeProfile: expect.objectContaining({ category: "adventure" }),
      roadLocks: [expect.objectContaining({ id: lock.id })]
    })
  })

  it("omits road locks and bike profile from payloads that did not carry them", () => {
    const request = buildRideTripRequest({
      mode: "destination",
      start,
      finish,
      profile: "twisty",
      targetMinutes: 120,
      seed: 8
    })

    expect(request).not.toHaveProperty("roadLocks")
    expect(request).not.toHaveProperty("bikeProfile")
  })

  it("carries road locks and bike profile into a seeded round-trip request", () => {
    const lock = mustLock()
    const bikeProfile = MOTORCYCLE_PROFILES[0]!
    const request = buildRideTripRequest({
      mode: "loop",
      start,
      finish: null,
      profile: "adventure",
      bikeProfile: { ...bikeProfile },
      roadLocks: [lock],
      targetMinutes: 90,
      seed: 37
    })

    expect(request).toMatchObject({
      bikeProfile: expect.objectContaining({ name: bikeProfile.name }),
      roadLocks: [expect.objectContaining({ id: lock.id })]
    })
  })

  it("carries road locks and bike profile into a shaped loop request", () => {
    const lock = mustLock()
    const bikeProfile = MOTORCYCLE_PROFILES.find((p) => p.category === "dual-sport")!
    const request = buildRideTripRequest({
      mode: "loop",
      start,
      finish: null,
      profile: "scenic",
      bikeProfile: { ...bikeProfile },
      roadLocks: [lock],
      targetMinutes: 120,
      seed: 9,
      via: [{ lat: 40.1, lon: -76.8, label: "Fun stop" }]
    })

    expect(request).toMatchObject({
      bikeProfile: expect.objectContaining({ category: "dual-sport" }),
      roadLocks: [expect.objectContaining({ id: lock.id })]
    })
  })
})

describe("planning lifecycle ids", () => {
  it("generates unique planning ids with a stable fallback shape", () => {
    const first = createPlanningId()
    const second = createPlanningId()
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(8)
  })
})
