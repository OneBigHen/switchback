import { describe, expect, it } from "vitest"
import {
  openRouteDetails,
  resolveRouteDetails,
  routeSetKey
} from "@/components/planner/planner-route-details-state"

/**
 * The preparation surface acts on exactly one route: its directions, its
 * offline pack, its Start ride. Every way that route can change underneath the
 * open workspace has to close it, or the rider's next action lands on a route
 * they are no longer looking at.
 */
describe("planner route details state", () => {
  const routes = [{ id: "fast" }, { id: "fun" }]

  it("binds details to the exact candidate set that opened them", () => {
    expect(routeSetKey(routes)).toBe("fast|fun")
    expect(openRouteDetails("fun", routes)).toEqual({ routeId: "fun", routeSetKey: "fast|fun" })
  })

  it("closes details when canonical selection moves from the opened route", () => {
    const workspace = openRouteDetails("fun", routes)

    expect(resolveRouteDetails(workspace, routes, "fast")).toBeNull()
  })

  it("closes details when a replan changes the candidate set", () => {
    const workspace = openRouteDetails("fun", routes)

    expect(resolveRouteDetails(workspace, [...routes, { id: "new" }], "fun")).toBeNull()
  })

  it("closes details when the same ids arrive in a different order", () => {
    // Progressive alternatives can re-rank the set the rider opened from.
    const workspace = openRouteDetails("fun", routes)

    expect(resolveRouteDetails(workspace, [{ id: "fun" }, { id: "fast" }], "fun")).toBeNull()
  })

  it("returns the exact selected route while the workspace is current", () => {
    const detailed = [{ id: "fast", name: "Fast" }, { id: "fun", name: "Fun" }]
    const workspace = openRouteDetails("fun", detailed)

    expect(resolveRouteDetails(workspace, detailed, "fun")).toBe(detailed[1])
  })

  it("has nothing to resolve before the rider opens a workspace", () => {
    expect(resolveRouteDetails(null, routes, "fun")).toBeNull()
  })
})
