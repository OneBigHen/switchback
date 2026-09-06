import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const mapPlacement = readFileSync(resolve(process.cwd(), "src/app/styles/map-placement.css"), "utf8")
const toolbarStyles = readFileSync(resolve(process.cwd(), "src/components/planner/v2/SketchRouteToolbar.module.css"), "utf8")

describe("route sketch usable-map clearance", () => {
  it("drops the phantom half-sheet clearance while the planner sheet is absent", () => {
    expect(mapPlacement).toContain(`.planner-shell[data-sketching="true"] {
    --sb-map-sheet-clearance: calc(var(--sb-mobile-sheet-bottom) + var(--sb-space-2));
  }`)
  })

  it("keeps the sketch commit and cancel toolbar above phone navigation", () => {
    expect(mapPlacement).toContain(`.planner-shell[data-sketching="true"] .map-sketch-toolbar {
    bottom: calc(var(--sb-mobile-sheet-bottom) + var(--sb-space-2));
  }`)
  })

  it("centers the sketch toolbar in the usable map beside the short-landscape rail", () => {
    expect(mapPlacement).toContain(`.planner-shell[data-sketching="true"] .map-sketch-toolbar {
    bottom: max(20px, calc(env(safe-area-inset-bottom) + 16px));
    left: calc(50% + 40px);
    width: min(360px, calc(100vw - 104px));
  }`)
  })

  it("gives the explicit Plan route action enough room before icon-only mode", () => {
    expect(toolbarStyles).toContain("grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.3fr) minmax(0, 1fr)")
  })
})
