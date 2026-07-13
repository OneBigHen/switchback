import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { RouteLibrary } from "@/lib/storage/route-library"
import type { PlannedRoute } from "@/lib/routing/types"

const plannedRoute: PlannedRoute = {
  id: "saved-route",
  name: "Sunday switchbacks",
  profile: "twisty",
  geometry: [
    [-76.9, 40.2],
    [-76.8, 40.3]
  ],
  waypoints: [
    { lat: 40.2, lon: -76.9, label: "Start" },
    { lat: 40.3, lon: -76.8, label: "Finish" }
  ],
  instructions: [],
  distanceMiles: 22,
  durationMinutes: 38,
  ascentMeters: 220,
  descentMeters: 210,
  twistiness: 71,
  turnCount: 31,
  roadMix: { secondary: 80 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false
}

describe("local route library", () => {
  let library: RouteLibrary

  beforeEach(() => {
    library = new RouteLibrary(`switchback-test-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await library.destroy()
  })

  it("saves and restores full routed geometry without an account", async () => {
    await library.save(plannedRoute, "Coffee at the halfway point")
    const restored = await library.get(plannedRoute.id)

    expect(restored).toMatchObject({
      id: "saved-route",
      name: "Sunday switchbacks",
      notes: "Coffee at the halfway point",
      geometry: plannedRoute.geometry,
      routingSource: "live",
      previewOnly: false
    })
    expect(restored?.createdAt).toBeTruthy()
    expect(restored?.updatedAt).toBeTruthy()
  })

  it("updates notes without replacing the original creation time", async () => {
    const first = await library.save(plannedRoute, "First note")
    const second = await library.save({ ...plannedRoute, name: "Renamed ride" }, "Second note")

    expect(second.createdAt).toBe(first.createdAt)
    expect(second.name).toBe("Renamed ride")
    expect(second.notes).toBe("Second note")
  })

  it("lists newest routes first and deletes intentionally", async () => {
    await library.save(plannedRoute)
    await library.save({ ...plannedRoute, id: "newer", name: "Newer ride" })

    expect((await library.list()).map((route) => route.id)).toEqual(["newer", "saved-route"])
    await library.remove("saved-route")
    expect(await library.get("saved-route")).toBeUndefined()
  })
})
