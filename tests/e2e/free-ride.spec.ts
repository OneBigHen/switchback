import { expect, test } from "@playwright/test"

const appUrl = process.env.SWITCHBACK_E2E_URL ?? "/"

const suggestion = {
  id: "ridge-e2e",
  kind: "fun-road",
  title: "Fun road ahead — Follow this road in 0.8 mi — +4 min",
  actionLabel: "Accept suggestion",
  origin: [-76.8867, 40.2732],
  destination: [-76.82, 40.31],
  routeFragment: [[-76.8867, 40.2732], [-76.85, 40.29], [-76.82, 40.31]],
  triggerDistanceMeters: 1_200,
  addedDurationSeconds: 240,
  score: {
    total: 84,
    fun: 92,
    twistiness: 94,
    scenic: 77,
    elevation: 58,
    gravel: 0,
    traffic: 89,
    simplicity: 83,
    safety: 96,
    novelty: 74,
    confidence: 90,
    preferenceFit: 84,
    etaPenalty: 0,
    explanations: ["Strong curvature and sustained bends (94/100)."],
    explanation: ["Strong curvature and sustained bends (94/100)."]
  },
  reasons: ["Strong curvature and sustained bends (94/100).", "Fewer traffic lights and less stop-and-go flow."],
  confidence: 0.9,
  expiresAt: "2026-08-04T14:00:45.000Z"
}

const route = {
  id: "neural-free-ride-e2e",
  name: "Neural route",
  profile: "neural",
  geometry: [[-76.8867, 40.2732], [-76.85, 40.29], [-76.82, 40.31]],
  waypoints: [
    { lat: 40.2732, lon: -76.8867, label: "Current position" },
    { lat: 40.31, lon: -76.82, label: "Accepted fun road" }
  ],
  instructions: [{
    distanceMeters: 700,
    timeMilliseconds: 45_000,
    sign: 0,
    text: "Continue onto Ridge Road",
    streetName: "Ridge Road",
    interval: [0, 1]
  }],
  distanceMiles: 8.2,
  durationMinutes: 17,
  ascentMeters: 120,
  descentMeters: 110,
  twistiness: 88,
  turnCount: 12,
  roadMix: { secondary: 88, primary: 12 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false
}

test("offers one bounded Free Ride suggestion and accepts it into live guidance", async ({ page }, testInfo) => {
  await page.route("https://tiles.openfreemap.org/styles/**", (routeRequest) => routeRequest.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f2f0ea" } }] })
  }))
  await page.route("**/api/health", (routeRequest) => routeRequest.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, app: { ok: true }, router: { ok: true } }) }))
  await page.route("**/api/curvature?**", (routeRequest) => routeRequest.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify({ type: "FeatureCollection", features: [] }) }))
  await page.route("**/api/map-features?**", (routeRequest) => routeRequest.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify({ type: "FeatureCollection", features: [] }) }))
  await page.route("**/api/gpx-library**", (routeRequest) => routeRequest.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ importedRoutes: 0, routes: [] }) }))
  await page.route("**/api/free-ride/suggestions", (routeRequest) => routeRequest.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ source: "curvature-database", suggestion, suppressed: false, consideredCandidateIds: [suggestion.id] })
  }))
  await page.route("**/api/routes", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, routes: [route], warnings: [] })
    })
  })

  await page.goto(appUrl)
  await page.getByRole("button", { name: "Free Ride" }).click()
  await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
  await expect(page.getByText("Experimental", { exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Suggested fun road" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Accept suggestion" })).toBeVisible()
  const viewport = page.viewportSize()
  const suggestionBox = await page.locator(".free-ride-suggestion").boundingBox()
  const telemetryBox = await page.locator(".free-ride-telemetry").boundingBox()
  const controlsBox = await page.locator(".free-ride-controls").boundingBox()
  expect(viewport).not.toBeNull()
  expect(suggestionBox).not.toBeNull()
  expect(telemetryBox).not.toBeNull()
  expect(controlsBox).not.toBeNull()
  expect(suggestionBox!.y + suggestionBox!.height).toBeLessThanOrEqual(telemetryBox!.y)
  expect(telemetryBox!.y + telemetryBox!.height).toBeLessThanOrEqual(controlsBox!.y)
  expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(viewport!.height)
  await page.screenshot({ path: `artifacts/screenshots/e2e-free-ride-${testInfo.project.name}.png`, fullPage: false })

  await page.getByRole("button", { name: "Accept suggestion" }).click()
  await expect(page.getByRole("region", { name: /Ride mode|Ride preview/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Live guidance", { exact: true })).toBeVisible()
})
