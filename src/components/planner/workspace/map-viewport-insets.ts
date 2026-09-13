/**
 * Map workspace viewport insets (CINCO Phase 1).
 *
 * One tested value object describing how much of the map is occluded by
 * workspace chrome (context sheet, persistent planning panel, ride HUD).
 * Camera fitting and follow mode consume these insets instead of querying
 * the DOM or scattering per-breakpoint magic numbers.
 *
 * The compact and wide tables retain the legacy camera tuning. Medium is
 * intentionally topology-aware: route fitting mirrors the adaptive planner
 * footprint from `adaptive-workspace.css` so the camera cannot reserve a
 * stale desktop-sized panel on tablets.
 */

import {
  sheetVisibleHeight,
  type ContextSheetDetent
} from "./context-sheet-state"
import {
  WORKSPACE_COMPACT_MAX_WIDTH_PX,
  isCompactWorkspaceWidth,
  readWorkspaceViewportWidth,
  resolveWorkspaceMode
} from "./workspace-mode"

export interface MapViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** Which workspace surface is driving the map right now. */
export type WorkspaceMapMode = "planning" | "ride"

export interface WorkspaceMapContext {
  /** Live drawable map size in CSS pixels (container, not window). */
  viewportWidthPx: number
  viewportHeightPx: number
  /**
   * Application width that owns Compact/Medium/Wide topology. It may differ
   * from the drawable map width when a future workspace uses a true split
   * pane instead of overlaying the planner. Defaults to the map width for pure
   * calculations and lightweight map doubles.
   */
  workspaceWidthPx?: number
  /** Defaults to "planning"; follow-camera insets ignore it. */
  mode?: WorkspaceMapMode
  /**
   * Phone-portrait context sheet detent. The bottom occlusion tracks the
   * visible sheet size: peek reserves its rendered height plus the
   * navigation-rail anchor, half/full reserve their container fractions,
   * and closed/immersive reserve only the gutter baseline.
   */
  sheetDetent?: ContextSheetDetent
  /**
   * Explicit persistent planning-panel width override. Callers that can
   * measure the panel may provide it; one camera gutter is added here.
   */
  workspacePanelWidthPx?: number
}

/** Gutter added between occluding chrome and fitted route geometry. */
export const MAP_VIEWPORT_GUTTER_PX = 24

/**
 * Follow-camera geometry changes immediately after the canonical compact
 * ceiling. Route fitting uses that same compact/non-compact authority below so
 * React topology, camera fitting, orientation changes and split-window resize
 * cannot disagree about whether the persistent planning panel exists.
 */
const NAVIGATION_FOLLOW_DESKTOP_MIN_WIDTH_PX = WORKSPACE_COMPACT_MAX_WIDTH_PX + 1

/*
 * Legacy-tuned occlusion constants. Compact and wide keep these values while
 * Medium derives its left occlusion from the rendered adaptive planner below.
 */
const PLANNING_PANEL_LEFT_INSET_PX = 500
const PLANNING_PHONE_SHEET_BOTTOM_INSET_PX = 450
const RIDE_PHONE_SHEET_BOTTOM_INSET_PX = 250
const PLANNING_SHORT_LANDSCAPE_BOTTOM_INSET_PX = 170
/**
 * The phone sheet floats above the persistent bottom navigation rail
 * (`bottom: calc(84px + safe-area)` in the retired switchback-v1.css).
 */
const PLANNING_PHONE_SHEET_ANCHOR_PX = 84
/** Keep at least a slim map strip (top inset + one gutter) when the full
 *  sheet math would otherwise consume the whole viewport. */
const PLANNING_PHONE_FULL_MIN_MAP_PX = 60

/*
 * Medium planner geometry mirrors `adaptive-workspace.css` exactly:
 *
 * landscape: left 96px, width clamp(312px, 34vw, 400px)
 * portrait:  left 16px, width clamp(320px, 42vw, 360px)
 *
 * Keep these values next to the camera calculator so a CSS topology change
 * has one obvious regression surface: the golden tests in
 * map-viewport-insets.test.ts and workspace-camera-boundary-adversarial.test.ts.
 */
const MEDIUM_LANDSCAPE_PLANNER_LEFT_PX = 96
const MEDIUM_LANDSCAPE_PLANNER_MIN_WIDTH_PX = 312
const MEDIUM_LANDSCAPE_PLANNER_MAX_WIDTH_PX = 400
const MEDIUM_LANDSCAPE_PLANNER_WIDTH_FRACTION = 0.34
const MEDIUM_PORTRAIT_PLANNER_LEFT_PX = 16
const MEDIUM_PORTRAIT_PLANNER_MIN_WIDTH_PX = 320
const MEDIUM_PORTRAIT_PLANNER_MAX_WIDTH_PX = 360
const MEDIUM_PORTRAIT_PLANNER_WIDTH_FRACTION = 0.42

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isShortLandscape(ctx: WorkspaceMapContext): boolean {
  return ctx.viewportHeightPx <= 520 && ctx.viewportWidthPx > ctx.viewportHeightPx
}

function workspaceWidth(ctx: WorkspaceMapContext): number {
  return ctx.workspaceWidthPx ?? ctx.viewportWidthPx
}

function hasPersistentSideWorkspace(ctx: WorkspaceMapContext): boolean {
  return !isCompactWorkspaceWidth(workspaceWidth(ctx))
}

function mediumPlanningPanelLeftInset(ctx: WorkspaceMapContext): number {
  const width = workspaceWidth(ctx)
  // CSS `orientation: portrait` includes square viewports (height >= width).
  const portrait = width <= ctx.viewportHeightPx
  if (portrait) {
    const panelWidth = clamp(
      width * MEDIUM_PORTRAIT_PLANNER_WIDTH_FRACTION,
      MEDIUM_PORTRAIT_PLANNER_MIN_WIDTH_PX,
      MEDIUM_PORTRAIT_PLANNER_MAX_WIDTH_PX
    )
    return Math.round(
      MEDIUM_PORTRAIT_PLANNER_LEFT_PX + panelWidth + MAP_VIEWPORT_GUTTER_PX
    )
  }

  const panelWidth = clamp(
    width * MEDIUM_LANDSCAPE_PLANNER_WIDTH_FRACTION,
    MEDIUM_LANDSCAPE_PLANNER_MIN_WIDTH_PX,
    MEDIUM_LANDSCAPE_PLANNER_MAX_WIDTH_PX
  )
  return Math.round(
    MEDIUM_LANDSCAPE_PLANNER_LEFT_PX + panelWidth + MAP_VIEWPORT_GUTTER_PX
  )
}

function planningPanelLeftInset(ctx: WorkspaceMapContext): number {
  if (ctx.workspacePanelWidthPx != null) {
    return ctx.workspacePanelWidthPx + MAP_VIEWPORT_GUTTER_PX
  }
  if (resolveWorkspaceMode(workspaceWidth(ctx)) === "medium") {
    return mediumPlanningPanelLeftInset(ctx)
  }
  return PLANNING_PANEL_LEFT_INSET_PX
}

/**
 * Insets for fitting a selected route into the unobscured map area.
 * Compact/wide retain the legacy tuning; Medium tracks adaptive planner
 * geometry rather than inheriting the old fixed desktop reservation.
 */
export function calculateMapViewportInsets(ctx: WorkspaceMapContext): MapViewportInsets {
  const mode = ctx.mode ?? "planning"
  const persistentSideWorkspace = hasPersistentSideWorkspace(ctx)
  if (isShortLandscape(ctx)) {
    if (persistentSideWorkspace) {
      return mode === "ride"
        ? { top: 80, right: 40, bottom: 150, left: 40 }
        : { top: 40, right: 40, bottom: 40, left: planningPanelLeftInset(ctx) }
    }
    return mode === "ride"
      ? { top: 72, right: 24, bottom: 150, left: 24 }
      : { top: 24, right: 24, bottom: PLANNING_SHORT_LANDSCAPE_BOTTOM_INSET_PX, left: 24 }
  }
  if (persistentSideWorkspace) {
    if (mode === "planning") {
      return { top: 80, right: 70, bottom: 80, left: planningPanelLeftInset(ctx) }
    }
    return { top: 80, right: 70, bottom: 80, left: 70 }
  }
  // Compact portrait: bottom inset follows the context sheet.
  if (mode === "planning") {
    return {
      top: 90,
      right: 34,
      bottom: sheetDetentBottomInset(ctx.sheetDetent, ctx.viewportHeightPx),
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

function sheetDetentBottomInset(
  detent: ContextSheetDetent | undefined,
  viewportHeightPx: number
): number {
  switch (detent) {
    case "closed":
    case "immersive":
      return 34
    case undefined:
      // Legacy callers that do not know the sheet state keep the tuned
      // open-sheet reservation.
      return PLANNING_PHONE_SHEET_BOTTOM_INSET_PX
    case "peek":
      // Rendered peek height plus the navigation-rail anchor it floats on.
      return sheetVisibleHeight(detent, viewportHeightPx) + PLANNING_PHONE_SHEET_ANCHOR_PX + MAP_VIEWPORT_GUTTER_PX
    case "half":
    case "full": {
      const sheetPx = sheetVisibleHeight(detent, viewportHeightPx)
      const inset = sheetPx + PLANNING_PHONE_SHEET_ANCHOR_PX + MAP_VIEWPORT_GUTTER_PX
      // The full sheet may mathematically cover the viewport; the camera
      // still needs a visible map strip to fit into.
      return Math.min(inset, Math.max(viewportHeightPx - 90 - PLANNING_PHONE_FULL_MIN_MAP_PX, MAP_VIEWPORT_GUTTER_PX))
    }
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
  if (workspaceWidth(ctx) < NAVIGATION_FOLLOW_DESKTOP_MIN_WIDTH_PX) {
    return { top: 220, right: 28, bottom: 92, left: 28 }
  }
  return { top: 150, right: 88, bottom: 100, left: 430 }
}

/**
 * Where the rider's own marker should sit down the usable map, as a fraction
 * of viewport height. Low enough that most of the screen is road the rider has
 * not reached yet, high enough that the marker never hides behind the ride
 * HUD's lower deck.
 */
export const RIDE_FOLLOW_RIDER_SCREEN_FRACTION = 0.68

/**
 * Insets for the motorcycle follow camera.
 *
 * Two things separate these from `calculateNavigationFollowInsets`, which is
 * kept for golden parity with the camera this replaced:
 *
 * - The rider is placed deliberately. Map padding moves the projection's
 *   focal point, so solving `top` for the target fraction puts the marker
 *   consistently low in frame instead of leaving it wherever the old table
 *   happened to land it.
 * - Ride mode has no full-height planning panel, so it no longer reserves one.
 *   The old table's 430 px left inset pushed the rider off to the right of a
 *   panel that is not on screen during a ride.
 */
export function calculateRideFollowInsets(ctx: WorkspaceMapContext): MapViewportInsets {
  const height = ctx.viewportHeightPx
  const base = isShortLandscape(ctx)
    ? { right: 24, bottom: 96, left: 24 }
    : workspaceWidth(ctx) < NAVIGATION_FOLLOW_DESKTOP_MIN_WIDTH_PX
      ? { right: 28, bottom: 260, left: 28 }
      : { right: 88, bottom: 220, left: 88 }

  // Mapbox places the camera target at the centre of the padded box, so a
  // focal point at fraction `f` of the viewport needs `top = 2fH - H + bottom`.
  // Measured against a live ride, the marker tracks the focal point closely at
  // town speeds and rides a little above it at highway speeds, where the
  // camera aims further along the route — so the focal point is set at the
  // rider's own target and the drift stays inside the intended band.
  const focalFraction = RIDE_FOLLOW_RIDER_SCREEN_FRACTION
  const top = Math.round(2 * focalFraction * height - height + base.bottom)
  return {
    // Never let the solved padding collapse the usable map on a short screen.
    top: Math.max(24, Math.min(top, Math.max(24, height - base.bottom - 120))),
    right: base.right,
    bottom: base.bottom,
    left: base.left
  }
}

/**
 * The renderer's own drawable canvas. Both MapLibre and Mapbox validate
 * `fitBounds` padding against this, not against the browser window, and mobile
 * app chrome plus context sheets can make the two differ substantially in short
 * landscape.
 */
export interface MapViewportMeasurable {
  getContainer?(): { clientWidth: number; clientHeight: number } | null | undefined
}

export interface WorkspaceMapInsetOptions {
  mode?: WorkspaceMapMode
  /** The rider's pinned detent, when the workspace has one. */
  sheetDetentOverride?: ContextSheetDetent | null
}

/**
 * The one measurement of the map's visible region.
 *
 * Every camera fit reads this: route fitting, sketch fitting, follow mode.
 * Deriving the size from `window` instead means the preserved geography and the
 * polyline the rider drew on screen disagree once the camera moves, so there is
 * deliberately no second way to ask the question. The window fallback exists
 * only for lightweight map doubles that implement `fitBounds` and nothing else.
 */
export function measureMapViewport(
  map: MapViewportMeasurable | null | undefined
): { viewportWidthPx: number; viewportHeightPx: number } {
  const container = map && typeof map.getContainer === "function" ? map.getContainer() : null
  return {
    viewportWidthPx: container?.clientWidth || window.innerWidth,
    viewportHeightPx: container?.clientHeight || window.innerHeight
  }
}

export function resolveWorkspaceMapInsets(
  map: MapViewportMeasurable | null | undefined,
  options: WorkspaceMapInsetOptions = {}
): MapViewportInsets {
  const measured = measureMapViewport(map)
  // Topology belongs to the app width, while short-landscape and fitBounds
  // validation belong to the actual drawable map canvas. Keep those two
  // measurements explicit rather than letting a future split pane change mode.
  const viewportWidth = readWorkspaceViewportWidth()
  const resolvedWorkspaceWidth = viewportWidth ?? measured.viewportWidthPx
  const phoneViewport = isCompactWorkspaceWidth(resolvedWorkspaceWidth)
  return calculateMapViewportInsets({
    ...measured,
    workspaceWidthPx: resolvedWorkspaceWidth,
    mode: options.mode ?? "planning",
    sheetDetent: options.sheetDetentOverride ?? (phoneViewport ? "peek" : "half")
  })
}

/** The follow camera reads the same canvas and canonical app width as every other fit. */
export function resolveRideFollowInsets(
  map: MapViewportMeasurable | null | undefined
): MapViewportInsets {
  const measured = measureMapViewport(map)
  return calculateRideFollowInsets({
    ...measured,
    workspaceWidthPx: readWorkspaceViewportWidth() ?? measured.viewportWidthPx,
    mode: "ride"
  })
}
