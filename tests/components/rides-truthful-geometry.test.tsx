import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RidesSurface, type RideLibraryItem } from "@/components/rides/RidesSurface"
import { normalizeRideLibrary } from "@/components/rides/rides-view-model"
import type { SavedRoute } from "@/lib/storage/route-library"

afterEach(cleanup)

/**
 * A ride card may never imply a shape its source does not contain.
 *
 * #83 shipped `RouteThumbnail`, which draws stored geometry and falls back to
 * an explicit "route shape unavailable" glyph. Nothing adopted it: every card
 * rendered `RouteGraphic`, whose path is generated from a hash of the ride id.
 * That produced a route-shaped line for a real, named ride — the one thing
 * route imagery must never do, because the rider cannot tell it apart from
 * their actual route.
 */

// A deliberately asymmetric path, so a rendered shape can be traced back to
// this input rather than to any plausible-looking curve.
const PINE_CREEK: Array<[number, number]> = [
  [-77.45, 41.52],
  [-77.41, 41.55],
  [-77.38, 41.51],
  [-77.30, 41.58],
  [-77.22, 41.54]
]

function item(overrides: Partial<RideLibraryItem> = {}): RideLibraryItem {
  return {
    id: "saved-1",
    kind: "saved-route",
    name: "Pine Creek back roads",
    sourceLabel: "Saved route",
    distanceMiles: 82.4,
    durationMinutes: 146,
    durationSource: "planned",
    updatedAt: "2026-08-28T12:00:00Z",
    tags: [],
    ...overrides
  }
}

function savedRoute(geometry: Array<[number, number]> | undefined): SavedRoute {
  return {
    id: "saved-1",
    name: "Pine Creek back roads",
    distanceMiles: 82.4,
    durationMinutes: 146,
    updatedAt: "2026-08-28T12:00:00Z",
    geometry,
    tags: []
  } as unknown as SavedRoute
}

describe("ride cards never invent a route shape", () => {
  it("draws the ride's own stored geometry when it is retained", () => {
    render(<RidesSurface items={[item({ geometry: PINE_CREEK })]} onOpen={vi.fn()} onImport={vi.fn()} />)

    const thumbnail = document.querySelector("[data-route-thumbnail]")
    expect(thumbnail).not.toBeNull()
    expect(thumbnail!.getAttribute("data-route-thumbnail")).toBe("ready")
    // The drawn path must come from the geometry above, not from a seed.
    expect(document.querySelector("[data-route-line]")).not.toBeNull()
  })

  it("says the shape is unavailable rather than drawing a plausible one", () => {
    render(<RidesSurface items={[item({ geometry: undefined })]} onOpen={vi.fn()} onImport={vi.fn()} />)

    const thumbnail = document.querySelector("[data-route-thumbnail]")
    expect(thumbnail!.getAttribute("data-route-thumbnail")).toBe("unavailable")
    expect(screen.getByText("Route shape unavailable")).toBeInTheDocument()
    expect(document.querySelector("[data-route-line]")).toBeNull()
  })

  it("treats a single stray point as no shape, not as a route", () => {
    render(<RidesSurface items={[item({ geometry: [[-77.45, 41.52]] })]} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(document.querySelector("[data-route-thumbnail]")!.getAttribute("data-route-thumbnail"))
      .toBe("unavailable")
  })

  it("never renders seeded procedural route art on a ride card", () => {
    render(
      <RidesSurface
        items={[item({ geometry: PINE_CREEK }), item({ id: "saved-2", geometry: undefined })]}
        onOpen={vi.fn()}
        onImport={vi.fn()}
      />
    )

    // RouteGraphic's route variant is the seeded path this contract forbids.
    expect(document.querySelector('[data-route-graphic="route"]')).toBeNull()
  })

  it("carries the stored shape through the view model so the card can be truthful", () => {
    const [normalized] = normalizeRideLibrary({ savedRoutes: [savedRoute(PINE_CREEK)] })

    expect(normalized!.geometry).toBeDefined()
    expect(normalized!.geometry!.length).toBeGreaterThanOrEqual(2)
    // Endpoints are the ride's real endpoints, whatever simplification does
    // to the middle.
    expect(normalized!.geometry![0]).toEqual(PINE_CREEK[0])
    expect(normalized!.geometry!.at(-1)).toEqual(PINE_CREEK.at(-1))
  })

  it("leaves geometry absent when the source never stored any", () => {
    const [normalized] = normalizeRideLibrary({ savedRoutes: [savedRoute(undefined)] })

    expect(normalized!.geometry).toBeUndefined()
  })
})
