import { describe, expect, it, vi } from "vitest"
import {
  createRouteId,
  createGraphHopperRequest,
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
      details: ["road_class", "surface", "track_type"]
    })
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
