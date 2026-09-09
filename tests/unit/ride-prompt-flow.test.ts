import { describe, expect, it, vi } from "vitest"
import { parseRidePromptLocally, type RideIntent } from "@/lib/ai/ride-intent"
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

function candidate(input: {
  id: string
  name: string
  label: string
  kind?: string
  lat: number
  lon: number
  region?: string
  country?: string
}): PlaceResult {
  return {
    id: input.id,
    name: input.name,
    label: input.label,
    lat: input.lat,
    lon: input.lon,
    region: input.region ?? "Pennsylvania",
    country: input.country ?? "United States",
    ...(input.kind ? { kind: input.kind } : {})
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

  it("prefers the named locality over a closer street sharing the name", async () => {
    const start = waypoint("Current location", 40.27, -76.88)
    const closerStreet = candidate({
      id: "street",
      name: "Lancaster Street",
      label: "Lancaster Street, Swatara Township, Pennsylvania, United States",
      kind: "residential",
      lat: 40.27,
      lon: -76.82
    })
    const requestedCity = candidate({
      id: "city",
      name: "Lancaster",
      label: "Lancaster, Pennsylvania, United States",
      kind: "city",
      lat: 40.0379,
      lon: -76.3055
    })

    const resolved = await resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "Lancaster, PA" }),
      start,
      finish: null,
      requestLocation: vi.fn(),
      search: vi.fn(async () => [closerStreet, requestedCity])
    })

    expect(resolved.finish).toEqual(placeWaypoint(requestedCity))
  })

  it("prefers an exact named locality over an exact-named POI", async () => {
    const start = waypoint("Current location", 40.27, -76.88)
    const closerPoi = candidate({
      id: "church",
      name: "New Hope",
      label: "New Hope, Lower Paxton Township, Pennsylvania, United States",
      kind: "place_of_worship",
      lat: 40.33,
      lon: -76.78
    })
    const requestedTown = candidate({
      id: "town",
      name: "New Hope",
      label: "New Hope, Pennsylvania, United States",
      kind: "town",
      lat: 40.3643,
      lon: -74.9513
    })

    const resolved = await resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "New Hope, PA" }),
      start,
      finish: null,
      requestLocation: vi.fn(),
      search: vi.fn(async () => [closerPoi, requestedTown])
    })

    expect(resolved.finish).toEqual(placeWaypoint(requestedTown))
  })

  it("uses proximity only to break a tie between semantically equivalent localities", async () => {
    const start = waypoint("Current location", 40.0, -75.0)
    const fartherTown = candidate({
      id: "farther",
      name: "Springfield",
      label: "Springfield, Pennsylvania, United States",
      kind: "town",
      lat: 41.0,
      lon: -77.0
    })
    const nearerTown = candidate({
      id: "nearer",
      name: "Springfield",
      label: "Springfield, Pennsylvania, United States",
      kind: "town",
      lat: 40.1,
      lon: -75.1
    })

    const resolved = await resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "Springfield" }),
      start,
      finish: null,
      requestLocation: vi.fn(),
      search: vi.fn(async () => [fartherTown, nearerTown])
    })

    expect(resolved.finish).toEqual(placeWaypoint(nearerTown))
  })

  it("keeps the provider winner for a specific street address", async () => {
    const start = waypoint("Current location", 40.0, -75.0)
    const requestedAddress = candidate({
      id: "address",
      name: "Lancaster Avenue",
      label: "123 Lancaster Avenue, Wayne, Pennsylvania, United States",
      kind: "house",
      lat: 40.044,
      lon: -75.387
    })
    const sameNamedRoad = candidate({
      id: "road",
      name: "Lancaster Avenue",
      label: "Lancaster Avenue, Reading, Pennsylvania, United States",
      kind: "residential",
      lat: 40.33,
      lon: -75.93
    })

    const resolved = await resolveRidePromptWaypoints({
      intent: intent({ destinationQuery: "123 Lancaster Avenue, Wayne, PA" }),
      start,
      finish: null,
      requestLocation: vi.fn(),
      search: vi.fn(async () => [requestedAddress, sameNamedRoad])
    })

    expect(resolved.finish).toEqual(placeWaypoint(requestedAddress))
  })

  it("resolves an explicit Home destination from the rider's saved local Home without a lookup", async () => {
    const start = waypoint("Current location", 40.27, -76.88)
    const home = waypoint("Home", 40.31, -76.71)
    const search = vi.fn()
    const requestLocation = vi.fn()

    await expect(resolveRidePromptWaypoints({
      intent: parseRidePromptLocally("I am getting tired; get me home"),
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
      intent: parseRidePromptLocally("I am getting tired; get me home"),
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
