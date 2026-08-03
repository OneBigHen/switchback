import { describe, expect, it } from "vitest"
import {
  anchorWithinEnvelope,
  backtrackingShare,
  buildAnchorSets,
  corridorEnvelope,
  distanceMiles,
  estimateTimeboxBaseline,
  lateralDistanceMiles,
  selfOverlapShare,
  type CorridorSourceCandidates
} from "@/lib/routing/destination-corridors"

const start: [number, number] = [-76.8867, 40.2732]
const finish: [number, number] = [-76.3055, 40.0379]

describe("timebox baseline", () => {
  it("estimates target distance from direct duration and scales detour time", () => {
    const baseline = estimateTimeboxBaseline(47, 38, 120)
    expect(baseline.estimatedTargetDistanceMiles).toBeCloseTo(97.02, 1)
    expect(baseline.availableDetourMinutes).toBe(73)
    expect(baseline.feasible).toBe(true)
  })

  it("marks an infeasible baseline when the direct route already exceeds 110% of target", () => {
    const baseline = estimateTimeboxBaseline(140, 90, 120)
    expect(baseline.feasible).toBe(false)
  })
})

describe("corridor envelope", () => {
  it("caps path distance at 105% of the estimated target distance", () => {
    const envelope = corridorEnvelope(97)
    expect(envelope.maxPathDistanceMiles).toBeCloseTo(101.85, 1)
  })

  it("caps lateral deviation between 8 and 40 miles", () => {
    expect(corridorEnvelope(10).maxLateralMiles).toBe(8)
    expect(corridorEnvelope(200).maxLateralMiles).toBe(40)
    expect(corridorEnvelope(97).maxLateralMiles).toBeCloseTo(33.95, 1)
  })

  it("accepts anchors inside the envelope and rejects out-of-corridor swings", () => {
    const envelope = corridorEnvelope(97)
    const nearBaseline: [number, number] = [-76.6, 40.25]
    expect(anchorWithinEnvelope(start, finish, nearBaseline, envelope)).toBe(true)
    // A Philadelphia-scale swing far south of the baseline must be rejected.
    const philadelphia: [number, number] = [-75.16, 39.95]
    expect(anchorWithinEnvelope(start, finish, philadelphia, envelope)).toBe(false)
  })

  it("measures lateral distance from the direct baseline", () => {
    const lateral = lateralDistanceMiles([-76.6, 40.28], start, finish)
    expect(lateral).toBeGreaterThan(0)
    expect(lateral).toBeLessThan(distanceMiles(start, finish))
  })
})

describe("backtracking and self-overlap", () => {
  it("measures immediate backtracking share", () => {
    const straight: [number, number][] = [
      [-76.9, 40.2],
      [-76.8, 40.2],
      [-76.7, 40.2]
    ]
    expect(backtrackingShare(straight)).toBeLessThan(0.05)

    const outAndBack: [number, number][] = [
      [-76.9, 40.2],
      [-76.7, 40.3],
      [-76.9, 40.2],
      [-76.6, 40.2]
    ]
    expect(backtrackingShare(outAndBack)).toBeGreaterThan(0.3)
  })

  it("measures self-overlap via revisited grid cells", () => {
    const loop: [number, number][] = [
      [-76.8867, 40.2732],
      [-76.7000, 40.3200], [-76.6800, 40.3000], [-76.7000, 40.3200],
      [-76.6600, 40.3000], [-76.6400, 40.2800], [-76.6600, 40.3000],
      [-76.6200, 40.2800], [-76.6000, 40.2600], [-76.6200, 40.2800],
      [-76.5800, 40.2600], [-76.5600, 40.2400], [-76.5800, 40.2600],
      [-76.5400, 40.2400], [-76.5200, 40.2200], [-76.5400, 40.2400],
      [-76.5000, 40.2200], [-76.4800, 40.2000], [-76.5000, 40.2200],
      [-76.4600, 40.2000], [-76.4400, 40.1800], [-76.4600, 40.2000],
      [-76.4200, 40.1800], [-76.4000, 40.1600], [-76.4200, 40.1800],
      [-76.3055, 40.0379]
    ]
    expect(selfOverlapShare(loop)).toBeGreaterThan(0.2)
    expect(selfOverlapShare([[-76.9, 40.2], [-76.6, 40.3]])).toBe(0)
  })
})

describe("anchor set building", () => {
  const envelope = corridorEnvelope(97)
  const sources: CorridorSourceCandidates = {
    curvatureSegments: [
      {
        id: "curv-1",
        name: "River Bend",
        score: 95,
        surface: "asphalt",
        geometry: [
          [-76.85, 40.35],
          [-76.75, 40.3],
          [-76.65, 40.22]
        ]
      },
      {
        id: "curv-2",
        name: "Ridge Road",
        score: 88,
        surface: "asphalt",
        geometry: [
          [-76.8, 40.45],
          [-76.7, 40.45],
          [-76.6, 40.35]
        ]
      }
    ],
    gpxRoutes: [{
      id: "gpx-1",
      label: "Known loop",
      geometry: [
        [-76.9, 40.3],
        [-76.65, 40.4],
        [-76.5, 40.2],
        [-76.35, 40.05]
      ]
    }],
    hints: []
  }

  it("produces bounded, distinct anchor sets inside the envelope", () => {
    const sets = buildAnchorSets(start, finish, envelope, sources)
    expect(sets.length).toBeGreaterThanOrEqual(2)
    expect(sets.length).toBeLessThanOrEqual(4)
    for (const set of sets) {
      expect(set.anchors.length).toBeGreaterThan(0)
      for (const anchor of set.anchors) {
        expect(anchorWithinEnvelope(start, finish, anchor, envelope)).toBe(true)
      }
    }
    expect(sets.some((set) => set.source === "curvature")).toBe(true)
    expect(sets.some((set) => set.source === "gpx")).toBe(true)
  })

  it("caps at four anchor sets and merges nearby anchors", () => {
    const manySources: CorridorSourceCandidates = {
      curvatureSegments: Array.from({ length: 20 }, (_, index) => ({
        id: `curv-${index}`,
        name: `Curve ${index}`,
        score: 90 - index,
        surface: "asphalt",
        geometry: [
          [-76.9 + index * 0.01, 40.25],
          [-76.85 + index * 0.01, 40.24],
          [-76.8 + index * 0.01, 40.23]
        ]
      })),
      gpxRoutes: [],
      hints: []
    }
    const sets = buildAnchorSets(start, finish, corridorEnvelope(200), manySources)
    expect(sets.length).toBeLessThanOrEqual(4)
  })
})
