import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlannedRoute } from "@/lib/routing/types"

const passkey = vi.hoisted(() => ({ authenticatePasskey: vi.fn(async () => ({ identityId: "rider-12345678901234567890" })) }))
vi.mock("@/lib/client/passkey", () => ({
  authenticatePasskey: passkey.authenticatePasskey,
  csrfHeaders: (headers: HeadersInit = {}) => new Headers(headers)
}))

import { CommunityPublishPanel } from "@/components/planner/CommunityPublishPanel"

function route(): PlannedRoute {
  return {
    id: "route-private-original",
    name: "Home-to-ridge",
    profile: "twisty",
    geometry: [[0, 0], [0.05, 0], [0.1, 0], [0.15, 0]],
    waypoints: [],
    instructions: [],
    distanceMiles: 10,
    durationMinutes: 60,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 80,
    turnCount: 20,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

describe("CommunityPublishPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ routeId: "route-published-12345678901234567890" }, { status: 201 })))
  })

  it("shows the exact preview before publishing and never sends the private route", async () => {
    render(<CommunityPublishPanel route={route()} />)

    expect(screen.getByRole("img", { name: "Exact public privacy preview map" })).toBeVisible()
    expect(screen.getByRole("button", { name: /Authenticate and publish/i })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: /Authenticate and publish/i }))

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Published/i))
    expect(passkey.authenticatePasskey).toHaveBeenCalledOnce()
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty("geometry")
    expect(body).toHaveProperty("preview.geometry")
    expect(JSON.stringify(body)).not.toContain("route-private-original")
  })
})
