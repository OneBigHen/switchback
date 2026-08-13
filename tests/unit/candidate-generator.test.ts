import { describe, expect, it } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { generateCorridorCandidates, generateLoopCandidates } from "@/lib/routing/candidate-generator"
import type { AnchorSet } from "@/lib/routing/destination-corridors"

const start = { lat: 40.2, lon: -76.9, label: "Start" }
const finish = { lat: 40.3, lon: -76.7, label: "Finish" }

function destinationRequest() {
  return normalizeRouteRequest({ profile: "twisty", points: [start, finish] })
}

describe("bounded route candidate generator", () => {
  it("keeps source labels and caps verified corridor requests", () => {
    const anchorSets: AnchorSet[] = [
      { id: "ridge", label: "Ridge", source: "rig", anchors: [[-76.8, 40.25]], evidenceMiles: 18 },
      { id: "community", label: "Community", source: "hint", anchors: [[-76.82, 40.27]], evidenceMiles: 8 },
      { id: "curve", label: "Curve", source: "curvature", anchors: [[-76.78, 40.22]], evidenceMiles: 5 },
      { id: "extra", label: "Extra", source: "gpx", anchors: [[-76.76, 40.28]], evidenceMiles: 2 }
    ]

    const candidates = generateCorridorCandidates(destinationRequest(), anchorSets, { maxCandidates: 3 })

    expect(candidates).toHaveLength(3)
    expect(candidates.map((candidate) => candidate.source)).toEqual([
      "rig", "community", "road-character"
    ])
    expect(candidates[0]?.request.points).toEqual([
      start,
      { lat: 40.25, lon: -76.8, label: "Ridge" },
      finish
    ])
    expect(candidates.every((candidate) => candidate.request.points.length <= 5)).toBe(true)
  })

  it("drops malformed optional anchors without inventing topology", () => {
    const candidates = generateCorridorCandidates(destinationRequest(), [
      { id: "bad", label: "Bad", source: "rig", anchors: [[Number.NaN, 40.2]], evidenceMiles: 10 },
      { id: "good", label: "Good", source: "rig", anchors: [[-76.8, 40.25]], evidenceMiles: 10 }
    ])

    expect(candidates.map((candidate) => candidate.id)).toEqual(["corridor-good"])
    expect(candidates[0]?.request.points[1]).toEqual({ lat: 40.25, lon: -76.8, label: "Good" })
  })

  it("generates deterministic loop seeds and heading sectors within a hard cap", () => {
    const request = normalizeRouteRequest({
      profile: "adventure",
      points: [{ lat: 40.2, lon: -76.9 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    })
    const candidates = generateLoopCandidates(request, { maxCandidates: 6, headingSectors: [0, 90, 180, 270] })

    expect(candidates).toHaveLength(6)
    expect(candidates[0]).toMatchObject({
      source: "loop-seed",
      request: { roundTrip: { targetMinutes: 120, seed: 17, heading: 45 } }
    })
    expect(candidates.slice(1).every((candidate) => candidate.source === "heading-sector")).toBe(true)
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(6)
    expect(candidates.map((candidate) => candidate.request.roundTrip?.seed)).toEqual([
      17, 118, 219, 320, 421, 522
    ])
  })

  it("rejects an unbounded generator option or wrong loop shape", () => {
    expect(() => generateCorridorCandidates(destinationRequest(), [], { maxCandidates: 0 })).toThrow(/positive integer/)
    expect(() => generateLoopCandidates(destinationRequest())).toThrow(/one start point/)
  })
})
