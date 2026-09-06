import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const designSystem = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")
const plannerShell = readFileSync(resolve(process.cwd(), "src/app/styles/planner-shell.css"), "utf8")

describe("route sketch usable-map clearance", () => {
  it("drops the phantom half-sheet clearance while the planner sheet is absent", () => {
    expect(designSystem).toContain(`.planner-shell[data-sketching="true"] {
    --sb-map-sheet-clearance: calc(var(--sb-mobile-sheet-bottom) + var(--sb-space-2));
  }`)
  })

  it("keeps the sketch commit and cancel toolbar above phone navigation", () => {
    expect(plannerShell).toContain(`.planner-shell[data-sketching="true"] .map-sketch-toolbar {
      bottom: calc(var(--sb-mobile-sheet-bottom) + var(--sb-space-2));
    }`)
  })

  it("centers the sketch toolbar in the usable map beside the short-landscape rail", () => {
    expect(plannerShell).toContain(`.planner-shell[data-sketching="true"] .map-sketch-toolbar {
      left: calc(50% + 40px);
      width: min(360px, calc(100vw - 104px));
    }`)
  })
})
