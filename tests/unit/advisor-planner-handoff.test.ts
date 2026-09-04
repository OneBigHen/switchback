import { describe, expect, it } from "vitest"
import {
  advisorRideToPlannerHandoff,
  mergeAdvisorStopIntoVia
} from "@/lib/advice/planner-handoff"
import type { ProposedRide, ProposedStop } from "@/lib/advice/contracts"
import type { Coordinate, Waypoint } from "@/lib/routing/types"

const ride: ProposedRide = {
  mode: "destination",
  profile: "adventure",
  targetMinutes: 180,
  start: { name: "Harrisburg", lat: 40.2732, lon: -76.8867 },
  finish: { name: "Gettysburg", lat: 39.8309, lon: -77.2311 },
  waypoints: [{ name: "Pine Grove Road", lat: 40.1, lon: -77.05 }],
  avoidHighways: true,
  tollPolicy: "avoid",
  summary: "Three hours of mixed-surface back roads to Gettysburg."
}

describe("advisor planner handoff", () => {
  it("carries every route-shaping choice atomically into the planner request", () => {
    expect(advisorRideToPlannerHandoff(ride)).toEqual({
      mode: "destination",
      points: {
        start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
        finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg" },
        via: [{ lat: 40.1, lon: -77.05, label: "Pine Grove Road" }]
      },
      profile: "adventure",
      targetMinutes: 180,
      timeShaped: true,
      avoidHighways: true,
      tollPolicy: "avoid"
    })
  })

  it("explicitly turns destination time shaping off when the advisor did not request a timebox", () => {
    expect(advisorRideToPlannerHandoff({ ...ride, targetMinutes: null })).toMatchObject({
      targetMinutes: null,
      timeShaped: false
    })
  })
})

describe("advisor stop handoff", () => {
  const geometry: Coordinate[] = [
    [-77.0, 40.2],
    [-76.9, 40.2],
    [-76.8, 40.2],
    [-76.7, 40.2],
    [-76.6, 40.2]
  ]
  const existing: Waypoint[] = [
    { lat: 40.2, lon: -76.9, label: "Coffee" },
    { lat: 40.2, lon: -76.7, label: "Lookout" }
  ]
  const stop: ProposedStop = {
    id: "brewery",
    name: "Switchback Brewing",
    reason: "Good finish to the gravel section.",
    kind: "brewery",
    anchor: { lat: 40.2, lon: -76.8 },
    routeProgress: 0.5,
    citations: []
  }

  it("adds an advisor stop without deleting existing rider waypoints and keeps route order", () => {
    expect(mergeAdvisorStopIntoVia(existing, stop, geometry).map((point) => point.label))
      .toEqual(["Coffee", "Switchback Brewing", "Lookout"])
  })

  it("does not duplicate a stop already present at effectively the same point", () => {
    const alreadyThere = [...existing, { lat: 40.20001, lon: -76.80001, label: "Already there" }]
    expect(mergeAdvisorStopIntoVia(alreadyThere, stop, geometry)).toHaveLength(3)
  })
})
