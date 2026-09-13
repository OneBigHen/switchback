import { describe, expect, it, vi } from "vitest"
import { handleRouteTrafficRequest } from "@/app/api/route-traffic/handler"
import type { RouteTrafficEvidence } from "@/lib/traffic/types"

const evidence: RouteTrafficEvidence = {
  provider: "tomtom",
  status: "available",
  observedAt: "2026-09-12T09:00:00.000Z",
  totalDelaySeconds: 180,
  hasClosure: false,
  incidents: []
}

function request(body: unknown): Request {
  return new Request("http://switchback.test/api/route-traffic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
}

describe("route traffic API", () => {
  it("returns normalized evidence without caching live traffic", async () => {
    const provider = vi.fn(async (): Promise<RouteTrafficEvidence> => evidence)
    const points = [
      { lat: 40.1746, lon: -75.1068 },
      { lat: 40.2415, lon: -75.2838 }
    ]

    const response = await handleRouteTrafficRequest(request({ points }), provider)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toEqual(evidence)
    expect(provider).toHaveBeenCalledWith(points)
  })

  it("treats an unconfigured provider as valid unknown evidence", async () => {
    const unknown: RouteTrafficEvidence = {
      provider: "tomtom",
      status: "unknown",
      observedAt: "2026-09-12T09:00:00.000Z",
      totalDelaySeconds: null,
      hasClosure: false,
      incidents: []
    }
    const provider = vi.fn(async () => unknown)

    const response = await handleRouteTrafficRequest(request({
      points: [
        { lat: 40.1746, lon: -75.1068 },
        { lat: 40.2415, lon: -75.2838 }
      ]
    }), provider)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(unknown)
  })

  it("rejects fewer than two route points before touching the provider", async () => {
    const provider = vi.fn(async (): Promise<RouteTrafficEvidence> => evidence)
    const response = await handleRouteTrafficRequest(request({
      points: [{ lat: 40.1746, lon: -75.1068 }]
    }), provider)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_ROUTE_TRAFFIC_REQUEST" }
    })
    expect(provider).not.toHaveBeenCalled()
  })

  it("rejects routes above the geometry bound", async () => {
    const provider = vi.fn(async (): Promise<RouteTrafficEvidence> => evidence)
    const response = await handleRouteTrafficRequest(request({
      points: Array.from({ length: 401 }, (_, index) => ({
        lat: 40 + index * 0.0001,
        lon: -75
      }))
    }), provider)

    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it("rejects coordinates outside geographic bounds", async () => {
    const provider = vi.fn(async (): Promise<RouteTrafficEvidence> => evidence)
    const response = await handleRouteTrafficRequest(request({
      points: [
        { lat: 40.1, lon: -75.1 },
        { lat: 91, lon: -181 }
      ]
    }), provider)

    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it("does not leak provider errors", async () => {
    const provider = vi.fn(async (): Promise<RouteTrafficEvidence> => {
      throw new Error("TomTom secret-key upstream exploded")
    })
    const response = await handleRouteTrafficRequest(request({
      points: [
        { lat: 40.1746, lon: -75.1068 },
        { lat: 40.2415, lon: -75.2838 }
      ]
    }), provider)

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      error: {
        code: "ROUTE_TRAFFIC_UNAVAILABLE",
        message: "Route traffic is temporarily unavailable."
      }
    })
  })
})
