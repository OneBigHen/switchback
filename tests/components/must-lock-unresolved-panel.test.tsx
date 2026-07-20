import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MustLockUnresolvedPanel } from "@/components/planner/MustLockUnresolvedPanel"
import { MUST_LOCK_UNRESOLVED_OPTIONS } from "@/lib/roads/road-locks"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RoadLockSatisfaction } from "@/lib/roads/road-locks"

afterEach(cleanup)

const SAMPLE_SATISFACTION: RoadLockSatisfaction = {
  lockId: "lock-1",
  mode: "must",
  satisfied: false,
  match: { kind: "unresolved", reason: "Anchors fall outside the fallback corridor on the newer graph." }
}

const PREVIOUS_ROUTE: PlannedRoute = {
  id: "route-prev",
  name: "PA-125 sweep",
  profile: "twisty",
  geometry: [[-77, 40], [-76.8, 40.1]],
  waypoints: [],
  instructions: [],
  distanceMiles: 14.2,
  durationMinutes: 22,
  ascentMeters: 0,
  descentMeters: 0,
  twistiness: 1,
  turnCount: 5,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
} as PlannedRoute

describe("MustLockUnresolvedPanel", () => {
  it("names the lock as 'could not be included'", () => {
    render(
      <MustLockUnresolvedPanel
        satisfaction={SAMPLE_SATISFACTION}
        displayName="Best section of PA-125"
        previousRoute={PREVIOUS_ROUTE}
        onResolve={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText("Best section of PA-125 could not be included.")).toBeInTheDocument()
  })

  it("keeps the previous route name visible so the planner has not overwritten it", () => {
    render(
      <MustLockUnresolvedPanel
        satisfaction={SAMPLE_SATISFACTION}
        displayName="PA-125"
        previousRoute={PREVIOUS_ROUTE}
        onResolve={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText("PA-125 sweep")).toBeInTheDocument()
  })

  it("offers all four MUST_LOCK_UNRESOLVED_OPTIONS exactly once each", () => {
    render(
      <MustLockUnresolvedPanel
        satisfaction={SAMPLE_SATISFACTION}
        displayName="PA-125"
        previousRoute={PREVIOUS_ROUTE}
        onResolve={() => {}}
        onDismiss={() => {}}
      />
    )
    const expected: Record<typeof MUST_LOCK_UNRESOLVED_OPTIONS[number], RegExp> = {
      "try-wider-match": /Try a wider match/i,
      "convert-to-prefer": /Convert to Prefer/i,
      "remove-lock": /^Remove lock/i,
      "restore-previous-route": /Restore previous route/i
    }
    for (const id of MUST_LOCK_UNRESOLVED_OPTIONS) {
      expect(screen.getByRole("button", { name: expected[id] })).toBeInTheDocument()
    }
  })

  it("emits the clicked option identifier verbatim and not silently fall through to a valid route", () => {
    const onResolve = vi.fn()
    render(
      <MustLockUnresolvedPanel
        satisfaction={SAMPLE_SATISFACTION}
        displayName="PA-125"
        previousRoute={PREVIOUS_ROUTE}
        onResolve={onResolve}
        onDismiss={() => {}}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Convert to Prefer/i }))
    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onResolve.mock.calls[0]![0]).toBe("convert-to-prefer")
  })

  it("falls back to a generic name when displayName is empty", () => {
    render(
      <MustLockUnresolvedPanel
        satisfaction={SAMPLE_SATISFACTION}
        previousRoute={null}
        onResolve={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText("This corridor could not be included.")).toBeInTheDocument()
  })
})
