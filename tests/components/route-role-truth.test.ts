import { describe, expect, it } from "vitest"
import { routeDecisionRole } from "@/components/planner/v2/RouteDecisionCard"
import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"

/**
 * A role chip is a claim, and "Best Ride" is the strongest one the rail makes:
 * ADR 0013 makes it the route Switchback itself recommends, with Fastest and
 * Balanced one tap away.
 *
 * It was assigned from the route's coarse profile — `scenic`, `adventure` or
 * `gravel` — and from nothing else. That is not a ranking, so a route the
 * scorer ranked last could carry it, and several candidates could carry it at
 * once. The rider reads a recommendation that was never made.
 *
 * The deterministic score is already on every candidate as
 * `routeScore.total`, so the label can simply follow it.
 */
function route(
  id: string,
  profile: RouteProfileId,
  minutes: number,
  twistiness: number,
  total?: number
): PlannedRoute {
  return {
    id,
    name: `${profile} route`,
    profile,
    geometry: [[-76.88, 40.27], [-76.8, 40.33]],
    waypoints: [],
    instructions: [],
    distanceMiles: 40,
    durationMinutes: minutes,
    ascentMeters: 120,
    descentMeters: 110,
    twistiness,
    turnCount: 12,
    roadMix: { secondary: 80, primary: 20 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    provider: "graphhopper",
    providerVersion: "fixture",
    previewOnly: false,
    ...(total === undefined ? {} : { routeScore: { total } })
  } as unknown as PlannedRoute
}

describe("Best Ride follows the deterministic ranking", () => {
  it("does not call a scenic route the best one when the scorer ranked it last", () => {
    // The scenic route loses on the canonical score, and is neither fastest
    // nor the twistiest. Its profile alone used to be enough.
    const quick = route("quick", "quick", 55, 20, 90)
    const scenic = route("scenic", "scenic", 80, 40, 10)

    expect(routeDecisionRole(scenic, [quick, scenic])).not.toBe("Best Ride")
  })

  it("gives Best Ride to the candidate the scorer actually ranked highest", () => {
    const quick = route("quick", "quick", 55, 20, 30)
    const scenic = route("scenic", "scenic", 80, 40, 95)

    expect(routeDecisionRole(scenic, [quick, scenic])).toBe("Best Ride")
  })

  it("names one Best Ride, not several", () => {
    const quick = route("quick", "quick", 55, 20, 10)
    const scenic = route("scenic", "scenic", 80, 40, 90)
    const gravel = route("gravel", "gravel", 85, 45, 50)
    const all = [quick, scenic, gravel]

    const best = all.filter((candidate) => routeDecisionRole(candidate, all) === "Best Ride")
    expect(best).toHaveLength(1)
    expect(best[0]!.id).toBe("scenic")
  })

  it("claims nothing when the candidates carry no score", () => {
    // No ranking exists, so no route may claim to have won one.
    const quick = route("quick", "quick", 55, 20)
    const scenic = route("scenic", "scenic", 80, 40)

    expect(routeDecisionRole(scenic, [quick, scenic])).not.toBe("Best Ride")
  })

  it("claims nothing when only some candidates were scored", () => {
    // A partial ranking cannot establish a winner.
    const quick = route("quick", "quick", 55, 20)
    const scenic = route("scenic", "scenic", 80, 40, 95)

    expect(routeDecisionRole(scenic, [quick, scenic])).not.toBe("Best Ride")
  })

  it("still reports the measured facts it always did", () => {
    const quick = route("quick", "quick", 55, 20, 10)
    const twisty = route("twisty", "twisty", 80, 88, 90)
    const all = [quick, twisty]

    // Fastest is a measurement, and outranks the recommendation chip.
    expect(routeDecisionRole(quick, all)).toBe("Fastest Now")
    // Measured twistiness keeps its own factual label.
    expect(routeDecisionRole(twisty, all)).toBe("Maximum Twisties")
  })

  it("claims nothing when the policy did not pick a single winner", () => {
    // A tie is not a recommendation. Better to show a factual label than to
    // break the tie arbitrarily and present the result as a decision.
    const scenic = route("scenic", "scenic", 80, 40, 90)
    const gravel = route("gravel", "gravel", 85, 45, 90)
    const all = [scenic, gravel]

    expect(all.filter((candidate) => routeDecisionRole(candidate, all) === "Best Ride")).toHaveLength(0)
  })
})
