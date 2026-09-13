/**
 * Canonical planner workspace-mode authority.
 *
 * Switchback's planner used to be binary: `<=760px` was the phone bottom-sheet
 * model and everything wider was the desktop deck. That made tablet portrait
 * inherit an oversized phone sheet and tablet landscape inherit a fixed
 * desktop card (see issue #115 and the measured baseline in
 * `docs/quality/sessions/2026-09-10-adaptive-workspace-baseline/`).
 *
 * This module is the single source of truth for that decision. React topology,
 * map insets and the route renderer must all resolve through here rather than
 * each carrying its own `760px` /
 * `window.matchMedia("(max-width: 760px)")` comparison, so they cannot drift
 * apart about how much screen the planner occupies.
 *
 * CSS media queries may keep their own `760px` / `1180px` rules for pure
 * styling as long as they match these boundaries.
 *
 * Resolution is based on available application width only. There is
 * deliberately no user-agent or device sniffing.
 */

export type WorkspaceMode =
  | "compact"
  | "medium"
  | "wide"

/** Widest viewport that still gets the single-pane compact layout. */
export const WORKSPACE_COMPACT_MAX_WIDTH_PX = 760

/** Widest viewport that still counts as medium (tablet / constrained desktop). */
export const WORKSPACE_MEDIUM_MAX_WIDTH_PX = 1180

/**
 * Resolve the workspace mode for a measured application width in CSS pixels.
 *
 *   compact  width <= 760        map + contextual bottom sheet (peek/half/full)
 *   medium   761 <= width <= 1180 first-class tablet / constrained desktop
 *   wide     width >= 1181       bounded planner + live map + inspector
 *
 * A width that carries no layout intent — `NaN` from an unmeasured element,
 * a non-finite value, or a negative node — resolves to `compact`. Compact is
 * the safe fallback: it is the single-pane layout, so it never tries to render
 * two panes into a space that may not be able to hold them. This is also what
 * a server render produces, since there is no viewport to measure.
 */
export function resolveWorkspaceMode(width: number): WorkspaceMode {
  if (!Number.isFinite(width) || width < 0) return "compact"
  if (width <= WORKSPACE_COMPACT_MAX_WIDTH_PX) return "compact"
  if (width <= WORKSPACE_MEDIUM_MAX_WIDTH_PX) return "medium"
  return "wide"
}

/** Whether a width gets the compact single-pane layout. */
export function isCompactWorkspaceWidth(width: number): boolean {
  return resolveWorkspaceMode(width) === "compact"
}

/**
 * The current application width, or `null` when there is no browser viewport
 * to measure (server render, test environment without `window`).
 */
export function readWorkspaceViewportWidth(): number | null {
  if (typeof window === "undefined") return null
  const width = window.innerWidth
  return Number.isFinite(width) ? width : null
}

/**
 * The current workspace mode for the live browser viewport.
 *
 * Returns `compact` when no viewport can be measured, matching
 * {@link resolveWorkspaceMode}'s fallback.
 */
export function resolveCurrentWorkspaceMode(): WorkspaceMode {
  const width = readWorkspaceViewportWidth()
  return width === null ? "compact" : resolveWorkspaceMode(width)
}
