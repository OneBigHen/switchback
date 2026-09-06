import type { Coordinate } from "@/lib/routing/types"

export interface SculptScreenPoint {
  x: number
  y: number
}

export interface SculptPoint {
  coordinate: Coordinate
  screen: SculptScreenPoint
}

export type RouteSculptState =
  | { kind: "idle" }
  | { kind: "pressed"; routeId: string; start: SculptPoint }
  | { kind: "shaping"; routeId: string; start: SculptPoint; current: SculptPoint }
  | { kind: "menu"; routeId: string; anchor: SculptPoint }
  | { kind: "proposed"; routeId: string; start: SculptPoint; end: SculptPoint }

export type RouteSculptAction =
  | { type: "press"; routeId: string; point: SculptPoint }
  | { type: "move"; point: SculptPoint }
  | { type: "release"; point: SculptPoint }
  | { type: "open-menu"; routeId: string; point: SculptPoint }
  | { type: "cancel" }

export const ROUTE_SCULPT_DRAG_THRESHOLD_PX = 12

function screenDistance(a: SculptScreenPoint, b: SculptScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Pure gesture reducer. It cannot touch planner state, graph matching, or the
 * router. Pointer movement therefore remains presentation-only by design.
 */
export function reduceRouteSculptState(
  state: RouteSculptState,
  action: RouteSculptAction
): RouteSculptState {
  switch (action.type) {
    case "cancel":
      return { kind: "idle" }
    case "open-menu":
      return { kind: "menu", routeId: action.routeId, anchor: action.point }
    case "press":
      return { kind: "pressed", routeId: action.routeId, start: action.point }
    case "move": {
      if (state.kind === "pressed") {
        if (screenDistance(state.start.screen, action.point.screen) < ROUTE_SCULPT_DRAG_THRESHOLD_PX) {
          return state
        }
        return { kind: "shaping", routeId: state.routeId, start: state.start, current: action.point }
      }
      if (state.kind === "shaping") {
        return { ...state, current: action.point }
      }
      return state
    }
    case "release": {
      if (state.kind === "pressed") {
        return { kind: "menu", routeId: state.routeId, anchor: state.start }
      }
      if (state.kind === "shaping") {
        return { kind: "proposed", routeId: state.routeId, start: state.start, end: action.point }
      }
      return state
    }
  }
}
