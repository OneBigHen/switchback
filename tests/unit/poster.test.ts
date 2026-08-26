import { describe, expect, it } from "vitest"
import { buildPosterSpec } from "@/lib/gpx/poster"

describe("buildPosterSpec", () => {
  it("returns null for degenerate geometry", () => {
    expect(buildPosterSpec([])).toBeNull()
    expect(buildPosterSpec([[-76, 40]])).toBeNull()
  })

  it("fits a square route inside the poster box with padding intact", () => {
    const square: Array<[number, number]> = [
      [-76, 40],
      [-75.5, 40],
      [-75.5, 40.5],
      [-76, 40.5],
      [-76, 40]
    ]
    const spec = buildPosterSpec(square, { width: 600, height: 750, padding: 40 })
    expect(spec).not.toBeNull()
    const xs = spec!.segments.flatMap((s) => s.path.match(/-?[\d.]+/g)!.filter((_, i) => i % 2 === 0).map(Number))
    const ys = spec!.segments.flatMap((s) => s.path.match(/-?[\d.]+/g)!.filter((_, i) => i % 2 === 1).map(Number))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(39)
    expect(Math.max(...xs)).toBeLessThanOrEqual(561)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(39)
    expect(Math.max(...ys)).toBeLessThanOrEqual(711)
  })

  it("marks start and end points from the route ends", () => {
    const line: Array<[number, number]> = [[-76, 40], [-75.9, 40.1], [-75.8, 40.2]]
    const spec = buildPosterSpec(line)!
    // Start is the southernmost point (drawn last in y-flipped view space).
    expect(spec.start.y).toBeGreaterThan(spec.end.y - 1)
    expect(spec.segments.length).toBeGreaterThan(0)
  })

  it("splits long geometry into multiple curvature-banded segments", () => {
    const squiggle: Array<[number, number]> = []
    for (let i = 0; i < 2000; i += 1) {
      squiggle.push([-76 + i * 0.001, 40 + Math.sin(i / 6) * 0.02])
    }
    const spec = buildPosterSpec(squiggle, { maxPointsPerSegment: 250 })
    expect(spec).not.toBeNull()
    expect(spec!.segments.length).toBeGreaterThanOrEqual(5) // 1400 pts / 250 ≈ 6 chunks
    for (const segment of spec!.segments) {
      expect(segment.curvature).toBeGreaterThanOrEqual(0)
      expect(segment.curvature).toBeLessThanOrEqual(180)
    }
  })
})
