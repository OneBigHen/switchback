import { describe, expect, it } from "vitest"
import {
  MAP_VIEWPORT_GUTTER_PX,
  calculateMapViewportInsets,
  calculateNavigationFollowInsets
} from "@/components/planner/workspace/map-viewport-insets"

/**
 * Golden values captured from the legacy implementations this module
 * replaces (routeFitPadding in map-stage-navigation.ts and the padding
 * table in navigation-map.ts). The calculator must reproduce them exactly;
 * intentional retunes happen here, visibly.
 */

const PHONE_PORTRAIT = { viewportWidthPx: 390, viewportHeightPx: 844 }
const PHONE_LANDSCAPE = { viewportWidthPx: 844, viewportHeightPx: 390 }
const NARROW_LANDSCAPE = { viewportWidthPx: 667, viewportHeightPx: 375 }
const DESKTOP = { viewportWidthPx: 1440, viewportHeightPx: 900 }
const TABLET_LANDSCAPE = { viewportWidthPx: 1024, viewportHeightPx: 768 }
const TABLET_PORTRAIT = { viewportWidthPx: 768, viewportHeightPx: 1024 }

describe("calculateMapViewportInsets — route-fit goldens", () => {
  it("matches legacy short-landscape wide fit padding", () => {
    expect(calculateMapViewportInsets({ ...PHONE_LANDSCAPE, mode: "planning" }))
      .toEqual({ top: 40, right: 40, bottom: 40, left: 500 })
    expect(calculateMapViewportInsets({ ...PHONE_LANDSCAPE, mode: "ride" }))
      .toEqual({ top: 80, right: 40, bottom: 150, left: 40 })
  })

  it("matches legacy short-landscape narrow fit padding", () => {
    expect(calculateMapViewportInsets({ ...NARROW_LANDSCAPE, mode: "planning" }))
      .toEqual({ top: 24, right: 24, bottom: 170, left: 24 })
    expect(calculateMapViewportInsets({ ...NARROW_LANDSCAPE, mode: "ride" }))
      .toEqual({ top: 72, right: 24, bottom: 150, left: 24 })
  })

  it("matches legacy desktop and tablet-landscape fit padding", () => {
    for (const viewport of [DESKTOP, TABLET_LANDSCAPE]) {
      expect(calculateMapViewportInsets({ ...viewport, mode: "planning" }))
        .toEqual({ top: 80, right: 70, bottom: 80, left: 500 })
      expect(calculateMapViewportInsets({ ...viewport, mode: "ride" }))
        .toEqual({ top: 80, right: 70, bottom: 80, left: 70 })
    }
  })

  it("matches legacy phone portrait and tablet portrait fit padding", () => {
    for (const viewport of [PHONE_PORTRAIT, TABLET_PORTRAIT]) {
      expect(calculateMapViewportInsets({ ...viewport, mode: "planning" }))
        .toEqual({ top: 90, right: 34, bottom: 450, left: 34 })
      expect(calculateMapViewportInsets({ ...viewport, mode: "ride" }))
        .toEqual({ top: 90, right: 34, bottom: 250, left: 34 })
    }
  })

  it("reserves a distinct bottom occlusion per sheet detent (UX-004)", () => {
    const base = { ...PHONE_PORTRAIT, mode: "planning" as const }
    // Peek reserves its rendered 146px sheet plus the 84px navigation-rail
    // anchor and one gutter; half and full reserve their container fractions
    // (capped so the full sheet cannot consume the entire viewport).
    const peek = calculateMapViewportInsets({ ...base, sheetDetent: "peek" }).bottom
    const half = calculateMapViewportInsets({ ...base, sheetDetent: "half" }).bottom
    const full = calculateMapViewportInsets({ ...base, sheetDetent: "full" }).bottom
    expect(peek).toBe(146 + 84 + MAP_VIEWPORT_GUTTER_PX)
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

  it("scales half/full occlusion with the container height, not a constant", () => {
    const phone = { ...PHONE_PORTRAIT, mode: "planning" as const, sheetDetent: "half" as const }
    const tablet = { ...TABLET_PORTRAIT, mode: "planning" as const, sheetDetent: "half" as const }
    const phoneHalf = calculateMapViewportInsets(phone).bottom
    const tabletHalf = calculateMapViewportInsets(tablet).bottom
    expect(tabletHalf).toBe(Math.round(TABLET_PORTRAIT.viewportHeightPx * 0.5) + 84 + MAP_VIEWPORT_GUTTER_PX)
    expect(tabletHalf).toBeGreaterThan(phoneHalf)
  })

  it("keeps the legacy open-sheet reservation when no detent is known", () => {
    const base = { ...PHONE_PORTRAIT, mode: "planning" as const }
    expect(calculateMapViewportInsets(base).bottom).toBe(450)
  })

  it("honors an explicit workspace panel width with gutter on desktop planning", () => {
    const insets = calculateMapViewportInsets({
      ...DESKTOP,
      mode: "planning",
      workspacePanelWidthPx: 420
    })
    expect(insets.left).toBe(420 + MAP_VIEWPORT_GUTTER_PX)
  })

  it("keeps the legacy panel inset when no panel width is provided", () => {
    const insets = calculateMapViewportInsets({ ...DESKTOP, mode: "planning" })
    expect(insets.left).toBe(500)
  })
})

describe("calculateNavigationFollowInsets — follow-camera goldens", () => {
  it("matches the legacy navigation camera padding table", () => {
    expect(calculateNavigationFollowInsets(PHONE_LANDSCAPE))
      .toEqual({ top: 112, right: 24, bottom: 52, left: 24 })
    expect(calculateNavigationFollowInsets(NARROW_LANDSCAPE))
      .toEqual({ top: 112, right: 24, bottom: 52, left: 24 })
    expect(calculateNavigationFollowInsets(PHONE_PORTRAIT))
      .toEqual({ top: 220, right: 28, bottom: 92, left: 28 })
    // 768 px exceeds the legacy 760 px compact threshold: the follow camera
    // already used its desktop padding there.
    expect(calculateNavigationFollowInsets(TABLET_PORTRAIT))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
    expect(calculateNavigationFollowInsets(DESKTOP))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
  })
})

describe("follow-camera breakpoint parity", () => {
  it("keeps the legacy 760 px desktop threshold distinct from route fit's 800 px", () => {
    // 780 px wide: legacy follow camera used the desktop padding while
    // legacy route fitting used the phone padding. The model preserves both.
    const viewport = { viewportWidthPx: 780, viewportHeightPx: 900 }
    expect(calculateNavigationFollowInsets(viewport))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
    expect(calculateMapViewportInsets({ ...viewport, mode: "planning" }))
      .toEqual({ top: 90, right: 34, bottom: 450, left: 34 })
  })
})
