import { describe, expect, it, vi } from "vitest"
import type { RideIntent } from "@/lib/ai/ride-intent"
import type { PlaceResult } from "@/lib/geocoding/photon"
import { resolveRidePromptWaypoints, type RideStartLocation } from "@/lib/planner/ride-prompt-flow"
import type { Waypoint } from "@/lib/routing/types"

function intent(overrides: Partial<RideIntent> = {}): RideIntent {
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
    source: "local",
    ...overrides
  }
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

function waypoint(label: string, lat: number, lon: number): Waypoint {
  return { label, lat, lon }
}

function placeWaypoint(value: PlaceResult): Waypoint {
  return { label: value.label, lat: value.lat, lon: value.lon }
}

describe("ride prompt waypoint resolution", () => {
  it("requests current location before biasing a destination search on a fresh browser", async () => {
    const current = waypoint("Current location", 40.27, -76.88)
    const destination = place("New Hope, PA", 40.36, -74.95)
    const requestLocation = vi.fn(async (): Promise<RideStartLocation> => ({ waypoint: current, source: "live" }))
    const search = vi.fn(async () => [destination])

    const resolved = await resolveRidePromptWaypoints({
      intent: intent(),
      start: null,
      finish: null,
      requestLocation,
      search
    })

    expect(requestLocation).toHaveBeenCalledOnce()
    expect(search).toHaveBeenCalledWith("New Hope, PA", {
      lat: current.lat,
      lon: current.lon
    })
    expect(resolved).toEqual({
      start: current,
      finish: placeWaypoint(destination),
      locationSource: "live"
    })
  })

  it("resolves an explicit origin before the destination and never asks for GPS", async () => {
    const origin = place("Carlisle, PA", 40.2, -77.19)
    const destination = place("Wellsboro, PA", 41.75, -77.3)
    const requestLocation = vi.fn()
    const search = vi.fn(async (query: string) => query.startsWith("Carlisle")
      ? [origin]
      : [destination])

    const resolved = await resolveRidePromptWaypoints({
      intent: intent({ startQuery: "Carlisle, PA", destinationQuery: "Wellsboro, PA" }),
      start: null,
      finish: null,
      requestLocation,
      search
    })

    expect(search.mock.calls).toEqual([
      ["Carlisle, PA", { lat: 40.2732, lon: -76.8867 }],
      ["Wellsboro, PA", { lat: origin.lat, lon: origin.lon }]
    ])
    expect(requestLocation).not.toHaveBeenCalled()
    expect(resolved).toEqual({
      start: placeWaypoint(origin),
      finish: placeWaypoint(destination),
      locationSource: null
    })
  })

  it("retains an existing start for destination prompts", async () => {
    const start = waypoint("Saved start", 40.1, -75.9)
    const destination = place("Jim Thorpe, PA", 40.87, -75.73)
    const requestLocation = vi.fn()
    const search = vi.fn(async () => [destination])

    await expect(resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "Jim Thorpe" }),
      start,
      finish: null,
      requestLocation,
      search
    })).resolves.toEqual({
      start,
      finish: placeWaypoint(destination),
      locationSource: null
    })

    expect(requestLocation).not.toHaveBeenCalled()
    expect(search).toHaveBeenCalledWith("Jim Thorpe", { lat: start.lat, lon: start.lon })
  })

  it("resolves an explicit Home destination from the rider's saved local Home without a lookup", async () => {
    const start = waypoint("Current location", 40.27, -76.88)
    const home = waypoint("Home", 40.31, -76.71)
    const search = vi.fn()
    const requestLocation = vi.fn()

    await expect(resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "Home" }),
      start,
      finish: null,
      home,
      requestLocation,
      search
    })).resolves.toEqual({ start, finish: home, locationSource: null })

    expect(search).not.toHaveBeenCalled()
    expect(requestLocation).not.toHaveBeenCalled()
  })

  it("requires an explicitly saved Home instead of inferring one", async () => {
    await expect(resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "Home" }),
      start: waypoint("Current location", 40.27, -76.88),
      finish: null,
      home: null,
      requestLocation: vi.fn(),
      search: vi.fn()
    })).rejects.toThrow("Save Home in the route editor before asking for directions home")
  })

  it("fails with the unresolved place in the message", async () => {
    await expect(resolveRidePromptWaypoints({
      intent: intent({ startQuery: "Missing origin" }),
      start: null,
      finish: null,
      requestLocation: vi.fn(),
      search: vi.fn(async () => [])
    })).rejects.toThrow("could not find “Missing origin”")
  })

  it("rejects malformed destination intent before requesting location", async () => {
    const requestLocation = vi.fn()
    await expect(resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: null }),
      start: null,
      finish: null,
      requestLocation,
      search: vi.fn()
    })).rejects.toThrow("Tell me where you want to ride")
    expect(requestLocation).not.toHaveBeenCalled()
  })

  it("resolves only the origin for a loop and leaves the finish unchanged", async () => {
    const start = waypoint("Current location", 40.27, -76.88)
    const finish = waypoint("Old finish", 40.4, -76.7)
    const search = vi.fn()

    await expect(resolveRidePromptWaypoints({
      intent: intent({ mode: "loop", destinationQuery: null }),
      start,
      finish,
      requestLocation: vi.fn(),
      search
    })).resolves.toEqual({ start, finish, locationSource: null })
    expect(search).not.toHaveBeenCalled()
  })
})
