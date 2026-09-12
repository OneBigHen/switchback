import { describe, expect, it } from "vitest"
import { riderLayerLinePaint } from "@/components/planner/map-stage-sources"

describe("Gravel Atlas map presentation", () => {
  it("renders known gravel as a distinct tan dashed road layer", () => {
    const paint = riderLayerLinePaint("gravel-atlas")

    expect(paint["line-color"]).toBe("#B88955")
    expect(paint["line-dasharray"]).toEqual([2, 1.5])
    expect(paint["line-width"]).toBeGreaterThan(2.5)
    expect(paint["line-opacity"]).toBeGreaterThanOrEqual(0.85)
  })

  it("does not apply the gravel dash treatment to unrelated feature layers", () => {
    expect(riderLayerLinePaint("weather")["line-dasharray"]).toBeUndefined()
    expect(riderLayerLinePaint("public-land")["line-dasharray"]).toBeUndefined()
  })
})
