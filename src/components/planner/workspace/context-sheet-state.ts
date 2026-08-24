/**
 * Centralized ContextSheet detent model (CINCO Phase 1).
 *
 * Single source of truth for the sheet's expand/collapse states and their
 * heights. Viewport percentages previously lived only inside sheet CSS;
 * they are named here so camera insets (map-viewport-insets.ts) and future
 * sheet styling share one model instead of scattering magic numbers.
 */

export type ContextSheetDetent =
  | "peek"
  | "half"
  | "full"
  | "immersive"
  | "closed"

/** Spec target: peek exposes roughly 100–130 CSS px of content. */
export const CONTEXT_SHEET_PEEK_HEIGHT_PX = 112
/** Spec target: half covers roughly 45–55% of application content height. */
export const CONTEXT_SHEET_HALF_FRACTION = 0.5
/** Spec target: full covers roughly 85–92% of application content height. */
export const CONTEXT_SHEET_FULL_FRACTION = 0.88

/** Ordered ladders a pointer/keyboard gesture walks through. */
export const CONTEXT_SHEET_EXPAND_ORDER: readonly ContextSheetDetent[] = [
  "closed",
  "peek",
  "half",
  "full"
]

/**
 * The planner deck currently owns a binary expanded/collapsed state
 * (`data-sheet-state`). Until later phases migrate content onto richer
 * detents, the legacy states map onto this model without changing behavior.
 */
export type LegacySheetState = "expanded" | "collapsed"

export function detentFromLegacySheetState(state: LegacySheetState): ContextSheetDetent {
  return state === "expanded" ? "half" : "peek"
}

export function expandSheetDetent(current: ContextSheetDetent): ContextSheetDetent | null {
  switch (current) {
    case "closed": return "peek"
    case "peek": return "half"
    case "half": return "full"
    default: return null
  }
}

export function collapseSheetDetent(current: ContextSheetDetent): ContextSheetDetent | null {
  switch (current) {
    case "full": return "half"
    case "half": return "peek"
    case "peek": return "closed"
    default: return null
  }
}

/**
 * Ride/free-ride surfaces take over the whole map area: the sheet becomes
 * immersive and remembers where to restore. Entering immersive twice keeps
 * the original restore target rather than stacking.
 */
export interface ImmersiveSheetState {
  detent: "immersive"
  /** Detent to restore when ride mode ends; never `immersive`. */
  restoreDetent: Exclude<ContextSheetDetent, "immersive">
}

export function enterImmersive(
  current: ContextSheetDetent | ImmersiveSheetState
): ImmersiveSheetState {
  if (isImmersive(current)) return current
  return {
    detent: "immersive",
    restoreDetent: current === "immersive" ? "half" : current
  }
}

export function exitImmersive(state: ImmersiveSheetState): ContextSheetDetent {
  return state.restoreDetent
}

export function isImmersive(
  state: ContextSheetDetent | ImmersiveSheetState
): state is ImmersiveSheetState {
  return typeof state === "object" && state !== null && state.detent === "immersive"
}

/**
 * Visible sheet height for a given container height. Returns 0 for closed
 * and immersive (the sheet does not occupy the map area); `null` is never
 * returned — callers can treat every detent as a concrete measurement.
 */
export function sheetVisibleHeight(detent: ContextSheetDetent, containerHeightPx: number): number {
  if (!Number.isFinite(containerHeightPx) || containerHeightPx <= 0) return 0
  switch (detent) {
    case "closed":
    case "immersive":
      return 0
    case "peek":
      return Math.min(CONTEXT_SHEET_PEEK_HEIGHT_PX, containerHeightPx)
    case "half":
      return Math.round(containerHeightPx * CONTEXT_SHEET_HALF_FRACTION)
    case "full":
      return Math.round(containerHeightPx * CONTEXT_SHEET_FULL_FRACTION)
  }
}
