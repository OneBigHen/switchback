import { describe, expect, it, vi } from "vitest"
import {
  buildTrafficCorridorBoxes,
  getTomTomRouteTraffic
} from "@/lib/traffic/tomtom"
import type { TrafficRoutePoint } from "@/lib/traffic/types"

const route: TrafficRoutePoint[] = [
  { lat: 40.1746, lon: -75.1068 },
  { lat: 40.2068, lon: -75.1690 },
  { lat: 40.2415, lon: -75.2838 }
]

function denseRoute(): TrafficRoutePoint[] {
  const points: TrafficRoutePoint[] = []
  for (let segment = 0; segment < route.length - 1; segment += 1) {
    const start = route[segment]!
    const end = route[segment + 1]!
    for (let index = 0; index < 40; index += 1) {
      if (segment > 0 && index === 0) continue
      const t = index / 39
      points.push({
        lat: start.lat + (end.lat - start.lat) * t,
        lon: start.lon + (end.lon - start.lon) * t
      })
    }
  }
  return points
}

function tomTomResponse(incidents: unknown[]): Response {
  return new Response(JSON.stringify({ incidents }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}

const closureIncident = {
  type: "Feature",
  properties: {
    id: "incident-closure",
    iconCategory: "roadClosed",
    magnitudeOfDelay: "undefined",
    events: [{ description: "Road closed", iconCategory: "roadClosed" }],
    from: "County Line Rd",
    to: "Street Rd",
    lengthInMeters: 420,
    delayInSeconds: null,
    roadNumbers: ["PA-263"]
  },
  geometry: {
    type: "LineString",
    coordinates: [[-75.1977, 40.215475], [-75.2264, 40.22415]]
  }
}

const jamIncident = {
  type: "Feature",
  properties: {
    id: "incident-jam",
    iconCategory: "jam",
    magnitudeOfDelay: "moderate",
    events: [{ description: "Slow traffic", iconCategory: "jam" }],
    from: "York Rd",
    to: "Bristol Rd",
    lengthInMeters: 1600,
    delayInSeconds: 480,
    roadNumbers: ["PA-611"]
  },
  geometry: {
    type: "Point",
    coordinates: [-75.1379, 40.1907]
  }
}

const nearbyParallelRoadClosure = {
  ...closureIncident,
  properties: {
    ...closureIncident.properties,
    id: "parallel-road-closure",
    events: [{ description: "Parallel road closed", iconCategory: "roadClosed" }]
  },
  geometry: {
    type: "LineString",
    coordinates: [[-75.134, 40.205], [-75.146, 40.211]]
  }
}

describe("buildTrafficCorridorBoxes", () => {
  it("builds buffered bounded boxes around an ordinary PA route", () => {
    const boxes = buildTrafficCorridorBoxes(route)

    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes.length).toBeLessThanOrEqual(8)
    expect(boxes[0].minLat).toBeLessThan(route[0].lat)
    expect(boxes[0].minLon).toBeLessThan(route[0].lon)
    expect(boxes.at(-1)?.maxLat).toBeGreaterThan(route.at(-1)!.lat)
  })

  it("covers a real 400-point sampled ride within the provider fan-out cap", () => {
    // The client samples routes to at most 400 points. A ~30 mile NJ ride at that
    // density previously needed more than 8 fixed 40-point boxes and silently
    // produced no traffic lookup at all.
    const points: TrafficRoutePoint[] = Array.from({ length: 400 }, (_, index) => ({
      lat: 40.7357 - (index / 399) * 0.2495,
      lon: -74.1724 - (index / 399) * 0.2794 + (index % 7) * 0.0004
    }))
    const boxes = buildTrafficCorridorBoxes(points)
    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes.length).toBeLessThanOrEqual(8)
    // Every sampled point is inside some box.
    for (const point of points) {
      expect(boxes.some((box) => point.lat >= box.minLat && point.lat <= box.maxLat && point.lon >= box.minLon && point.lon <= box.maxLon)).toBe(true)
    }
  })

  it("fails closed for a geometry that would require too many huge corridor boxes", () => {
    const points: TrafficRoutePoint[] = Array.from({ length: 20 }, (_, index) => ({
      lat: index % 2 === 0 ? 25 : 48,
      lon: -124 + index * 3
    }))

    expect(buildTrafficCorridorBoxes(points)).toEqual([])
  })
})

describe("getTomTomRouteTraffic", () => {
  it("uses Orbis v2 with server-header authentication and normalizes incidents", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(url).toContain("/maps/orbis/traffic/incidents/details")
      expect(url).toContain("apiVersion=2")
      expect(url).toContain("timeValidity=present")
      expect(url).not.toContain("secret-key")

      const headers = new Headers(init?.headers)
      expect(headers.get("TomTom-Api-Key")).toBe("secret-key")
      expect(headers.get("TomTom-Api-Version")).toBe("2")
      expect(headers.get("Accept-Language")).toBe("en-US")
      expect(headers.get("Attributes")).toContain("delayInSeconds")
      return tomTomResponse([jamIncident, closureIncident])
    })

    const evidence = await getTomTomRouteTraffic(route, {
      apiKey: "secret-key",
      fetcher: fetcher as typeof fetch,
      now: () => new Date("2026-09-12T09:00:00.000Z")
    })

    expect(evidence.provider).toBe("tomtom")
    expect(evidence.status).toBe("available")
    expect(evidence.observedAt).toBe("2026-09-12T09:00:00.000Z")
    expect(evidence.hasClosure).toBe(true)
    expect(evidence.totalDelaySeconds).toBeNull()
    expect(evidence.incidents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "incident-jam", kind: "jam", delaySeconds: 480 }),
      expect.objectContaining({ id: "incident-closure", kind: "closure", description: "Road closed" })
    ]))
  })

  it("filters bbox candidates against route geometry before claiming route traffic", async () => {
    const fetcher = vi.fn(async () => tomTomResponse([
      jamIncident,
      nearbyParallelRoadClosure
    ]))

    const evidence = await getTomTomRouteTraffic(route, {
      apiKey: "secret-key",
      fetcher: fetcher as typeof fetch
    })

    expect(evidence.incidents.map((incident) => incident.id)).toEqual(["incident-jam"])
    expect(evidence.hasClosure).toBe(false)
    expect(evidence.totalDelaySeconds).toBe(480)
  })

  it("deduplicates incidents returned from adjacent corridor boxes", async () => {
    const longerRoute = denseRoute()
    const fetcher = vi.fn(async () => tomTomResponse([jamIncident]))

    const evidence = await getTomTomRouteTraffic(longerRoute, {
      apiKey: "secret-key",
      fetcher: fetcher as typeof fetch
    })

    expect(fetcher.mock.calls.length).toBeGreaterThan(1)
    expect(evidence.incidents).toHaveLength(1)
    expect(evidence.totalDelaySeconds).toBe(480)
  })

  it("returns unknown without calling TomTom when no key is configured", async () => {
    const fetcher = vi.fn()
    const evidence = await getTomTomRouteTraffic(route, {
      apiKey: "",
      fetcher: fetcher as unknown as typeof fetch
    })

    expect(fetcher).not.toHaveBeenCalled()
    expect(evidence).toMatchObject({
      provider: "tomtom",
      status: "unknown",
      totalDelaySeconds: null,
      hasClosure: false,
      incidents: []
    })
  })

  it("marks partial provider coverage degraded and refuses to invent aggregate delay", async () => {
    const longerRoute = denseRoute()
    let call = 0
    const fetcher = vi.fn(async () => {
      call += 1
      return call === 1
        ? tomTomResponse([jamIncident])
        : new Response("upstream failure", { status: 503 })
    })

    const evidence = await getTomTomRouteTraffic(longerRoute, {
      apiKey: "secret-key",
      fetcher: fetcher as typeof fetch
    })

    expect(evidence.status).toBe("degraded")
    expect(evidence.totalDelaySeconds).toBeNull()
    expect(evidence.incidents).toHaveLength(1)
  })

  it("returns unknown when every TomTom corridor request fails", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 }))

    const evidence = await getTomTomRouteTraffic(route, {
      apiKey: "secret-key",
      fetcher: fetcher as typeof fetch
    })

    expect(evidence.status).toBe("unknown")
    expect(evidence.totalDelaySeconds).toBeNull()
    expect(evidence.incidents).toEqual([])
  })
})
