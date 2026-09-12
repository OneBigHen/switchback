import { describe, expect, it, vi } from "vitest"
import {
  fetchRouteTrafficEvidence,
  sampleTrafficRoutePoints,
  summarizeRouteTrafficEvidence
} from "@/lib/client/route-traffic-client"
import type { RouteTrafficEvidence } from "@/lib/traffic/types"

const available: RouteTrafficEvidence = {
  provider: "tomtom",
  status: "available",
  observedAt: "2026-09-12T12:00:00.000Z",
  totalDelaySeconds: 480,
  hasClosure: false,
  incidents: [{
    id: "jam-1",
    kind: "jam",
    providerCategory: "jam",
    magnitude: "moderate",
    description: "Slow traffic",
    delaySeconds: 480,
    lengthMeters: 1200,
    roadNumbers: ["PA-611"],
    from: "York Rd",
    to: "Bristol Rd",
    geometry: { type: "Point", coordinates: [-75.13, 40.2] }
  }]
}

describe("sampleTrafficRoutePoints", () => {
  it("preserves route endpoints while deterministically capping requests at 400 points", () => {
    const geometry = Array.from({ length: 1_201 }, (_, index) => [
      -75.4 + index * 0.0001,
      40.1 + index * 0.0001
    ] as [number, number])

    const sampled = sampleTrafficRoutePoints(geometry)

    expect(sampled).toHaveLength(400)
    expect(sampled[0]).toEqual({ lat: 40.1, lon: -75.4 })
    expect(sampled.at(-1)).toEqual({
      lat: geometry.at(-1)![1],
      lon: geometry.at(-1)![0]
    })
    expect(sampleTrafficRoutePoints(geometry)).toEqual(sampled)
  })

  it("keeps short geometry intact in lat/lon API order", () => {
    expect(sampleTrafficRoutePoints([[-75.1, 40.1], [-75.2, 40.2]])).toEqual([
      { lat: 40.1, lon: -75.1 },
      { lat: 40.2, lon: -75.2 }
    ])
  })
})

describe("summarizeRouteTrafficEvidence", () => {
  it("summarizes known delay without hiding the incident count", () => {
    expect(summarizeRouteTrafficEvidence(available)).toEqual({
      state: "warning",
      title: "8 min traffic delay",
      detail: "1 reported incident"
    })
  })

  it("gives closures precedence over delay totals", () => {
    const evidence: RouteTrafficEvidence = {
      ...available,
      hasClosure: true,
      totalDelaySeconds: null,
      incidents: [{ ...available.incidents[0], id: "closed", kind: "closure" }]
    }

    expect(summarizeRouteTrafficEvidence(evidence)).toEqual({
      state: "danger",
      title: "Closure reported",
      detail: "1 reported incident"
    })
  })

  it("never turns degraded or unknown evidence into a false clear result", () => {
    expect(summarizeRouteTrafficEvidence({
      ...available,
      status: "degraded",
      totalDelaySeconds: null
    })).toEqual({
      state: "warning",
      title: "Partial traffic coverage",
      detail: "1 reported incident"
    })

    expect(summarizeRouteTrafficEvidence({
      ...available,
      status: "unknown",
      totalDelaySeconds: null,
      incidents: []
    })).toEqual({
      state: "unavailable",
      title: "Live traffic unavailable",
      detail: "Traffic is not being used to judge this route."
    })
  })

  it("only calls a route clear when complete evidence returned zero incidents", () => {
    expect(summarizeRouteTrafficEvidence({
      ...available,
      totalDelaySeconds: 0,
      hasClosure: false,
      incidents: []
    })).toEqual({
      state: "clear",
      title: "No reported incidents on this route",
      detail: "Live traffic checked just now"
    })
  })
})

describe("fetchRouteTrafficEvidence", () => {
  it("posts sampled points to the same-origin API and forwards cancellation", async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/route-traffic")
      expect(init?.method).toBe("POST")
      expect(init?.signal).toBe(controller.signal)
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json")
      expect(JSON.parse(String(init?.body))).toEqual({
        points: [{ lat: 40.1, lon: -75.1 }, { lat: 40.2, lon: -75.2 }]
      })
      return Response.json(available)
    })

    const evidence = await fetchRouteTrafficEvidence([
      { lat: 40.1, lon: -75.1 },
      { lat: 40.2, lon: -75.2 }
    ], { fetcher: fetcher as typeof fetch, signal: controller.signal })

    expect(evidence).toEqual(available)
  })

  it("rejects malformed success payloads instead of trusting them as clear traffic", async () => {
    const fetcher = vi.fn(async () => Response.json({ provider: "tomtom", status: "available", incidents: [] }))

    await expect(fetchRouteTrafficEvidence([
      { lat: 40.1, lon: -75.1 },
      { lat: 40.2, lon: -75.2 }
    ], { fetcher: fetcher as typeof fetch })).rejects.toThrow("traffic response")
  })
})
