import { describe, expect, it, vi } from "vitest"
import type { RideIntent } from "@/lib/ai/ride-intent"
import { resolveRidePromptWaypoints } from "@/lib/planner/ride-prompt-flow"

const baseIntent: RideIntent = {
  mode: "loop",
  profile: "scenic",
  rideCharacter: "scenic",
  targetMinutes: 90,
  tollPolicy: "allow-with-warning",
  ambiguous: false,
  startQuery: "Austin",
  destinationQuery: null,
  stopQuery: null,
  preferGravel: false,
  avoidHighways: false,
  summary: "90-minute scenic loop",
  source: "local"
}

describe("explicit ride prompt place resolution", () => {
  it("uses the geocoder's top Austin match instead of replacing it with a nearer namesake", async () => {
    const search = vi.fn(async () => [
      {
        id: "austin-tx",
        label: "Austin, Texas, United States",
        name: "Austin",
        region: "Texas",
        country: "United States",
        lat: 30.2672,
        lon: -97.7431
      },
      {
        id: "austin-pa",
        label: "Austin, Pennsylvania, United States",
        name: "Austin",
        region: "Pennsylvania",
        country: "United States",
        lat: 41.64,
        lon: -78.09
      }
    ])

    const resolved = await resolveRidePromptWaypoints({
      intent: baseIntent,
      start: { lat: 40.2732, lon: -76.8867, label: "Current location" },
      finish: null,
      search,
      requestLocation: vi.fn()
    })

    expect(resolved.start.label).toBe("Austin, Texas, United States")
    expect(resolved.start).toMatchObject({ lat: 30.2672, lon: -97.7431 })
  })
})
