import { beforeEach, describe, expect, it } from "vitest"
import {
  MAP_VIEWPORT_GUTTER_PX,
  calculateMapViewportInsets,
  calculateNavigationFollowInsets,
  calculateRideFollowInsets,
  measureMapViewport,
  resolveRideFollowInsets,
  resolveWorkspaceMapInsets
} from "@/components/planner/workspace/map-viewport-insets"
import { CONTEXT_SHEET_PEEK_HEIGHT_PX } from "@/components/planner/workspace/context-sheet-state"

/**
 * Camera values retained from the legacy implementations where they still
 * match the current workspace topology. Intentional topology retunes are
 * pinned here explicitly so route fitting and the rendered planner cannot
 * silently drift back to different breakpoints.
 */

const PHONE_PORTRAIT = { viewportWidthPx: 390, viewportHeightPx: 844 }
const TALL_COMPACT = { viewportWidthPx: 760, viewportHeightPx: 1024 }
const PHONE_LANDSCAPE = { viewportWidthPx: 844, viewportHeightPx: 390 }
const NARROW_LANDSCAPE = { viewportWidthPx: 667, viewportHeightPx: 375 }
const DESKTOP = { viewportWidthPx: 1440, viewportHeightPx: 900 }
const TABLET_LANDSCAPE = { viewportWidthPx: 1024, viewportHeightPx: 768 }
const TABLET_PORTRAIT = { viewportWidthPx: 768, viewportHeightPx: 1024 }

describe("calculateMapViewportInsets — route-fit goldens", () => {
  it("matches short-landscape medium fit padding", () => {
    expect(calculateMapViewportInsets({ ...PHONE_LANDSCAPE, mode: "planning" }))
      .toEqual({ top: 40, right: 40, bottom: 40, left: 500 })
    expect(calculateMapViewportInsets({ ...PHONE_LANDSCAPE, mode: "ride" }))
      .toEqual({ top: 80, right: 40, bottom: 150, left: 40 })
  })

  it("matches compact short-landscape fit padding", () => {
    expect(calculateMapViewportInsets({ ...NARROW_LANDSCAPE, mode: "planning" }))
      .toEqual({ top: 24, right: 24, bottom: 170, left: 24 })
    expect(calculateMapViewportInsets({ ...NARROW_LANDSCAPE, mode: "ride" }))
      .toEqual({ top: 72, right: 24, bottom: 150, left: 24 })
  })

  it("reserves the rendered medium landscape footprint rather than the legacy desktop inset", () => {
    // adaptive-workspace.css at 1024px: 96px left + 34vw (348px rounded)
    // planner + one 24px camera gutter = 468px. Reserving the old fixed 500px
    // needlessly squeezes the route farther right than the visible pane requires.
    expect(calculateMapViewportInsets({ ...TABLET_LANDSCAPE, mode: "planning" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 468 })
    expect(calculateMapViewportInsets({ ...TABLET_LANDSCAPE, mode: "ride" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 70 })
  })

  it("keeps the tuned wide-desktop panel reservation", () => {
    expect(calculateMapViewportInsets({ ...DESKTOP, mode: "planning" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 500 })
    expect(calculateMapViewportInsets({ ...DESKTOP, mode: "ride" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 70 })
  })

  it("keeps compact portrait on the context-sheet fit", () => {
    expect(calculateMapViewportInsets({ ...PHONE_PORTRAIT, mode: "planning" }))
      .toEqual({ top: 90, right: 34, bottom: 450, left: 34 })
    expect(calculateMapViewportInsets({ ...PHONE_PORTRAIT, mode: "ride" }))
      .toEqual({ top: 90, right: 34, bottom: 250, left: 34 })
  })

  it("reserves the rendered medium portrait footprint instead of a fixed 500px", () => {
    // adaptive-workspace.css at 768px portrait: 16px left + 42vw (323px rounded)
    // planner + one 24px camera gutter = 363px. This keeps the selected route
    // centered in the actually visible map region rather than a narrow far-right strip.
    expect(calculateMapViewportInsets({ ...TABLET_PORTRAIT, mode: "planning" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 363 })
    expect(calculateMapViewportInsets({ ...TABLET_PORTRAIT, mode: "ride" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 70 })
  })

  it("reserves a distinct bottom occlusion per sheet detent (UX-004)", () => {
    const base = { ...PHONE_PORTRAIT, mode: "planning" as const }
    expect(CONTEXT_SHEET_PEEK_HEIGHT_PX).toBe(146)
    // Peek reserves its rendered sheet height plus the 84px navigation-rail
    // anchor and one gutter; half and full reserve their container fractions
    // (capped so the full sheet cannot consume the entire viewport).
    const peek = calculateMapViewportInsets({ ...base, sheetDetent: "peek" }).bottom
    const half = calculateMapViewportInsets({ ...base, sheetDetent: "half" }).bottom
    const full = calculateMapViewportInsets({ ...base, sheetDetent: "full" }).bottom
    expect(peek).toBe(CONTEXT_SHEET_PEEK_HEIGHT_PX + 84 + MAP_VIEWPORT_GUTTER_PX)
    expect(half).toBe(Math.round(PHONE_PORTRAIT.viewportHeightPx * 0.5) + 84 + MAP_VIEWPORT_GUTTER_PX)
    expect(full).toBe(Math.min(
      Math.round(PHONE_PORTRAIT.viewportHeightPx * 0.88) + 84 + MAP_VIEWPORT_GUTTER_PX,
      PHONE_PORTRAIT.viewportHeightPx - 90 - 60
    ))
    // Disclosure must monotonically increase the reserved map occlusion:
    // identical values here would re-pin the UX-004 regression.
    expect(peek).toBeLessThan(half)
    expect(half).toBeLessThan(full)
    // Closed/immersive sheets occlude nothing beyond the gutter baseline.
    expect(calculateMapViewportInsets({ ...base, sheetDetent: "closed" }).bottom).toBe(34)
    expect(calculateMapViewportInsets({ ...base, sheetDetent: "immersive" }).bottom).toBe(34)
  })

  it("scales half/full occlusion with height while the workspace remains compact", () => {
    const phone = { ...PHONE_PORTRAIT, mode: "planning" as const, sheetDetent: "half" as const }
    const tallCompact = { ...TALL_COMPACT, mode: "planning" as const, sheetDetent: "half" as const }
    const phoneHalf = calculateMapViewportInsets(phone).bottom
    const tallHalf = calculateMapViewportInsets(tallCompact).bottom
    expect(tallHalf).toBe(Math.round(TALL_COMPACT.viewportHeightPx * 0.5) + 84 + MAP_VIEWPORT_GUTTER_PX)
    expect(tallHalf).toBeGreaterThan(phoneHalf)
  })

  it("keeps the legacy open-sheet reservation when no compact detent is known", () => {
    const base = { ...PHONE_PORTRAIT, mode: "planning" as const }
    expect(calculateMapViewportInsets(base).bottom).toBe(450)
  })

  it("honors an explicit workspace panel width with gutter on wide planning", () => {
    const insets = calculateMapViewportInsets({
      ...DESKTOP,
      mode: "planning",
      workspacePanelWidthPx: 420
    })
    expect(insets.left).toBe(420 + MAP_VIEWPORT_GUTTER_PX)
  })

  it("keeps the tuned panel inset when no panel width is provided on wide desktop", () => {
    const insets = calculateMapViewportInsets({ ...DESKTOP, mode: "planning" })
    expect(insets.left).toBe(500)
  })
})

describe("calculateNavigationFollowInsets — follow-camera goldens", () => {
  it("uses short-landscape, compact, and non-compact camera geometry", () => {
    expect(calculateNavigationFollowInsets(PHONE_LANDSCAPE))
      .toEqual({ top: 112, right: 24, bottom: 52, left: 24 })
    expect(calculateNavigationFollowInsets(NARROW_LANDSCAPE))
      .toEqual({ top: 112, right: 24, bottom: 52, left: 24 })
    expect(calculateNavigationFollowInsets(PHONE_PORTRAIT))
      .toEqual({ top: 220, right: 28, bottom: 92, left: 28 })
    expect(calculateNavigationFollowInsets(TABLET_PORTRAIT))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
    expect(calculateNavigationFollowInsets(DESKTOP))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
  })
})

describe("camera breakpoint parity", () => {
  it("keeps route fitting and follow camera on the same non-compact side above 760 px", () => {
    const viewport = { viewportWidthPx: 780, viewportHeightPx: 900 }
    expect(calculateNavigationFollowInsets(viewport))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
    expect(calculateMapViewportInsets({ ...viewport, mode: "planning" }))
      .toEqual({ top: 80, right: 70, bottom: 80, left: 500 })
  })
})

describe("one map-visible-region measurement", () => {
  const mapWithCanvas = (clientWidth: number, clientHeight: number) => ({
    getContainer: () => ({ clientWidth, clientHeight })
  })

  beforeEach(() => {
    // A medium-width device in short landscape whose browser chrome leaves the
    // map canvas much shorter than the window reports.
    window.innerWidth = 844
    window.innerHeight = 390
  })

  it("measures the map canvas, not the browser window", () => {
    expect(measureMapViewport(mapWithCanvas(844, 320)))
      .toEqual({ viewportWidthPx: 844, viewportHeightPx: 320 })
  })

  it("falls back to the window only for a map double with no container", () => {
    expect(measureMapViewport({}))
      .toEqual({ viewportWidthPx: 844, viewportHeightPx: 390 })
    expect(measureMapViewport(null))
      .toEqual({ viewportWidthPx: 844, viewportHeightPx: 390 })
  })

  it("gives route fitting and sketch fitting identical insets for one canvas", () => {
    // The sketch's preserved geography and the polyline drawn on screen must
    // agree after the camera moves, which they cannot if the two callers
    // measure different rectangles.
    const map = mapWithCanvas(844, 320)
    expect(resolveWorkspaceMapInsets(map, { sheetDetentOverride: "half" }))
      .toEqual(resolveWorkspaceMapInsets(map, { mode: "planning", sheetDetentOverride: "half" }))
    expect(resolveWorkspaceMapInsets(map))
      .toEqual(calculateMapViewportInsets({
        viewportWidthPx: 844,
        viewportHeightPx: 320,
        mode: "planning",
        sheetDetent: "half"
      }))
  })

  it("keeps the follow camera on the same canvas as every other fit", () => {
    const map = mapWithCanvas(844, 320)
    expect(resolveRideFollowInsets(map)).toEqual(
      calculateRideFollowInsets({ viewportWidthPx: 844, viewportHeightPx: 320, mode: "ride" })
    )
    // The window would have produced a different short-landscape verdict.
    expect(resolveRideFollowInsets(map)).not.toEqual(
      calculateRideFollowInsets({ viewportWidthPx: 844, viewportHeightPx: 390, mode: "ride" })
    )
  })
})
