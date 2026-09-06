import { describe, expect, it } from "vitest"
import {
  reduceRouteSculptState,
  ROUTE_SCULPT_DRAG_THRESHOLD_PX,
  type RouteSculptState,
  type SculptPoint
} from "@/components/planner/route-sculpting-state"

const point = (x: number, y: number, lon = -76.88, lat = 40.27): SculptPoint => ({
  screen: { x, y },
  coordinate: [lon, lat]
})

describe("route sculpt gesture state", () => {
  it("treats movement below the threshold as a tap and opens the menu on release", () => {
    let state: RouteSculptState = { kind: "idle" }
    state = reduceRouteSculptState(state, { type: "press", routeId: "twisty", point: point(100, 100) })
    state = reduceRouteSculptState(state, {
      type: "move",
      point: point(100 + ROUTE_SCULPT_DRAG_THRESHOLD_PX - 1, 100)
    })
    expect(state.kind).toBe("pressed")

    state = reduceRouteSculptState(state, { type: "release", point: point(108, 100) })
    expect(state).toMatchObject({ kind: "menu", routeId: "twisty" })
  })

  it("turns a real drag into a proposed corridor without committing anything", () => {
    let state: RouteSculptState = { kind: "idle" }
    const start = point(100, 100, -76.9, 40.2)
    const end = point(145, 125, -76.8, 40.3)

    state = reduceRouteSculptState(state, { type: "press", routeId: "twisty", point: start })
    state = reduceRouteSculptState(state, { type: "move", point: end })
    expect(state).toMatchObject({ kind: "shaping", routeId: "twisty" })

    state = reduceRouteSculptState(state, { type: "release", point: end })
    expect(state).toEqual({ kind: "proposed", routeId: "twisty", start, end })
  })

  it("cancels any transient state without producing a proposal", () => {
    const shaping: RouteSculptState = {
      kind: "shaping",
      routeId: "twisty",
      start: point(20, 20),
      current: point(80, 80)
    }
    expect(reduceRouteSculptState(shaping, { type: "cancel" })).toEqual({ kind: "idle" })
  })

  it("can open the touch/context menu directly at a selected route point", () => {
    const anchor = point(44, 72, -77.1, 40.4)
    expect(reduceRouteSculptState({ kind: "idle" }, {
      type: "open-menu",
      routeId: "scenic",
      point: anchor
    })).toEqual({ kind: "menu", routeId: "scenic", anchor })
  })
})
