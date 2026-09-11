import { describe, expect, it, vi } from "vitest"
import { parseRidePromptLocally, type RideIntent } from "@/lib/ai/ride-intent"
import { enforceRiderOriginAuthority } from "@/lib/client/ride-intent-client"
import type { PlaceResult } from "@/lib/geocoding/photon"
import {
  resolveRidePromptWaypoints,
  type RideStartLocation,
  type RideStartLocationSource
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

function authoritativeIntent(prompt: string, overrides: Partial<RideIntent> = {}): RideIntent {
  return enforceRiderOriginAuthority(prompt, modelIntent(overrides))
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

    const intent = authoritativeIntent("Take me to New Hope, PA", {
      startQuery: "Dar es Salaam"
    })
    const resolved = await resolveRidePromptWaypoints({
      intent,
      start: null,
      finish: null,
      requestLocation,
      search
    })

    expect(intent.startQuery).toBeNull()
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

    const intent = authoritativeIntent("Take me to New Hope, PA", {
      startQuery: "Dar es Salaam"
    })
    const resolved = await resolveRidePromptWaypoints({
      intent,
      start: current,
      finish: null,
      requestLocation,
      search
    })

    expect(intent.startQuery).toBeNull()
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

    const prompt = "Plan a scenic route from Carlisle, PA to Wellsboro, PA"
    const intent = authoritativeIntent(prompt, {
      startQuery: "Dar es Salaam",
      destinationQuery: "Wellsboro, PA"
    })
    const resolved = await resolveRidePromptWaypoints({
      intent,
      start: current,
      finish: null,
      requestLocation,
      search
    })

    expect(intent.startQuery).toBe("Carlisle, PA")
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

    const intent = authoritativeIntent("Take me to New Hope, PA", {
      ambiguous: true,
      startQuery: "unspecified"
    })
    const resolved = await resolveRidePromptWaypoints({
      intent,
      start: null,
      finish: null,
      requestLocation,
      search
    })

    expect(intent.startQuery).toBeNull()
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
    "here",
    "Dar es Salaam"
  ])("replaces model-only origin %s with literal rider-origin truth", (startQuery) => {
    const intent = authoritativeIntent("Take me to New Hope, PA", { startQuery })
    expect(intent.startQuery).toBeNull()
  })

  it.each(["saved", "home", "region"] as const)(
    "fails closed instead of routing a destination from an inferred %s start",
    async (source: RideStartLocationSource) => {
      const inferred = waypoint(`Inferred ${source}`, 40.27, -76.88)
      const search = vi.fn()

      await expect(resolveRidePromptWaypoints({
        intent: authoritativeIntent("Take me to New Hope, PA"),
        start: null,
        finish: null,
        requestLocation: vi.fn(async () => ({ waypoint: inferred, source })),
        search
      })).rejects.toThrow("Enable location access or choose a current start point")

      expect(search).not.toHaveBeenCalled()
    }
  )

  it("keeps inferred fallback starts available for open-ended loop planning", async () => {
    const inferred = waypoint("Approximate loop start", 40.27, -76.88)

    await expect(resolveRidePromptWaypoints({
      intent: modelIntent({
        mode: "loop",
        startQuery: null,
        destinationQuery: null
      }),
      start: null,
      finish: null,
      requestLocation: vi.fn(async (): Promise<RideStartLocation> => ({
        waypoint: inferred,
        source: "region"
      })),
      search: vi.fn()
    })).resolves.toEqual({
      start: inferred,
      finish: null,
      locationSource: "region"
    })
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
