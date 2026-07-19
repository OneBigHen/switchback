import { describe, expect, it, vi } from "vitest"
import {
  ValhallaProviderError,
  createValhallaRequest,
  requestValhallaRoutes
} from "@/lib/routing/valhalla"
import type { Coordinate, RouteProfileId, RouteRequest } from "@/lib/routing/types"

function encodePolyline6(coordinates: Coordinate[]): string {
  let previousLatitude = 0
  let previousLongitude = 0
  let encoded = ""

  const encodeValue = (delta: number): string => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1
    let chunk = ""
    while (value >= 0x20) {
      chunk += String.fromCharCode((0x20 | (value & 0x1f)) + 63)
      value >>= 5
    }
    return chunk + String.fromCharCode(value + 63)
  }

  for (const [longitude, latitude] of coordinates) {
    const scaledLatitude = Math.round(latitude * 1e6)
    const scaledLongitude = Math.round(longitude * 1e6)
    encoded += encodeValue(scaledLatitude - previousLatitude)
    encoded += encodeValue(scaledLongitude - previousLongitude)
    previousLatitude = scaledLatitude
    previousLongitude = scaledLongitude
  }

  return encoded
}

function expectGeometryClose(actual: Coordinate[], expected: Coordinate[]): void {
  expect(actual).toHaveLength(expected.length)
  expected.forEach(([expectedLongitude, expectedLatitude], index) => {
    expect(actual[index][0]).toBeCloseTo(expectedLongitude, 6)
    expect(actual[index][1]).toBeCloseTo(expectedLatitude, 6)
  })
}

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 40.0379, lon: -76.3055, label: "Lancaster" }

function routeRequest(profile: RouteProfileId = "twisty"): RouteRequest {
  return { profile, points: [start, finish] }
}

describe("Valhalla provider", () => {
  it.each([
    ["quick", { use_highways: 0.8 }],
    ["twisty", { use_highways: 0.1 }],
    ["scenic", { use_highways: 0.2 }],
    ["adventure", { use_highways: 0.1, use_tracks: 0.8, use_trails: 0.8, use_living_streets: 0.5 }]
  ] satisfies [RouteProfileId, Record<string, number>][]) (
    "uses valid motorcycle costing options for the %s profile",
    (profile, expectedOptions) => {
      const body = createValhallaRequest(routeRequest(profile))

      expect(body).toMatchObject({
        costing: "motorcycle",
        costing_options: { motorcycle: expectedOptions },
        units: "miles",
        directions_type: "instructions",
        format: "json",
        alternates: 2
      })
      expect(body).not.toHaveProperty("directions")
      expect(body).not.toHaveProperty("elevation")
      expect(body).not.toHaveProperty("costing_options.motorcycle.motorcycle_type")
    }
  )

  it("marks intermediate locations as through and sends closed avoid polygons", () => {
    const body = createValhallaRequest({
      profile: "scenic",
      points: [
        start,
        { lat: 40.2446, lon: -76.5294, label: "River stop" },
        finish
      ],
      avoidAreas: [{
        id: "bridge-work",
        name: "Bridge work",
        polygon: [
          [-76.7, 40.1],
          [-76.6, 40.1],
          [-76.6, 40.2],
          [-76.7, 40.2]
        ]
      }]
    })

    expect(body).toMatchObject({
      locations: [
        { lat: start.lat, lon: start.lon, type: "break", name: "Harrisburg" },
        { lat: 40.2446, lon: -76.5294, type: "through", name: "River stop" },
        { lat: finish.lat, lon: finish.lon, type: "break", name: "Lancaster" }
      ],
      alternates: 0,
      exclude_polygons: [[
        [-76.7, 40.1],
        [-76.6, 40.1],
        [-76.6, 40.2],
        [-76.7, 40.2],
        [-76.7, 40.1]
      ]]
    })
  })

  it("rejects native round trips before calling Valhalla", async () => {
    const request: RouteRequest = {
      profile: "twisty",
      points: [start],
      roundTrip: { targetMinutes: 90, seed: 7 }
    }
    const fetcher = vi.fn<typeof fetch>()

    expect(() => createValhallaRequest(request)).toThrowError(ValhallaProviderError)
    await expect(
      requestValhallaRoutes(request, { baseUrl: "http://router.test", fetcher })
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_REQUEST",
      status: 422,
      message: expect.stringContaining("round trips")
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("normalizes the primary trip and top-level alternatives as complete routes", async () => {
    const primaryGeometry: Coordinate[] = [
      [-76.886611, 40.273111],
      [-76.6, 40.15],
      [-76.305411, 40.037811]
    ]
    const alternativeGeometry: Coordinate[] = [
      [-76.886622, 40.273122],
      [-76.7, 40.05],
      [-76.305422, 40.037822]
    ]
    const payload = {
      trip: {
        units: "kilometers",
        summary: { length: 22, time: 2400 },
        locations: [
          { lat: 40.273111, lon: -76.886611, original_index: 0 },
          { lat: 40.037811, lon: -76.305411, original_index: 1 }
        ],
        legs: [{
          shape: encodePolyline6(primaryGeometry),
          summary: { length: 22, time: 2400 },
          maneuvers: [{
            type: 10,
            instruction: "Turn right onto River Road.",
            street_names: ["River Road"],
            length: 22,
            time: 2400,
            begin_shape_index: 0,
            end_shape_index: 2
          }]
        }]
      },
      alternates: [{
        trip: {
          units: "miles",
          summary: { length: 15, time: 1800 },
          locations: [
            { lat: 40.273122, lon: -76.886622, original_index: 0 },
            { lat: 40.037822, lon: -76.305422, original_index: 1 }
          ],
          legs: [{
            shape: encodePolyline6(alternativeGeometry),
            summary: { length: 15, time: 1800 },
            maneuvers: [{
              type: 8,
              instruction: "Continue on Ridge Road.",
              street_names: ["Ridge Road"],
              length: 15,
              time: 1800,
              begin_shape_index: 0,
              end_shape_index: 2
            }]
          }]
        }
      }]
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))

    const result = await requestValhallaRoutes(routeRequest(), {
      baseUrl: "http://router.test/",
      fetcher
    })

    expect(result.routes).toHaveLength(2)
    expect(result.routes[0]).toMatchObject({
      distanceMiles: 13.67,
      durationMinutes: 40,
      waypoints: [
        { lat: 40.273111, lon: -76.886611, label: "Harrisburg" },
        { lat: 40.037811, lon: -76.305411, label: "Lancaster" }
      ]
    })
    expectGeometryClose(result.routes[0].geometry, primaryGeometry)
    expect(result.routes[0].instructions[0]).toMatchObject({
      distanceMeters: 22_000,
      text: "Turn right onto River Road.",
      streetName: "River Road",
      interval: [0, 2]
    })
    expect(result.routes[1]).toMatchObject({
      distanceMiles: 15,
      durationMinutes: 30
    })
    expectGeometryClose(result.routes[1].geometry, alternativeGeometry)
    expect(result.routes[1].instructions[0].distanceMeters).toBeCloseTo(24_140.16, 2)
  })

  it("merges every trip leg and offsets leg-local maneuver intervals", async () => {
    const firstLeg: Coordinate[] = [
      [-76.886611, 40.273111],
      [-76.7, 40.2],
      [-76.529311, 40.244511]
    ]
    const secondLeg: Coordinate[] = [
      [-76.529311, 40.244511],
      [-76.4, 40.15],
      [-76.305411, 40.037811]
    ]
    const request: RouteRequest = {
      profile: "adventure",
      points: [start, { lat: 40.2446, lon: -76.5294, label: "Stop" }, finish]
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      trip: {
        units: "miles",
        summary: { length: 30, time: 3600 },
        locations: [
          { lat: 40.273111, lon: -76.886611, original_index: 0 },
          { lat: 40.244511, lon: -76.529311, original_index: 1 },
          { lat: 40.037811, lon: -76.305411, original_index: 2 }
        ],
        legs: [
          {
            shape: encodePolyline6(firstLeg),
            summary: { length: 14, time: 1600 },
            maneuvers: [{
              type: 8,
              instruction: "Continue to the stop.",
              length: 14,
              time: 1600,
              begin_shape_index: 0,
              end_shape_index: 2
            }]
          },
          {
            shape: encodePolyline6(secondLeg),
            summary: { length: 16, time: 2000 },
            maneuvers: [
              {
                type: 10,
                instruction: "Turn right after the stop.",
                length: 15,
                time: 1900,
                begin_shape_index: 0,
                end_shape_index: 1
              },
              {
                type: 4,
                instruction: "You have arrived at Lancaster.",
                length: 1,
                time: 100,
                begin_shape_index: 1,
                end_shape_index: 2
              }
            ]
          }
        ]
      }
    }), { status: 200 }))

    const result = await requestValhallaRoutes(request, {
      baseUrl: "http://router.test",
      fetcher
    })

    expect(result.routes).toHaveLength(1)
    expectGeometryClose(result.routes[0].geometry, [
      ...firstLeg,
      ...secondLeg.slice(1)
    ])
    expect(result.routes[0].instructions.map((instruction) => instruction.interval)).toEqual([
      [0, 2],
      [2, 3],
      [3, 4]
    ])
    expect(result.routes[0].instructions.map((instruction) => instruction.text)).toEqual([
      "Continue to the stop.",
      "Turn right after the stop.",
      "You have arrived at Lancaster."
    ])
  })

  it("maps Valhalla turns to the maneuver signs consumed by the planner", async () => {
    const maneuverTypes = [9, 10, 11, 14, 15, 16, 23, 24, 26, 37, 38, 4]
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      trip: {
        units: "miles",
        summary: { length: 1, time: 60 },
        locations: [start, finish],
        legs: [{
          shape: encodePolyline6([
            [-76.8867, 40.2732],
            [-76.87, 40.26]
          ]),
          summary: { length: 1, time: 60 },
          maneuvers: maneuverTypes.map((type, index) => ({
            type,
            instruction: `Maneuver ${type}`,
            begin_shape_index: index === 0 ? 0 : 1,
            end_shape_index: 1
          }))
        }]
      }
    }), { status: 200 }))

    const result = await requestValhallaRoutes(routeRequest(), {
      baseUrl: "http://router.test",
      fetcher
    })

    expect(result.routes[0].instructions.map((instruction) => instruction.sign)).toEqual([
      7,
      8,
      98,
      -98,
      -8,
      -7,
      3,
      -3,
      6,
      2,
      -2,
      4
    ])
  })

  it("preserves actionable Valhalla error details", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error_code: 171,
      error: "No suitable edges near location"
    }), { status: 400 }))

    await expect(
      requestValhallaRoutes(routeRequest("quick"), {
        baseUrl: "http://router.test",
        fetcher
      })
    ).rejects.toMatchObject({
      code: "OUT_OF_COVERAGE",
      status: 400,
      message: expect.stringMatching(/171.*No suitable edges near location/)
    })
  })
})
