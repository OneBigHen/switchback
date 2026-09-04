import { describe, expect, it } from "vitest"
import {
  MAX_CORRIDOR_SAMPLES,
  MIN_CORRIDOR_ENVELOPE_METERS,
  corridorAdherence,
  corridorEnvelopeMeters,
  corridorLengthMeters,
  corridorShapingAnchors,
  sampleSketchCorridor,
  sketchCorridorContext
} from "@/lib/routing/sketch-corridor"
import type { Coordinate } from "@/lib/routing/types"

/** A due-east stroke of `count` points spanning roughly `spanDegrees`. */
function eastwardStroke(count: number, spanDegrees = 0.4, latitude = 40.2): Coordinate[] {
  return Array.from({ length: count }, (_, index): Coordinate => [
    -77 + (spanDegrees * index) / (count - 1),
    latitude
  ])
}

describe("sketch corridor sampling", () => {
  it("resamples a dense stroke to evenly spaced coordinates and keeps both ends", () => {
    const stroke = eastwardStroke(500)
    const samples = sampleSketchCorridor(stroke)

    expect(samples).toHaveLength(MAX_CORRIDOR_SAMPLES)
    expect(samples[0]).toEqual(stroke[0])
    expect(samples.at(-1)).toEqual(stroke.at(-1))

    // Even spacing: no gap deviates more than 15% from the mean gap.
    const gaps = samples.slice(1).map((sample, index) =>
      corridorLengthMeters([samples[index]!, sample]))
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    for (const gap of gaps) expect(Math.abs(gap - mean) / mean).toBeLessThan(0.15)
  })

  it("drops invalid coordinates and still samples the surviving line end to end", () => {
    const stroke: Coordinate[] = [[-77, 40.2], [Number.NaN, 40.3], [-76.8, 40.2]]
    const samples = sampleSketchCorridor(stroke)

    // A sparsely drawn leg is sampled *up*, not truncated: adherence is
    // measured per sample, so the whole leg has to be represented.
    expect(samples).toHaveLength(MAX_CORRIDOR_SAMPLES)
    expect(samples[0]).toEqual([-77, 40.2])
    expect(samples.at(-1)).toEqual([-76.8, 40.2])
    expect(samples.every(([, latitude]) => latitude === 40.2)).toBe(true)
  })

  it("derives the lateral envelope from the stroke's own length within bounds", () => {
    const short = sampleSketchCorridor(eastwardStroke(20, 0.02))
    const long = sampleSketchCorridor(eastwardStroke(20, 3))

    expect(corridorEnvelopeMeters(short)).toBe(MIN_CORRIDOR_ENVELOPE_METERS)
    expect(corridorEnvelopeMeters(long)).toBeGreaterThan(MIN_CORRIDOR_ENVELOPE_METERS)
    expect(corridorEnvelopeMeters(long)).toBeLessThanOrEqual(8_000)
  })

  it("declines to build a scoring context without a usable stroke", () => {
    expect(sketchCorridorContext(undefined)).toBeUndefined()
    expect(sketchCorridorContext([[-77, 40.2]])).toBeUndefined()
    const context = sketchCorridorContext([[-77, 40.2], [-76.995, 40.2]])
    expect(context?.samples).toHaveLength(2)
    expect(context?.envelopeMeters).toBe(MIN_CORRIDOR_ENVELOPE_METERS)
  })
})

describe("corridor adherence", () => {
  const samples = sampleSketchCorridor(eastwardStroke(40))
  const envelope = corridorEnvelopeMeters(samples)

  it("scores a route that follows the stroke far above one that ignores it", () => {
    const onLine = corridorAdherence(eastwardStroke(60), samples, envelope)
    // ~11 km north of the stroke: well outside any envelope this stroke earns.
    const elsewhere = corridorAdherence(eastwardStroke(60, 0.4, 40.3), samples, envelope)

    expect(onLine.score).toBe(100)
    expect(onLine.coveredShare).toBe(1)
    expect(onLine.meanDeviationMeters).toBeLessThan(10)
    expect(elsewhere.score).toBe(0)
    expect(elsewhere.coveredShare).toBe(0)
    expect(elsewhere.meanDeviationMeters).toBeGreaterThan(envelope)
  })

  it("ranks a route that only covers half the stroke between the two", () => {
    // Follows the first half on the line, then departs due north.
    const half: Coordinate[] = [
      ...eastwardStroke(20, 0.2),
      ...eastwardStroke(20, 0.2, 40.3).map(([lon]): Coordinate => [lon + 0.2, 40.3])
    ]
    const partial = corridorAdherence(half, samples, envelope)

    expect(partial.score).toBeGreaterThan(20)
    expect(partial.score).toBeLessThan(80)
    expect(partial.coveredShare).toBeGreaterThan(0.3)
    expect(partial.coveredShare).toBeLessThan(0.7)
  })

  it("reports no adherence when either line is missing", () => {
    expect(corridorAdherence([], samples, envelope).score).toBe(0)
    expect(corridorAdherence(eastwardStroke(10), [], envelope).score).toBe(0)
  })
})

describe("corridor shaping anchors", () => {
  const samples = sampleSketchCorridor(eastwardStroke(40))

  it("hands back nothing at the loosest relaxation level", () => {
    expect(corridorShapingAnchors(samples, 0)).toEqual([])
  })

  it("spreads anchors across the stroke's interior without repeating one", () => {
    for (const count of [1, 2, 3, 6]) {
      const anchors = corridorShapingAnchors(samples, count)
      expect(anchors).toHaveLength(count)
      expect(new Set(anchors.map((anchor) => anchor.join(","))).size).toBe(count)
      // Interior only: never the rider's own endpoints.
      expect(anchors).not.toContainEqual(samples[0])
      expect(anchors).not.toContainEqual(samples.at(-1))
      // Monotonic along the eastward stroke.
      const longitudes = anchors.map(([lon]) => lon)
      expect([...longitudes].sort((left, right) => left - right)).toEqual(longitudes)
    }
  })

  it("never asks for more anchors than the stroke has interior points", () => {
    const tiny = sampleSketchCorridor(eastwardStroke(3), 3)
    expect(corridorShapingAnchors(tiny, 5)).toHaveLength(1)
    expect(corridorShapingAnchors([[-77, 40.2], [-76.8, 40.2]], 3)).toEqual([])
  })
})
