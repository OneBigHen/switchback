import { describe, expect, it } from "vitest"
import { calculateMapViewportInsets } from "@/components/planner/workspace/map-viewport-insets"

describe("workspace map inset defaults", () => {
  it("treats an omitted mode as planning as the public context contract documents", () => {
    expect(calculateMapViewportInsets({
      viewportWidthPx: 390,
      viewportHeightPx: 844
    })).toEqual({ top: 90, right: 34, bottom: 450, left: 34 })

    expect(calculateMapViewportInsets({
      viewportWidthPx: 768,
      viewportHeightPx: 1024
    })).toEqual({ top: 80, right: 70, bottom: 80, left: 363 })
  })

  it("treats a square Medium viewport as portrait like the CSS orientation media feature", () => {
    // CSS orientation: portrait includes square viewports. At 800px the
    // portrait planner is 16px left + 42vw (336px) + 24px camera gutter.
    expect(calculateMapViewportInsets({
      viewportWidthPx: 800,
      viewportHeightPx: 800,
      mode: "planning"
    })).toEqual({ top: 80, right: 70, bottom: 80, left: 376 })
  })
})
