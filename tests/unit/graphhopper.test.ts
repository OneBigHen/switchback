import { describe, expect, it, vi } from "vitest"
import {
  createRouteId,
  createGraphHopperRequest,
  estimateRoundTripDistanceMeters,
  requestGraphHopperRoutes
} from "@/lib/routing/graphhopper"

const responseFixture = {
  paths: [
    {
      distance: 61128.978,
      time: 4335684,
      ascend: 420,
      descend: 390,
      points: {
        type: "LineString",
        coordinates: [
          [-76.8867, 40.2732],
          [-76.7, 40.15],
          [-76.5, 40.2],
          [-76.3055, 40.0379]
        ]
      },
      snapped_waypoints: {
        type: "LineString",
        coordinates: [
          [-76.8866, 40.2731],
          [-76.3054, 40.038]
        ]
      },
      instructions: [
        { distance: 1000, time: 80000, sign: 0, text: "Continue", street_name: "Market Street", interval: [0, 1] },
        { distance: 800, time: 60000, sign: 2, text: "Turn right", street_name: "River Road", interval: [1, 2] }
      ],
      details: {
        road_class: [
          [0, 1, "primary"],
          [1, 3, "secondary"]
        ],
        surface: [[0, 3, "asphalt"]]
      }
    }
  ]
}

describe("GraphHopper provider", () => {
  it("creates stable route IDs that distinguish equal-length geometries", () => {
    const first = createRouteId("twisty", [[-77, 41], [-76.5, 41.2]], 0)
    const second = createRouteId("twisty", [[-77, 41], [-76.4, 41.1]], 0)

    expect(first).toBe(createRouteId("twisty", [[-77, 41], [-76.5, 41.2]], 0))
    expect(first).not.toBe(second)
  })

  it("converts product coordinates and profile into a GraphHopper POST body", () => {
    expect(
      createGraphHopperRequest({
        profile: "twisty",
        points: [
          { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
          { lat: 40.0379, lon: -76.3055, label: "Lancaster" }
        ]
      })
    ).toMatchObject({
      profile: "motorcycle_twisty",
      points: [
        [-76.8867, 40.2732],
        [-76.3055, 40.0379]
      ],
      points_encoded: false,
      instructions: true,
      algorithm: "alternative_route",
      "alternative_route.max_paths": 3,
      details: ["road_class", "surface", "track_type", "max_speed"]
    })
  })

  it("removes motorway and trunk roads from quick routes when highways are avoided", () => {
    const body = createGraphHopperRequest({
      profile: "quick",
      avoidHighways: true,
      points: [
        { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
        { lat: 39.9526, lon: -75.1652, label: "Philadelphia" }
      ]
    })

    expect(body).toMatchObject({
      profile: "motorcycle_fastest",
      custom_model: {
        priority: [
          {
            if: "road_class == MOTORWAY || road_class == TRUNK",
            multiply_by: "0"
          }
        ]
      }
    })
  })

  it("uses GraphHopper's FeatureCollection areas and legal in_area condition names", () => {
    const body = createGraphHopperRequest({
      profile: "twisty",
      avoidHighways: true,
      avoidAreas: [{
        id: "closed-bridge",
        polygon: [
          [-76.82, 40.2],
          [-76.8, 40.2],
          [-76.8, 40.22],
          [-76.82, 40.22]
        ]
      }],
      points: [
        { lat: 40.19, lon: -76.9 },
        { lat: 40.3, lon: -76.7 }
      ]
    } as Parameters<typeof createGraphHopperRequest>[0])

    expect(body).toMatchObject({
      custom_model: {
        areas: {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            id: "switchback_avoid_0",
            geometry: {
              type: "Polygon",
              coordinates: [[
                [-76.82, 40.2],
                [-76.8, 40.2],
                [-76.8, 40.22],
                [-76.82, 40.22],
                [-76.82, 40.2]
              ]]
            }
          }]
        },
        priority: expect.arrayContaining([
          { if: "road_class == MOTORWAY || road_class == TRUNK", multiply_by: "0" },
          { if: "in_switchback_avoid_0", multiply_by: "0" }
        ])
      }
    })
  })

  it("keeps the configured profile unchanged when highway avoidance is omitted", () => {
    const body = createGraphHopperRequest({
      profile: "quick",
      points: [
        { lat: 40.2732, lon: -76.8867 },
        { lat: 39.9526, lon: -75.1652 }
      ]
    })

    expect(body).not.toHaveProperty("custom_model")
  })

  it("builds native timeboxed GraphHopper round trips from one fuzzy start", () => {
    expect(estimateRoundTripDistanceMeters("twisty", 120)).toBe(122_310)
    expect(createGraphHopperRequest({
      profile: "twisty",
      points: [{ lat: 40.2732, lon: -76.8867, label: "Around Harrisburg" }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 80 }
    })).toMatchObject({
      profile: "motorcycle_twisty",
      points: [[-76.8867, 40.2732]],
      algorithm: "round_trip",
      "round_trip.distance": 122_310,
      "round_trip.seed": 17
    })
    expect(createGraphHopperRequest({
      profile: "twisty",
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 80 }
    })).toMatchObject({ headings: [80] })
    expect(createGraphHopperRequest({
      profile: "twisty",
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 80 }
    })).not.toHaveProperty("round_trip.heading")
    const roundTripBody = createGraphHopperRequest({
      profile: "twisty",
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 80 }
    })
    expect(Object.hasOwn(roundTripBody, "round_trip.distance")).toBe(true)
  })

  it("normalizes live geometry, instructions, road details, and rider metrics", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responseFixture), { status: 200 }))
    const result = await requestGraphHopperRoutes(
      {
        profile: "twisty",
        points: [
          { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
          { lat: 40.0379, lon: -76.3055, label: "Lancaster" }
        ]
      },
      { baseUrl: "http://router.test", fetcher }
    )

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.engine).toBe("graphhopper")
    expect(result.engineVersion).toBe("11.0")
    expect(result.routes[0].distanceMiles).toBeCloseTo(37.98, 1)
    expect(result.routes[0].durationMinutes).toBeCloseTo(72.26, 1)
    expect(result.routes[0].geometry).toHaveLength(4)
    expect(result.routes[0].instructions[1].streetName).toBe("River Road")
    expect(result.routes[0].roadMix.secondary).toBeGreaterThan(40)
    expect(result.routes[0].surfaceMix.asphalt).toBe(100)
    expect(result.routes[0].routingSource).toBe("live")
    expect(result.routes[0].previewOnly).toBe(false)
  })

  it("preserves loop timebox metadata and a closing waypoint", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responseFixture), { status: 200 }))
    const result = await requestGraphHopperRoutes({
      profile: "adventure",
      points: [{ lat: 40.2732, lon: -76.8867, label: "Near home" }],
      roundTrip: { targetMinutes: 90, seed: 17 }
    }, { baseUrl: "http://router.test", fetcher })

    expect(result.routes[0].loopTargetMinutes).toBe(90)
    expect(result.routes[0].waypoints).toEqual([
      { lat: 40.2731, lon: -76.8866, label: "Near home" },
      { lat: 40.2731, lon: -76.8866, label: "Near home" }
    ])
  })

  it("returns an actionable provider error and never synthetic geometry", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Point 1 is out of bounds" }), { status: 400 })
    )

    await expect(
      requestGraphHopperRoutes(
        {
          profile: "quick",
          points: [
            { lat: 40.2732, lon: -76.8867 },
            { lat: 39.95, lon: -75.16 }
          ]
        },
        { baseUrl: "http://router.test", fetcher }
      )
    ).rejects.toMatchObject({
      code: "OUT_OF_COVERAGE",
      status: 400
    })
  })

  it("does not expose the configured router URL when the connection fails", async () => {
    const internalUrl = "http://graphhopper.internal:8989/private"
    const fetcher = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED while requesting ${internalUrl}`)
    })

    const result = requestGraphHopperRoutes(
      {
        profile: "quick",
        points: [
          { lat: 40.2732, lon: -76.8867 },
          { lat: 40.0379, lon: -76.3055 }
        ]
      },
      { baseUrl: internalUrl, fetcher }
    )

    await expect(result).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      status: 503,
      message: "Cannot reach the routing engine. Check that GraphHopper is running and try again."
    })
    await expect(result).rejects.not.toThrow(internalUrl)
  })
})
