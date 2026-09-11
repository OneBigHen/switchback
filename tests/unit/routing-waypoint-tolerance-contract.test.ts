import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { mergeAdvisorStopIntoVia } from "@/lib/advice/planner-handoff"

const plannerHandoffSource = readFileSync(
  resolve(process.cwd(), "src/lib/advice/planner-handoff.ts"),
  "utf8"
)

describe("route waypoint tolerance authority", () => {
  it("reuses the routing proximity predicate instead of defining advisor-only distance logic", () => {
    expect(plannerHandoffSource).toContain("routePassesNearWaypoint")
    expect(plannerHandoffSource).not.toContain("SAME_STOP_METERS")
    expect(plannerHandoffSource).not.toMatch(/\bhaversine\b/)
  })

  it("deduplicates an advisor stop through the shared routing predicate", () => {
    const existing = [{ lat: 40.2, lon: -75.2, label: "Existing" }]
    const stop = {
      id: "same-stop",
      name: "Same stop",
      kind: "food" as const,
      anchor: { lat: 40.2, lon: -75.2 },
      routeProgress: 0.5,
      reason: "grounded",
      citations: []
    }

    expect(mergeAdvisorStopIntoVia(existing, stop, [[-75.2, 40.2], [-75.3, 40.3]]))
      .toEqual(existing)
  })
})
