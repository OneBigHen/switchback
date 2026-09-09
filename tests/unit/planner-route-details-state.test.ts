import { describe, expect, it } from "vitest"
import {
  openRouteDetails,
  resolveRouteDetails,
  routeSetKey
} from "@/components/planner/planner-route-details-state"

describe("planner route details state", () => {
  const routes = [{ id: "fast" }, { id: "fun" }]

  it("binds details to the exact candidate set that opened them", () => {
    expect(routeSetKey(routes)).toBe("fast|fun")
    expect(openRouteDetails("fun", routes)).toEqual({
      routeId: "fun",
      routeSetKey: "fast|fun"
    })
  })

  it("closes details when canonical selection moves from the opened route", () => {
    const workspace = openRouteDetails("fun", routes)
    expect(resolveRouteDetails(workspace, routes, "fast")).toBeNull()
  })

  it("closes details when a replan changes the candidate set", () => {
    const workspace = openRouteDetails("fun", routes)
    expect(resolveRouteDetails(workspace, [...routes, { id: "new" }], "fun")).toBeNull()
  })

  it("returns the exact selected route while the workspace is current", () => {
    const detailedRoutes = [{ id: "fast", name: "Fast" }, { id: "fun", name: "Fun" }]
    const workspace = openRouteDetails("fun", detailedRoutes)
    expect(resolveRouteDetails(workspace, detailedRoutes, "fun")).toBe(detailedRoutes[1])
  })
})
