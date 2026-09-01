import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DiscoverDestination } from "@/components/discover/DiscoverDestination"

const routes = [
  {
    id: "ridge-runner",
    revisionId: "ridge-runner-r1",
    title: "Ridge Runner",
    description: "A flowing ridge-road loop with long sight lines.",
    routeFingerprint: "ridge-fingerprint",
    stats: { distanceMiles: 54.2, durationMinutes: 87 },
    provenanceClass: "rider-recorded",
    visibility: "public",
    updatedAt: "2026-08-31T12:00:00.000Z",
  },
  {
    id: "forest-switchbacks",
    revisionId: "forest-switchbacks-r1",
    title: "Forest Switchbacks",
    description: "Tighter paved switchbacks through shaded back roads.",
    routeFingerprint: "forest-fingerprint",
    stats: { distanceMiles: 38.7, durationMinutes: 74 },
    provenanceClass: "built-and-verified",
    visibility: "public",
    updatedAt: "2026-08-30T12:00:00.000Z",
  },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("DiscoverDestination", () => {
  it("loads the community Atlas and filters routes without leaving the destination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ routes }))
    vi.stubGlobal("fetch", fetchMock)

    render(<DiscoverDestination />)

    expect(screen.getByRole("status")).toHaveTextContent("Reading the Atlas")
    expect(await screen.findByRole("link", { name: "Ridge Runner" })).toHaveAttribute("href", "/routes/ridge-runner")
    expect(screen.getByRole("link", { name: "Forest Switchbacks" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/community/routes?limit=24", expect.objectContaining({ signal: expect.any(AbortSignal) }))

    fireEvent.change(screen.getByRole("searchbox", { name: "Search community routes" }), { target: { value: "ridge" } })

    expect(screen.getByRole("link", { name: "Ridge Runner" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Forest Switchbacks" })).not.toBeInTheDocument()
    expect(screen.getByText("1 route")).toBeInTheDocument()
  })

  it("keeps the planner usable on an Atlas failure and retries on demand", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ routes: [routes[0]] }))
    vi.stubGlobal("fetch", fetchMock)

    render(<DiscoverDestination />)

    const retry = await screen.findByRole("button", { name: "Try again" })
    expect(screen.getByRole("alert")).toHaveTextContent("Your planner and saved rides are unaffected")
    fireEvent.click(retry)

    expect(screen.getByRole("status")).toHaveTextContent("Reading the Atlas")
    expect(await screen.findByRole("link", { name: "Ridge Runner" })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
