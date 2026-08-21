import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRoadLockDraft } from "@/components/planner/useRoadLockDraft"
import type { RoadMatchResult } from "@/lib/roads/road-matching"
import type { RoadLock } from "@/lib/roads/road-locks"

const matched: RoadMatchResult = {
  displayName: null,
  edgeIds: ["edge-1", "edge-2"],
  geometry: [[-77, 40], [-76.9, 40.05], [-76.8, 40.1]],
  entry: [-77, 40],
  exit: [-76.8, 40.1],
  streetNames: ["Ridge Road"],
  access: { motorcycle: "permitted", toll: false, surface: "asphalt" },
  graphVersion: "gh-test",
  match: { status: "exact-edge", confidence: 1, maximumDriftMeters: 0 }
}

function addAnchors(result: { current: ReturnType<typeof useRoadLockDraft> }) {
  act(() => result.current.beginLockDraft())
  act(() => result.current.handleLockDrawTap({ lat: 40, lon: -77 }))
  act(() => result.current.handleLockDrawTap({ lat: 40.1, lon: -76.8 }))
}

describe("useRoadLockDraft", () => {
  it("starts with an empty first-anchor draft", () => {
    const { result } = renderHook(() => useRoadLockDraft({ addRoadLock: vi.fn() }))

    expect(result.current.lockDrawMode).toBe(false)
    expect(result.current.lockDraftStep).toBe("first")
    expect(result.current.lockAnchors).toEqual([])
    expect(result.current.lockMode).toBe("must")
  })

  it("captures first and second anchors in order", () => {
    const { result } = renderHook(() => useRoadLockDraft({ addRoadLock: vi.fn() }))

    act(() => result.current.beginLockDraft())
    act(() => result.current.handleLockDrawTap({ lat: 40, lon: -77 }))
    expect(result.current.lockDraftStep).toBe("second")
    expect(result.current.lockAnchors).toEqual([[-77, 40]])

    act(() => result.current.handleLockDrawTap({ lat: 40.1, lon: -76.8 }))
    expect(result.current.lockDraftStep).toBe("naming")
    expect(result.current.lockAnchors).toEqual([[-77, 40], [-76.8, 40.1]])
  })

  it("commits a must lock from a successful graph match", async () => {
    const addRoadLock = vi.fn<(lock: RoadLock) => void>()
    const { result } = renderHook(() => useRoadLockDraft({
      addRoadLock,
      matchRoad: async () => matched
    }))
    addAnchors(result)
    act(() => result.current.setLockName("  Ridge  "))

    await act(async () => result.current.commitLockDraft())

    expect(addRoadLock).toHaveBeenCalledTimes(1)
    expect(addRoadLock.mock.calls[0]?.[0]).toMatchObject({
      mode: "must",
      displayName: "Ridge",
      edgeIds: ["edge-1", "edge-2"],
      sourceRegionId: "matched",
      sourceGraphVersion: "gh-test",
      confidence: "exact"
    })
    expect(result.current.lockDrawMode).toBe(false)
  })

  it("supports prefer mode and saves one approximate fallback when matching fails", async () => {
    const addRoadLock = vi.fn<(lock: RoadLock) => void>()
    const { result } = renderHook(() => useRoadLockDraft({
      addRoadLock,
      matchRoad: async () => {
        throw new Error("router unavailable")
      }
    }))
    addAnchors(result)
    act(() => result.current.setLockMode("prefer"))

    await act(async () => result.current.commitLockDraft())

    expect(addRoadLock.mock.calls[0]?.[0]).toMatchObject({
      mode: "prefer",
      edgeIds: [],
      sourceRegionId: "manual",
      sourceGraphVersion: "manual",
      confidence: "approximate",
      accessSnapshot: { routable: true, motorcycleAccess: "unknown" }
    })
    expect(result.current.lockDrawMode).toBe(false)
  })

  it("reset cancels the draft and clears all captured state", () => {
    const { result } = renderHook(() => useRoadLockDraft({ addRoadLock: vi.fn() }))
    addAnchors(result)
    act(() => result.current.setLockName("Temporary"))
    act(() => result.current.resetLockDraft())

    expect(result.current.lockDrawMode).toBe(false)
    expect(result.current.lockDraftStep).toBe("first")
    expect(result.current.lockAnchors).toEqual([])
    expect(result.current.lockName).toBe("")
    expect(result.current.lockDraftMessage).toBe("")
  })
})
