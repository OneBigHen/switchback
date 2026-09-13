import { describe, expect, it } from "vitest"
import { surfaceEvidence } from "@/lib/routes/route-evidence"
import { routeHighlights, routeSizeEyebrow } from "@/lib/routes/route-highlights"

const unknownSurface = surfaceEvidence({})

function input(over: Partial<Parameters<typeof routeHighlights>[0]> = {}) {
  return {
    distanceMiles: 100,
    twistiness: 40,
    turnCount: 100,
    ascentMeters: null,
    profile: null,
    surface: unknownSurface,
    ...over
  }
}

describe("routeSizeEyebrow", () => {
  it("names a genuinely big ride", () => {
    expect(routeSizeEyebrow(180)).toBe("BIG RIDE")
    expect(routeSizeEyebrow(104)).toBe("LONG RIDE")
  })

  it("stays quiet for an ordinary ride", () => {
    expect(routeSizeEyebrow(42)).toBeNull()
    expect(routeSizeEyebrow(0)).toBeNull()
    expect(routeSizeEyebrow(Number.NaN)).toBeNull()
  })
})

describe("routeHighlights", () => {
  it("does not manufacture chips the catalog cannot support", () => {
    const highlights = routeHighlights(input({ distanceMiles: 48, twistiness: 20, turnCount: 30 }))

    expect(highlights).toEqual([])
  })

  it("never claims a surface character from unknown surface evidence", () => {
    const highlights = routeHighlights(input({ surface: unknownSurface }))

    expect(highlights.some((highlight) => highlight.tone === "surface")).toBe(false)
  })

  it("reports a gravel-heavy route from measured surface evidence", () => {
    const surface = surfaceEvidence({
      intelligence: {
        surface: { status: "known", distribution: { gravel: 70, asphalt: 30 }, source: "graphhopper" }
      } as never
    })
    const highlights = routeHighlights(input({ surface }))

    const gravel = highlights.find((highlight) => highlight.id === "gravel-heavy")
    expect(gravel).toBeDefined()
    expect(gravel!.basis).toContain("70%")
  })

  it("separates corner evidence from surface evidence", () => {
    const highlights = routeHighlights(input({ twistiness: 72, turnCount: 240 }))

    expect(highlights.map((highlight) => highlight.id)).toContain("technical")
    expect(highlights.some((highlight) => highlight.tone === "surface")).toBe(false)
  })

  it("does not read corners off a route with no mapped turns", () => {
    expect(routeHighlights(input({ twistiness: 90, turnCount: 0 }))).toEqual([])
  })

  it("marks a full-day commitment by real distance", () => {
    const highlights = routeHighlights(input({ distanceMiles: 210 }))

    expect(highlights.map((highlight) => highlight.id)).toContain("big-ride")
  })

  it("reports sustained climbs only from recorded ascent", () => {
    expect(routeHighlights(input({ ascentMeters: null })).some((h) => h.id === "sustained-climbs")).toBe(false)
    expect(routeHighlights(input({ ascentMeters: 4200, distanceMiles: 100 })).some((h) => h.id === "sustained-climbs")).toBe(true)
  })
})
