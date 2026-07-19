import { describe, expect, it } from "vitest"
import { buildLoopStopVia, buildRideTripRequest } from "@/lib/planner/ride-plan-request"

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 39.8309, lon: -77.2311, label: "Gettysburg" }

describe("ride trip request builder", () => {
  it("builds a compared destination request", () => {
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
      roundTrip: {
        targetMinutes: 90,
        seed: 37,
        heading: 37
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
})
