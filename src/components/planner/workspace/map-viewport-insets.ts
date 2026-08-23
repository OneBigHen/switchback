/**
 * Map workspace viewport insets (CINCO Phase 1).
 *
 * One tested value object describing how much of the map is occluded by
 * workspace chrome (context sheet, persistent planning panel, ride HUD).
 * Camera fitting and follow mode consume these insets instead of querying
 * the DOM or scattering per-breakpoint magic numbers.
 *
 * Parity contract: the calculator reproduces, exactly, the padding tables
 * previously hard-coded in `map-stage-navigation.ts` (`routeFitPadding`)
 * and `navigation-map.ts` (`navigationCameraOptions`). The golden values in
 * `map-viewport-insets.test.ts` pin that equality; later CINCO phases may
 * retune constants here without touching camera code.
 */

import type { ContextSheetDetent } from "./context-sheet-state"

export interface MapViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** Which workspace surface is driving the map right now. */
export type WorkspaceMapMode = "planning" | "ride"

export interface WorkspaceMapContext {
  /** Live map viewport size in CSS pixels (container, not window). */
  viewportWidthPx: number
  viewportHeightPx: number
  /** Defaults to "planning"; follow-camera insets ignore it. */
  mode?: WorkspaceMapMode
  /**
   * Phone-portrait context sheet detent. Legacy behavior maps the deck's
   * expanded/collapsed states to "half"/"peek" (see context-sheet-state);
   * either way the bottom occlusion is the tuned legacy constant below.
   */
  sheetDetent?: ContextSheetDetent
  /**
   * Persistent left planning panel width (desktop/tablet landscape).
   * Legacy fit padding reserved 500 px for this panel plus gutter.
   */
  workspacePanelWidthPx?: number
}

/** Gutter added between occluding chrome and fitted route geometry. */
export const MAP_VIEWPORT_GUTTER_PX = 24

/**
 * The follow camera switched to its desktop layout at a narrower breakpoint
 * (< 760 px) than route fitting (>= 800 px). Both are legacy truths and are
 * preserved exactly until Phase 2 retunes them.
 */
const NAVIGATION_FOLLOW_DESKTOP_MIN_WIDTH_PX = 760

/*
 * Legacy-tuned occlusion constants. These reproduce today's visual camera
 * behavior exactly; Phase 2+ may retune them against the real sheet/panel
 * measurements once the CINCO layout lands.
 */
const PLANNING_PANEL_LEFT_INSET_PX = 500
const PLANNING_PHONE_SHEET_BOTTOM_INSET_PX = 450
const RIDE_PHONE_SHEET_BOTTOM_INSET_PX = 250
const PLANNING_SHORT_LANDSCAPE_BOTTOM_INSET_PX = 170

function isShortLandscape(ctx: WorkspaceMapContext): boolean {
  return ctx.viewportHeightPx <= 520 && ctx.viewportWidthPx > ctx.viewportHeightPx
}

function isWide(ctx: WorkspaceMapContext): boolean {
  return ctx.viewportWidthPx >= 800
}

/**
 * Insets for fitting a selected route into the unobscured map area.
 * Golden-parity replacement for `routeFitPadding`.
 */
export function calculateMapViewportInsets(ctx: WorkspaceMapContext): MapViewportInsets {
  const wide = isWide(ctx)
  if (isShortLandscape(ctx)) {
    if (wide) {
      return ctx.mode === "ride"
        ? { top: 80, right: 40, bottom: 150, left: 40 }
        : { top: 40, right: 40, bottom: 40, left: PLANNING_PANEL_LEFT_INSET_PX }
    }
    return ctx.mode === "ride"
      ? { top: 72, right: 24, bottom: 150, left: 24 }
      : { top: 24, right: 24, bottom: PLANNING_SHORT_LANDSCAPE_BOTTOM_INSET_PX, left: 24 }
  }
  if (wide) {
    // Desktop/tablet landscape planning reserves the left workspace panel.
    if (ctx.mode === "planning") {
      const leftInset = ctx.workspacePanelWidthPx != null
        // Measured panel plus one gutter of breathing room.
        ? ctx.workspacePanelWidthPx + MAP_VIEWPORT_GUTTER_PX
        // Legacy tuning: the deck panel reservation already includes its
        // own gutter; keep it verbatim when no measurement exists.
        : PLANNING_PANEL_LEFT_INSET_PX
      return { top: 80, right: 70, bottom: 80, left: leftInset }
    }
    return { top: 80, right: 70, bottom: 80, left: 70 }
  }
  // Phone portrait: bottom inset follows the context sheet.
  if (ctx.mode === "planning") {
    return {
      top: 90,
      right: 34,
      bottom: sheetDetentBottomInset(ctx.sheetDetent),
      left: 34
    }
  }
  return {
    top: 90,
    right: 34,
    bottom: RIDE_PHONE_SHEET_BOTTOM_INSET_PX,
    left: 34
  }
}

function sheetDetentBottomInset(detent: ContextSheetDetent | undefined): number {
  switch (detent) {
    case "closed":
    case "immersive":
      return 34
    default:
      // Legacy tuning: an open sheet (peek or half) reserves this much.
      return PLANNING_PHONE_SHEET_BOTTOM_INSET_PX
  }
}

/**
 * Insets for the navigation follow camera. Golden-parity replacement for
 * the inline padding table in `navigationCameraOptions`: the follow camera
 * biases the focal point so the road ahead stays visible above the ride HUD.
 */
export function calculateNavigationFollowInsets(ctx: WorkspaceMapContext): MapViewportInsets {
  if (isShortLandscape(ctx)) {
    return { top: 112, right: 24, bottom: 52, left: 24 }
  }
  if (ctx.viewportWidthPx < NAVIGATION_FOLLOW_DESKTOP_MIN_WIDTH_PX) {
    return { top: 220, right: 28, bottom: 92, left: 28 }
  }
  return { top: 150, right: 88, bottom: 100, left: 430 }
}
