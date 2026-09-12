import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { RouteTrafficSummary } from "@/components/planner/RouteTrafficSummary"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RouteTrafficEvidence } from "@/lib/traffic/types"

function route(id: string, offset = 0): PlannedRoute {
  return {
    id,
    name: `Route ${id}`,
    profile: "balanced",
    geometry: [
      [-75.1068 + offset, 40.1746],
      [-75.1690 + offset, 40.2068],
      [-75.2838 + offset, 40.2415]
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 22,
    durationMinutes: 42,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 0.4,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    provider: "graphhopper",
    previewOnly: false
  }
}

const clearEvidence: RouteTrafficEvidence = {
  provider: "tomtom",
  status: "available",
  observedAt: "2026-09-12T12:00:00.000Z",
  totalDelaySeconds: 0,
  hasClosure: false,
  incidents: []
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("RouteTrafficSummary", () => {
  it("renders nothing until a route exists", () => {
    const { container } = render(<RouteTrafficSummary route={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a calm loading state then a confirmed clear result", async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve }))
    vi.stubGlobal("fetch", fetcher)

    render(<RouteTrafficSummary route={route("a")} />)

    expect(screen.getByText("Checking live traffic…")).toBeInTheDocument()
    resolveResponse!(Response.json(clearEvidence))

    expect(await screen.findByText("No reported incidents on this route")).toBeInTheDocument()
    expect(screen.getByText("Live traffic checked just now")).toBeInTheDocument()
  })

  it("surfaces closures ahead of numeric delay", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ...clearEvidence,
      totalDelaySeconds: null,
      hasClosure: true,
      incidents: [{
        id: "closed-1",
        kind: "closure",
        providerCategory: "roadClosed",
        magnitude: null,
        description: "Road closed",
        delaySeconds: null,
        lengthMeters: 400,
        roadNumbers: ["PA-263"],
        from: "County Line Rd",
        to: "Street Rd",
        geometry: { type: "Point", coordinates: [-75.1, 40.18] }
      }]
    } satisfies RouteTrafficEvidence)))

    render(<RouteTrafficSummary route={route("closed")} />)

    expect(await screen.findByText("Closure reported")).toBeInTheDocument()
    expect(screen.getByText("1 reported incident")).toBeInTheDocument()
  })

  it("does not call unknown traffic clear", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ...clearEvidence,
      status: "unknown",
      totalDelaySeconds: null
    } satisfies RouteTrafficEvidence)))

    render(<RouteTrafficSummary route={route("unknown")} />)

    expect(await screen.findByText("Live traffic unavailable")).toBeInTheDocument()
    expect(screen.queryByText("No reported incidents on this route")).not.toBeInTheDocument()
  })

  it("treats request failures as unavailable rather than clear", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })))

    render(<RouteTrafficSummary route={route("failure")} />)

    expect(await screen.findByText("Live traffic unavailable")).toBeInTheDocument()
  })

  it("does not start a traffic request while the browser is offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false)
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)

    render(<RouteTrafficSummary route={route("offline")} />)

    expect(screen.getByText("Traffic check paused")).toBeInTheDocument()
    expect(screen.getByText("Reconnect to refresh live conditions.")).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("aborts the old traffic request when route identity changes", async () => {
    const signals: AbortSignal[] = []
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal)
      return new Promise<Response>(() => undefined)
    })
    vi.stubGlobal("fetch", fetcher)

    const { rerender } = render(<RouteTrafficSummary route={route("first")} />)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(signals[0].aborted).toBe(false)

    rerender(<RouteTrafficSummary route={route("second", 0.01)} />)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })
})
