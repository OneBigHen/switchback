import { describe, expect, it } from "vitest"
import { createWorkflowSpanTracker, WORKFLOW_NAMES } from "@/lib/telemetry/spans"

describe("workflow telemetry spans", () => {
  it("keeps the live Free Ride workflow distinct from discovery", () => {
    expect(WORKFLOW_NAMES).toContain("free_ride_live")
  })

  it("reports foreground duration and closes exactly once", () => {
    let now = 1_000
    let visibility: "visible" | "hidden" = "visible"
    const completed: unknown[] = []
    const tracker = createWorkflowSpanTracker({
      now: () => now,
      visibility: () => visibility,
      onComplete: (span) => completed.push(span),
      createId: () => "span-1"
    })

    const span = tracker.start("planner_to_first_routes", { route_mode: "best-ride" })
    now = 2_000
    visibility = "hidden"
    tracker.visibilityChanged()
    now = 5_000
    visibility = "visible"
    tracker.visibilityChanged()
    now = 7_500

    expect(span.end("success")).toBe(true)
    expect(span.cancel()).toBe(false)
    expect(completed).toEqual([expect.objectContaining({
      span_id: "span-1",
      workflow: "planner_to_first_routes",
      duration_ms: 6_500,
      foreground_duration_ms: 3_500,
      outcome: "success",
      route_mode: "best-ride"
    })])
  })

  it("supports explicit cancel and failure outcomes", () => {
    let now = 100
    const completed: Array<{ outcome: string }> = []
    const tracker = createWorkflowSpanTracker({
      now: () => now,
      visibility: () => "visible",
      onComplete: (span) => completed.push(span as { outcome: string }),
      createId: (() => {
        let count = 0
        return () => `span-${++count}`
      })()
    })

    tracker.start("gpx_import").cancel()
    now = 250
    tracker.start("share_flow").fail("network")

    expect(completed.map((span) => span.outcome)).toEqual(["cancelled", "failure"])
  })
})
