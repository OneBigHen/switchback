import { expect, test } from "@playwright/test"
import { installPlannerServices, installRouteApi, makeRoute, tripPlan } from "../../helpers/planner-fixtures"
import { pinVisualClock, uxState } from "../../helpers/ux-state-fixtures"

const suggestion = {
  id: "debug-suggestion",
  kind: "fun-road" as const,
  title: "Debug fun road",
  actionLabel: "Accept suggestion",
  origin: [-76.8867, 40.2732] as [number, number],
  destination: [-76.82, 40.31] as [number, number],
  routeFragment: [[-76.8867, 40.2732], [-76.85, 40.29], [-76.82, 40.31]] as [number, number][],
  triggerDistanceMeters: 1_200,
  addedDurationSeconds: 240,
  score: { total: 84, fun: 92, twistiness: 94, scenic: 77, elevation: 58, gravel: 0, traffic: 89, simplicity: 83, safety: 96, novelty: 74, confidence: 90, preferenceFit: 84, etaPenalty: 0, explanations: ["Debug"], explanation: ["Debug"] },
  reasons: ["Debug"],
  confidence: 0.9,
  expiresAt: new Date("2099-01-01T00:00:00Z").toISOString()
}

test("debug Free Ride accept transition", async ({ page }) => {
  await pinVisualClock(page)
  await installPlannerServices(page)
  await page.route("**/api/free-ride/suggestions", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ source: "debug", suggestion, suppressed: false }) }))
  await installRouteApi(page, tripPlan([makeRoute("neural", { name: "Debug accepted route" })]))
  await uxState.freeRideSuggestion(page)
  const accept = page.getByRole("button", { name: "Accept suggestion" })
  await page.screenshot({ path: "/tmp/free-ride-debug-before-accept.png", animations: "disabled" })
  await accept.tap()
  await expect(page.getByRole("region", { name: /Ride mode|Ride preview/ })).toBeVisible({ timeout: 30_000 })
})
