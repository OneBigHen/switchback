import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRoadLockDraft } from "@/components/planner/useRoadLockDraft"
import type { RoadMatchResult } from "@/lib/roads/road-matching"

const MATCH: RoadMatchResult = {
  displayName: "Good road",
  edgeIds: ["edge-a", "edge-b"],
  geometry: [[-75.1, 40.1], [-75.05, 40.15]],
  entry: [-75.1, 40.1],
  exit: [-75.05, 40.15],
  streetNames: ["Good road"],
  access: { motorcycle: "permitted", toll: false, surface: "asphalt" },
  graphVersion: "test-graph",
  match: { status: "exact-edge", confidence: 1, maximumDriftMeters: 0 }
}

afterEach(cleanup)

describe("route sculpting road-lock handoff", () => {
  it("seeds two sculpt anchors into the existing naming step and replans exactly once after save", async () => {
    const addRoadLock = vi.fn()
    const onCommitted = vi.fn()
    const matchRoad = vi.fn().mockResolvedValue(MATCH)
    const { result } = renderHook(() => useRoadLockDraft({ addRoadLock, matchRoad, onCommitted }))

    act(() => result.current.beginLockDraftFromAnchors(
      [[-75.1, 40.1], [-75.05, 40.15]],
      "prefer"
    ))

    expect(result.current.lockDrawMode).toBe(true)
    expect(result.current.lockDraftStep).toBe("naming")
    expect(result.current.lockMode).toBe("prefer")
    expect(result.current.lockAnchors).toEqual([[-75.1, 40.1], [-75.05, 40.15]])

    await act(async () => result.current.commitLockDraft())

    expect(matchRoad).toHaveBeenCalledOnce()
    expect(addRoadLock).toHaveBeenCalledOnce()
    expect(onCommitted).toHaveBeenCalledOnce()
    await waitFor(() => expect(result.current.lockDrawMode).toBe(false))
  })

  it("does not replan or save when a sculpted Must corridor cannot be graph matched", async () => {
    const addRoadLock = vi.fn()
    const onCommitted = vi.fn()
    const matchRoad = vi.fn().mockRejectedValue(new Error("No legal motorcycle path"))
    const { result } = renderHook(() => useRoadLockDraft({ addRoadLock, matchRoad, onCommitted }))

    act(() => result.current.beginLockDraftFromAnchors(
      [[-75.1, 40.1], [-75.05, 40.15]],
      "must"
    ))
    await act(async () => result.current.commitLockDraft())

    expect(addRoadLock).not.toHaveBeenCalled()
    expect(onCommitted).not.toHaveBeenCalled()
    expect(result.current.lockDraftMessage).toContain("No legal motorcycle path")
    expect(result.current.lockDrawMode).toBe(true)
  })
})
