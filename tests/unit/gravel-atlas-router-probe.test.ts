import { describe, expect, it, vi } from "vitest"
import { createGraphHopperProbe } from "@/lib/roads/gravel-atlas/router-probe"

const routeBody = { paths: [{ distance: 1234, points: { coordinates: [[-74.5, 39.7], [-74.49, 39.71]] } }] }

function probeWith(respond: (url: string) => Response | Promise<Response>, timeoutMs = 1_000) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => respond(String(input)))
  return { fetcher, probe: createGraphHopperProbe({ baseUrl: "http://gh.test", profile: "motorcycle_adventure", fetcher, timeoutMs }) }
}

describe("GraphHopper traversability probe", () => {
  it("returns a routed path and a snap distance for ordinary answers", async () => {
    const { probe } = probeWith((url) => url.includes("/nearest")
      ? Response.json({ distance: 3.5 })
      : Response.json(routeBody))
    await expect(probe.snapDistance([-74.5, 39.7])).resolves.toBe(3.5)
    await expect(probe.routeAlong([[-74.5, 39.7], [-74.49, 39.71]])).resolves.toMatchObject({ meters: 1234 })
  })

  it("treats a router 400 (no connection / point not found) as a real non-traversable answer", async () => {
    const { probe } = probeWith(() => Response.json({ message: "Connection between locations not found" }, { status: 400 }))
    await expect(probe.routeAlong([[-74.5, 39.7], [-74.49, 39.71]])).resolves.toBeNull()
    await expect(probe.snapDistance([-74.5, 39.7])).resolves.toBeNull()
  })

  it.each([429, 500, 502, 503])("fails the verification run on router status %i instead of quarantining the corridor", async (status) => {
    const { probe } = probeWith(() => new Response("busy", { status }))
    await expect(probe.routeAlong([[-74.5, 39.7], [-74.49, 39.71]])).rejects.toThrow(String(status))
    await expect(probe.snapDistance([-74.5, 39.7])).rejects.toThrow(String(status))
  })

  it("bounds each router request with a timeout", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")))
    }))
    const probe = createGraphHopperProbe({ baseUrl: "http://gh.test", profile: "motorcycle_adventure", fetcher, timeoutMs: 20 })
    await expect(probe.routeAlong([[-74.5, 39.7], [-74.49, 39.71]])).rejects.toThrow()
  })
})
