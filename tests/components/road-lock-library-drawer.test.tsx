import "fake-indexeddb/auto"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RoadLockLibraryDrawer } from "@/components/planner/RoadLockLibraryDrawer"
import { usePlannerStore } from "@/stores/planner-store"
import type { RoadLock } from "@/lib/roads/road-locks"

function buildLock(overrides: Partial<RoadLock> = {}): RoadLock {
  return {
    id: "lock-1",
    mode: "must",
    edgeIds: ["e1"],
    geometry: { type: "LineString", coordinates: [[-77, 40], [-76.9, 40.05]] },
    orderedAnchors: [[-77, 40], [-76.9, 40.05]],
    fallbackToleranceMeters: 50,
    source: "manual",
    confidence: "exact",
    sourceRegionId: "manual",
    sourceGraphVersion: "manual",
    accessSnapshot: {
      highwayClass: "unknown",
      motorcycleAccess: "unknown",
      generalAccess: "unknown",
      surface: "unknown",
      smoothness: "unknown",
      tracktype: "unknown",
      maxweightTonnes: null,
      seasonalUndated: false,
      activeConditions: [],
      routable: true
    },
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides
  } as RoadLock
}

describe("RoadLockLibraryDrawer", () => {
  beforeEach(() => {
    usePlannerStore.setState({ roadLocks: [] })
  })

  afterEach(() => {
    cleanup()
    usePlannerStore.setState({ roadLocks: [] })
  })

  it("renders nothing until open", () => {
    const { container } = render(<RoadLockLibraryDrawer open={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists locks from the planner store with provenance label, mode badge, and region", () => {
    usePlannerStore.setState({
      roadLocks: [
        buildLock({ id: "lock-1", displayName: "PA-125 sweep", mode: "must", source: "manual", sourceRegionId: "manual" }),
        buildLock({ id: "lock-2", displayName: "Ridge GPX", mode: "prefer", source: "gpx", sourceRegionId: "gpx-import" })
      ]
    })
    render(<RoadLockLibraryDrawer open onClose={vi.fn()} />)
    expect(screen.getByText("PA-125 sweep")).toBeInTheDocument()
    expect(screen.getByText("Ridge GPX")).toBeInTheDocument()
    const mustBadges = screen.getAllByText("Must use")
    expect(mustBadges.some((badge) => badge.classList.contains("road-lock-mode-badge"))).toBe(true)
    const preferBadges = screen.getAllByText("Prefer")
    expect(preferBadges.some((badge) => badge.classList.contains("road-lock-mode-badge"))).toBe(true)
    expect(screen.getByText("manual")).toBeInTheDocument()
    expect(screen.getByText("gpx-import")).toBeInTheDocument()
  })

  it("shows the empty-state copy when no locks are saved", () => {
    render(<RoadLockLibraryDrawer open onClose={vi.fn()} />)
    expect(screen.getByText("No road locks yet")).toBeInTheDocument()
  })

  it("requires confirmation before deleting a lock", () => {
    usePlannerStore.setState({
      roadLocks: [buildLock({ id: "lock-1", displayName: "PA-125 sweep" })]
    })
    const onClose = vi.fn()
    render(<RoadLockLibraryDrawer open onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: /Delete PA-125 sweep/i }))
    expect(usePlannerStore.getState().roadLocks).toHaveLength(1)
    // Confirm step appears
    expect(screen.getByText("Delete this lock?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(usePlannerStore.getState().roadLocks).toHaveLength(0)
  })

  it("emits highlight-lock calls when tapping a lock row", () => {
    usePlannerStore.setState({
      roadLocks: [buildLock({ id: "lock-1", displayName: "PA-125 sweep" })]
    })
    const onHighlight = vi.fn()
    render(
      <RoadLockLibraryDrawer
        open
        onClose={vi.fn()}
        onHighlightLock={onHighlight}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Highlight PA-125 sweep on the map/i }))
    expect(onHighlight).toHaveBeenCalledWith("lock-1")
    fireEvent.click(screen.getByRole("button", { name: /Highlight PA-125 sweep on the map/i }))
    expect(onHighlight).toHaveBeenLastCalledWith(null)
  })
})
