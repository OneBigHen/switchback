import { describe, expect, it } from "vitest"
import {
  CONTEXT_SHEET_EXPAND_ORDER,
  CONTEXT_SHEET_FULL_FRACTION,
  CONTEXT_SHEET_HALF_FRACTION,
  CONTEXT_SHEET_PEEK_HEIGHT_PX,
  collapseSheetDetent,
  detentFromLegacySheetState,
  enterImmersive,
  exitImmersive,
  expandSheetDetent,
  isImmersive,
  sheetVisibleHeight,
  type ContextSheetDetent
} from "@/components/planner/workspace/context-sheet-state"

describe("context sheet detents", () => {
  it("walks the expand ladder from closed to full", () => {
    let detent: ContextSheetDetent = "closed"
    const walked: ContextSheetDetent[] = [detent]
    for (let step = 0; step < 3; step += 1) {
      const next = expandSheetDetent(detent)
      expect(next).not.toBeNull()
      detent = next!
      walked.push(detent)
    }
    expect(walked).toEqual(["closed", "peek", "half", "full"])
    expect(expandSheetDetent("full")).toBeNull()
  })

  it("walks the collapse ladder back down and stops at closed", () => {
    let detent: ContextSheetDetent = "full"
    const walked: ContextSheetDetent[] = [detent]
    for (let step = 0; step < 3; step += 1) {
      const next = collapseSheetDetent(detent)
      expect(next).not.toBeNull()
      detent = next!
      walked.push(detent)
    }
    expect(walked).toEqual(["full", "half", "peek", "closed"])
    expect(collapseSheetDetent("closed")).toBeNull()
  })

  it("refuses to expand or collapse through immersive", () => {
    expect(expandSheetDetent("immersive")).toBeNull()
    expect(collapseSheetDetent("immersive")).toBeNull()
  })

  it("enters immersive from any detent and restores the origin once", () => {
    for (const origin of CONTEXT_SHEET_EXPAND_ORDER) {
      const immersive = enterImmersive(origin)
      expect(isImmersive(immersive)).toBe(true)
      expect(immersive.restoreDetent).toBe(origin)
      // Entering immersive twice must not stack restore targets.
      const again = enterImmersive(immersive)
      expect(again).toEqual(immersive)
      expect(exitImmersive(again)).toBe(origin)
    }
  })

  it("maps the legacy expanded/collapsed sheet states without behavior change", () => {
    expect(detentFromLegacySheetState("expanded")).toBe("half")
    expect(detentFromLegacySheetState("collapsed")).toBe("peek")
  })

  it("computes visible heights from the named spec constants", () => {
    expect(sheetVisibleHeight("peek", 844)).toBe(Math.min(CONTEXT_SHEET_PEEK_HEIGHT_PX, 844))
    expect(sheetVisibleHeight("peek", 80)).toBe(80)
    expect(sheetVisibleHeight("half", 844)).toBe(Math.round(844 * CONTEXT_SHEET_HALF_FRACTION))
    expect(sheetVisibleHeight("full", 844)).toBe(Math.round(844 * CONTEXT_SHEET_FULL_FRACTION))
    expect(sheetVisibleHeight("closed", 844)).toBe(0)
    expect(sheetVisibleHeight("immersive", 844)).toBe(0)
  })

  it("treats degenerate containers as zero height", () => {
    expect(sheetVisibleHeight("half", 0)).toBe(0)
    expect(sheetVisibleHeight("half", -10)).toBe(0)
    expect(sheetVisibleHeight("full", Number.NaN)).toBe(0)
  })
})
