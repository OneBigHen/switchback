import { describe, expect, it, vi } from "vitest"
import { createCandidateEnricher } from "@/lib/routing/candidate-enrichment"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

const route = { id: "r1", ascentMeters: null } as unknown as PlannedRoute
const request: RouteRequest = { profile: "twisty", points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.7 }] }

function enricher(elevate = vi.fn(async (result: { routes: PlannedRoute[] }) => ({
  ...result,
  routes: result.routes.map((candidate) => ({ ...candidate, ascentMeters: 321 }))
}))) {
  const regionEvidence = vi.fn(async (_request: RouteRequest, routes: PlannedRoute[]) => ({ routes, warnings: [] }))
  return { regionEvidence, elevate, run: createCandidateEnricher({ regionEvidence, elevate, signal: new AbortController().signal }) }
}

describe("accepted-candidate enrichment", () => {
  it("adds elevation to accepted alternatives but never to a primary", async () => {
    const { elevate, regionEvidence, run } = enricher()

    const primary = await run(request, [route])
    expect(elevate).not.toHaveBeenCalled()
    expect(primary.routes[0]!.ascentMeters).toBeNull()

    const alternatives = await run({ ...request, candidateSet: "alternatives" }, [route])
    expect(elevate).toHaveBeenCalledOnce()
    expect(regionEvidence).toHaveBeenCalledTimes(2)
    expect(alternatives.routes[0]!.ascentMeters).toBe(321)
  })

  it("keeps the route and says so when elevation fails", async () => {
    const { run } = enricher(vi.fn(async () => { throw new Error("height service down") }))
    const result = await run({ ...request, candidateSet: "alternatives" }, [route])
    expect(result.routes).toEqual([route])
    expect(result.warnings.join(" ")).toMatch(/elevation enrichment unavailable/i)
  })

  it("does not call elevation for an empty accepted set", async () => {
    const { elevate, run } = enricher()
    await run({ ...request, candidateSet: "alternatives" }, [])
    expect(elevate).not.toHaveBeenCalled()
  })

  it("passes the lane signal to elevation and preserves caller cancellation", async () => {
    const caller = new AbortController()
    const reason = new Error("rider cancelled")
    const elevate = vi.fn(async (_result: { routes: PlannedRoute[] }, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      caller.abort(reason)
      expect(signal.aborted).toBe(true)
      throw signal.reason
    })
    const { run } = enricher(elevate)

    await expect(run(
      { ...request, candidateSet: "alternatives" },
      [route],
      { signal: caller.signal }
    )).rejects.toBe(reason)
  })
})
