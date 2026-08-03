import { describe, expect, it, vi } from "vitest"
import { parseRidePromptLocally } from "@/lib/ai/ride-intent"
import { handleRouteRequest } from "@/app/api/routes/handler"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"
import { GOLDEN_EVALUATOR, GOLDEN_INTENT_CONTRACT, GOLDEN_PROMPT } from "../fixtures/routing/golden"
import {
  alternativesRequest,
  avoidAreaRequest,
  avoidTollsRequest,
  directRequest,
  FIXTURE_PLANNING_IDS,
  loopRequest,
  roadLockRequest
} from "../fixtures/routing/requests"

describe("routing fixtures — golden intent contract", () => {
  it("parses the exact golden prompt into the locked intent contract", () => {
    expect(parseRidePromptLocally(GOLDEN_PROMPT)).toMatchObject(GOLDEN_INTENT_CONTRACT)
  })

  it("records future quality expectations as metadata only, not assertions", () => {
    expect(GOLDEN_EVALUATOR.targetBandMinutes).toEqual([108, 132])
    expect(GOLDEN_EVALUATOR.corridorFamily).toBe("upper-bucks-delaware")
  })
})

describe("routing fixtures — request contract invariants", () => {
  it("carries a lifecycle id on every fixture", () => {
    for (const planningId of FIXTURE_PLANNING_IDS) {
      expect(typeof planningId).toBe("string")
      expect(planningId!.length).toBeGreaterThanOrEqual(8)
    }
  })

  it("keeps the destination time target on A-to-B fixtures", () => {
    expect(directRequest.targetMinutes).toBe(120)
    expect(avoidTollsRequest.targetMinutes).toBe(90)
    expect(avoidAreaRequest.targetMinutes).toBeUndefined()
  })

  it("keeps the native loop timebox on the loop fixture", () => {
    expect(loopRequest.roundTrip?.targetMinutes).toBe(120)
    expect(loopRequest.points).toHaveLength(1)
  })

  it("carries toll policy and preserves avoid-area and road-lock preferences", () => {
    expect(avoidTollsRequest.tollPolicy).toBe("avoid")
    expect(avoidAreaRequest.avoidAreas).toHaveLength(1)
    expect(roadLockRequest.roadLocks?.[0]?.mode).toBe("must")
    expect(roadLockRequest.bikeProfile?.category).toBe("dual-sport")
  })

  it("pairs candidateSet alternatives with a sampled primary route", () => {
    expect(alternativesRequest.candidateSet).toBe("alternatives")
    expect(alternativesRequest.primaryRoute).toBeDefined()
    expect(alternativesRequest.primaryRoute!.geometry.length).toBeLessThanOrEqual(128)
  })
})

describe("routing fixtures — API boundary acceptance", () => {
  const route: PlannedRoute = {
    id: "fixture-route",
    name: "Fixture route",
    profile: "twisty",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 18,
    durationMinutes: 31,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 72,
    turnCount: 22,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
  const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
    void request
    return { engine: "graphhopper", engineVersion: "11.0", routes: [route] }
  })

  it.each([
    ["direct", directRequest],
    ["loop", loopRequest],
    ["avoid-tolls", avoidTollsRequest],
    ["avoid-area", avoidAreaRequest],
    ["road-lock", roadLockRequest],
    ["alternatives", alternativesRequest]
  ])("accepts the %s fixture at the /api/routes boundary", async (_name, fixture) => {
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fixture)
      }),
      provider
    )
    expect(response.status).toBe(200)
  })

  it("echoes planning metadata on the direct fixture response", async () => {
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(directRequest)
      }),
      provider
    )
    expect(await response.json()).toMatchObject({
      planningId: directRequest.planningId,
      candidateSet: "primary",
      targetMinutes: 120
    })
  })
})
