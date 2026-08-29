import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ProviderHealthNotice,
  useProviderHealth
} from "@/components/planner/ProviderHealthNotice"

function healthResponse(overrides: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({
    ok: true,
    degraded: false,
    app: { ok: true },
    router: { ok: true, status: 200, latencyMs: 8 },
    providers: {
      graphhopper: { ok: true, status: 200, latencyMs: 8 },
      valhalla: { ok: true, status: 200, latencyMs: 9 }
    },
    degradedProviders: [],
    runtime: {},
    ...overrides
  }), { status, headers: { "content-type": "application/json" } })
}

function HealthHarness({ enabled = true }: { enabled?: boolean }) {
  const health = useProviderHealth(enabled)
  return (
    <div>
      <span data-testid="health-state">{health.status}</span>
      <button type="button" onClick={health.retry}>retry</button>
    </div>
  )
}

describe("planner provider health", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(healthResponse()))
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("probes once, polls about every 60 seconds, and aborts on cleanup", async () => {
    const requests: RequestInit[] = []
    vi.mocked(fetch).mockImplementation((_input, init) => {
      requests.push(init ?? {})
      return Promise.resolve(healthResponse())
    })
    const { unmount } = render(<HealthHarness />)

    await act(async () => undefined)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({ cache: "no-store" }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(fetch).toHaveBeenCalledTimes(2)

    unmount()
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(requests[0]?.signal).toHaveProperty("aborted", true)
  })

  it("does not poll when the planner is not visible", async () => {
    render(<HealthHarness enabled={false} />)
    await act(async () => undefined)
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("suppresses requests while offline and probes immediately on recovery", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false })
    render(<HealthHarness />)
    await act(async () => undefined)
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByTestId("health-state")).toHaveTextContent("offline")

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true })
    act(() => { window.dispatchEvent(new Event("online")) })
    await act(async () => undefined)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("health-state")).toHaveTextContent("healthy")
  })

  it("keeps malformed or rejected online health as an unverified status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      providers: { graphhopper: { ok: true, status: 200, latencyMs: 1 } }
    }), { status: 503 }))
    render(<HealthHarness />)
    await act(async () => undefined)
    expect(screen.getByTestId("health-state")).toHaveTextContent("unverified")

    cleanup()
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"))
    render(<HealthHarness />)
    await act(async () => undefined)
    expect(screen.getByTestId("health-state")).toHaveTextContent("unverified")
  })

  it("rejects inconsistent HTTP and canonical envelopes instead of claiming healthy", async () => {
    const inconsistent = [
      healthResponse({}, 503),
      healthResponse({
        ok: false,
        router: { ok: false, status: 503, latencyMs: 8 },
        providers: { graphhopper: { ok: false, status: 503, latencyMs: 8 } },
        degradedProviders: ["graphhopper"]
      }, 200),
      healthResponse({
        ok: false,
        router: { ok: true, status: 200, latencyMs: 8 },
        providers: { graphhopper: { ok: true, status: 200, latencyMs: 8 } },
        degradedProviders: ["graphhopper"]
      }),
      healthResponse({
        app: { ok: false }
      }),
      healthResponse({
        providers: {
          graphhopper: { ok: true, status: 200, latencyMs: 8 },
          valhalla: { ok: false, status: 503, latencyMs: 8 }
        },
        degradedProviders: ["valhalla"]
      })
    ]

    for (const response of inconsistent) {
      vi.mocked(fetch).mockResolvedValueOnce(response)
      const view = render(<HealthHarness />)
      await act(async () => undefined)
      expect(screen.getByTestId("health-state")).toHaveTextContent("unverified")
      view.unmount()
    }
  })

  it("recognizes a consistent GraphHopper outage from the canonical 503 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(healthResponse({
      ok: false,
      router: { ok: false, status: 503, latencyMs: 8 },
      providers: { graphhopper: { ok: false, status: 503, latencyMs: 8 } },
      degradedProviders: ["graphhopper"]
    }, 503))
    render(<HealthHarness />)
    await act(async () => undefined)
    expect(screen.getByTestId("health-state")).toHaveTextContent("graphhopper-unavailable")
  })

  it("shows only degraded provider states and keeps healthy/unknown/checking quiet", () => {
    const retry = vi.fn()
    const { rerender } = render(<ProviderHealthNotice health={{ status: "healthy" }} onRetry={retry} />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    rerender(<ProviderHealthNotice health={{ status: "unknown" }} onRetry={retry} />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    rerender(<ProviderHealthNotice health={{ status: "checking" }} onRetry={retry} />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    rerender(<ProviderHealthNotice health={{ status: "graphhopper-unavailable" }} onRetry={retry} />)
    expect(screen.getByRole("alert")).toHaveTextContent("The route service is temporarily unavailable. Nothing was lost — try again in a moment.")
    const graphhopperRetry = screen.getByRole("button", { name: "Retry" })
    expect(graphhopperRetry).toHaveClass("provider-health-retry")
    graphhopperRetry.click()
    expect(retry).toHaveBeenCalledOnce()

    rerender(<ProviderHealthNotice health={{ status: "valhalla-degraded" }} onRetry={retry} />)
    expect(screen.getByRole("status")).toHaveTextContent("Optional route comparison is unavailable. Planning remains available.")
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument()

    rerender(<ProviderHealthNotice health={{ status: "offline" }} onRetry={retry} />)
    expect(screen.getByRole("status")).toHaveTextContent("You're offline. Provider status will update when you're back online.")
    rerender(<ProviderHealthNotice health={{ status: "unverified" }} onRetry={retry} />)
    expect(screen.getByRole("status")).toHaveTextContent("Provider status could not be checked. Planning may still work.")
  })

  it("classifies a healthy GraphHopper with unavailable Valhalla as non-blocking degradation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(healthResponse({
      degraded: true,
      providers: {
        graphhopper: { ok: true, status: 200, latencyMs: 8 },
        valhalla: { ok: false, status: 503, latencyMs: 12 }
      },
      degradedProviders: ["valhalla"]
    }))
    render(<HealthHarness />)
    await act(async () => undefined)
    expect(screen.getByTestId("health-state")).toHaveTextContent("valhalla-degraded")
  })
})
