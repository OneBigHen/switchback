import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RoadLockSatisfactionBadge } from "@/components/planner/RoadLockSatisfactionBadge"
import type { RoadLockSatisfaction } from "@/lib/roads/road-locks"

afterEach(cleanup)

function preferSatisfaction(overrides: Partial<RoadLockSatisfaction> = {}): RoadLockSatisfaction {
  return {
    lockId: "lock-prefer-1",
    mode: "prefer",
    satisfied: false,
    match: { kind: "unresolved", reason: "Preferred road skipped." },
    skippedReason: "Preferred road skipped because it requires a detour the rider would notice.",
    ...overrides
  }
}

describe("RoadLockSatisfactionBadge", () => {
  it("renders nothing when there is no skippedReason", () => {
    const { container } = render(
      <RoadLockSatisfactionBadge satisfaction={preferSatisfaction({ skippedReason: undefined, match: { kind: "exact", edgeIds: [] } })} displayName="PA-125 sweep" />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders the skipped reason explanation for prefer locks", () => {
    render(
      <RoadLockSatisfactionBadge
        satisfaction={preferSatisfaction()}
        displayName="PA-125 sweep"
      />
    )
    expect(screen.getByText("Preferred road skipped because it requires a detour the rider would notice.")).toBeInTheDocument()
  })

  it("falls back to a generic label when displayName is missing", () => {
    render(
      <RoadLockSatisfactionBadge
        satisfaction={preferSatisfaction()}
      />
    )
    expect(screen.getByRole("note", { name: /preferred road skipped on this route/i })).toBeInTheDocument()
  })

  it("does not render for must locks even if a skippedReason somehow lands", () => {
    const { container } = render(
      <RoadLockSatisfactionBadge
        satisfaction={preferSatisfaction({ mode: "must", skippedReason: undefined })}
        displayName="PA-125"
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
