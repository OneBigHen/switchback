import { describe, expect, it, vi } from "vitest"
import {
  parseRidePromptLocally,
  parseStrictRideIntent,
  type RideIntent
} from "@/lib/ai/ride-intent"
import type { PlaceResult } from "@/lib/geocoding/photon"
import {
  resolveRidePromptWaypoints as resolveRidePromptWaypointsCore,
  type RidePromptWaypointOptions,
  type RideStartLocation
} from "@/lib/planner/ride-prompt-flow"
import type { Waypoint } from "@/lib/routing/types"

function waypoint(label: string, lat: number, lon: number): Waypoint {
  return { label, lat, lon }
}

function place(label: string, lat: number, lon: number): PlaceResult {
  return {
    id: label,
    label,
    name: label,
    region: "PA",
    country: "United States",
    lat,
    lon
  }
}

function modelIntent(overrides: Partial<RideIntent> = {}): RideIntent {
  return {
    mode: "destination",
    profile: "scenic",
    rideCharacter: "scenic",
    targetMinutes: null,
    tollPolicy: "allow-with-warning",
    ambiguous: false,
    startQuery: null,
    destinationQuery: "New Hope, PA",
    stopQuery: null,
    preferGravel: false,
    avoidHighways: false,
    summary: "scenic ride to New Hope, PA",
    source: "openrouter",
    ...overrides
  }
}

type AuthorityOptions = RidePromptWaypointOptions & {
  /** Deterministic prompt-derived origin. Model output is never authority. */
  riderStartQuery: string | null
}

function resolveRidePromptWaypoints(options: AuthorityOptions) {
  // The intersection keeps this regression test type-safe while proving the
  // pre-fix resolver ignores origin provenance. Production will make this a
  // first-class required option when the test turns green.
  return resolveRidePromptWaypointsCore(options)
}

describe("ride origin authority", () => {
  it("never geocodes a model-only origin when live GPS is the rider's available start", async () => {
    const gps = waypoint("Current location", 40.27, -76.88)
    const destination = place("New Hope, PA", 40.36, -74.95)
    const invented = place("Dar es Salaam", -6.79, 39.21)
    const requestLocation = vi.fn(async (): Promise<RideStartLocation> => ({
      waypoint: gps,
      source: "live"
    }))
    const search = vi.fn(async (query: string) => query === "Dar es Salaam"
      ? [invented]
      : [destination])

    const resolved = await resolveRidePromptWaypoints({
      intent: modelIntent({ startQuery: "Dar es Salaam" }),
      riderStartQuery: null,
      start: null,
      finish: null,
      requestLocation,
      search
    })

    expect(requestLocation).toHaveBeenCalledOnce()
    expect(search.mock.calls.map(([query]) => query)).toEqual(["New Hope, PA"])
    expect(resolved.start).toEqual(gps)
    expect(resolved.finish).toMatchObject({
      label: destination.label,
      lat: destination.lat,
      lon: destination.lon
    })
  })

  it("keeps an established planner start ahead of a model-only origin", async () => {
    const current = waypoint("Rider start", 40.12, -75.22)
    const destination = place("New Hope, PA", 40.36, -74.95)
    const invented = place("Dar es Salaam", -6.79, 39.21)
    const requestLocation = vi.fn()
    const search = vi.fn(async (query: string) => query === "Dar es Salaam"
      ? [invented]
      : [destination])

    const resolved = await resolveRidePromptWaypoints({
      intent: modelIntent({ startQuery: "Dar es Salaam" }),
      riderStartQuery: null,
      start: current,
      finish: null,
      requestLocation,
      search
    })

    expect(requestLocation).not.toHaveBeenCalled()
    expect(search.mock.calls.map(([query]) => query)).toEqual(["New Hope, PA"])
    expect(resolved.start).toEqual(current)
  })

  it("lets an explicit rider-authored origin outrank planner state without trusting the model", async () => {
    const current = waypoint("Existing start", 40.27, -76.88)
    const carlisle = place("Carlisle, PA", 40.2, -77.19)
    const destination = place("Wellsboro, PA", 41.75, -77.3)
    const invented = place("Dar es Salaam", -6.79, 39.21)
    const requestLocation = vi.fn()
    const search = vi.fn(async (query: string) => {
      if (query === "Carlisle, PA") return [carlisle]
      if (query === "Dar es Salaam") return [invented]
      return [destination]
    })

    const resolved = await resolveRidePromptWaypoints({
      intent: modelIntent({
        startQuery: "Dar es Salaam",
        destinationQuery: "Wellsboro, PA"
      }),
      riderStartQuery: "Carlisle, PA",
      start: current,
      finish: null,
      requestLocation,
      search
    })

    expect(requestLocation).not.toHaveBeenCalled()
    expect(search.mock.calls.map(([query]) => query)).toEqual([
      "Carlisle, PA",
      "Wellsboro, PA"
    ])
    expect(resolved.start).toMatchObject({
      label: carlisle.label,
      lat: carlisle.lat,
      lon: carlisle.lon
    })
  })

  it("does not let ambiguous model output create a hidden origin", async () => {
    const gps = waypoint("Current location", 40.27, -76.88)
    const destination = place("New Hope, PA", 40.36, -74.95)
    const requestLocation = vi.fn(async (): Promise<RideStartLocation> => ({
      waypoint: gps,
      source: "live"
    }))
    const search = vi.fn(async () => [destination])

    const resolved = await resolveRidePromptWaypoints({
      intent: modelIntent({ ambiguous: true, startQuery: "unspecified" }),
      riderStartQuery: null,
      start: null,
      finish: null,
      requestLocation,
      search
    })

    expect(requestLocation).toHaveBeenCalledOnce()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith("New Hope, PA", {
      lat: gps.lat,
      lon: gps.lon
    })
    expect(resolved.start).toEqual(gps)
  })

  it.each([
    "unspecified",
    "unknown",
    "none",
    "n/a",
    "current location",
    "my current location",
    "here"
  ])("normalizes model control-language origin %s to no named origin", (startQuery) => {
    const parsed = parseStrictRideIntent({
      mode: "destination",
      profile: "scenic",
      rideCharacter: "scenic",
      targetMinutes: null,
      tollPolicy: "allow-with-warning",
      ambiguous: false,
      startQuery,
      destinationQuery: "New Hope, PA",
      stopQuery: null,
      preferGravel: false,
      avoidHighways: false,
      summary: "scenic ride to New Hope, PA"
    }, "openrouter")

    expect(parsed.startQuery).toBeNull()
  })

  it("keeps the local parser's destination-only no-origin invariant", () => {
    expect(parseRidePromptLocally("Take me to New Hope, PA")).toMatchObject({
      mode: "destination",
      startQuery: null,
      destinationQuery: "New Hope, PA"
    })
  })

  it("keeps explicit From → To origin truth in the deterministic parser", () => {
    expect(parseRidePromptLocally(
      "Plan a scenic route from Carlisle, PA to Wellsboro, PA"
    )).toMatchObject({
      mode: "destination",
      startQuery: "Carlisle, PA",
      destinationQuery: "Wellsboro, PA"
    })
  })
})
