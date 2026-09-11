import { describe, expect, it } from "vitest"

describe("route waypoint tolerance authority", () => {
  it("exports one shared tolerance for route inclusion and advisor stop matching", async () => {
    const scoring = await import("@/lib/routing/scoring")
    expect((scoring as Record<string, unknown>).WAYPOINT_ROUTE_TOLERANCE_METERS).toBe(25)
  })
})
