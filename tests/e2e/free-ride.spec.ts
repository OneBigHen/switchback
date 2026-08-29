import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test"
import { installPlannerServices, installRouteApi, makeRoute, tripPlan } from "./helpers/planner-fixtures"
import { CANONICAL_HEALTH_RESPONSE } from "./helpers/health-fixtures"

const appUrl = process.env.SWITCHBACK_E2E_URL ?? "/"
const e2eBaseUrl = process.env.SWITCHBACK_E2E_URL ?? `http://localhost:${process.env.SWITCHBACK_E2E_PORT ?? "3110"}`

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
  // Always fresh: an expired suggestion is never shown (SB-030).
  expiresAt: new Date(Date.now() + 45_000).toISOString()
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
  await page.route("**/api/health", (routeRequest) => routeRequest.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CANONICAL_HEALTH_RESPONSE) }))
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

test("offers a saved local Home escape from Free Ride and routes to it", async ({ page }) => {
  await installPlannerServices(page)
  await page.addInitScript(() => {
    localStorage.setItem("switchback.planner-home.v1", JSON.stringify({
      lat: 40.28,
      lon: -76.84,
      label: "Home"
    }))
  })
  await page.route("**/api/free-ride/suggestions", (routeRequest) => routeRequest.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ suggestion: null, suppressed: true, suppressionReason: "no-safe-candidate" })
  }))
  const capture = await installRouteApi(page, tripPlan([makeRoute("balanced", { name: "Home route" })]))

  await page.goto(appUrl)
  await page.getByRole("button", { name: "Free Ride" }).click()
  await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
  await expect(page.getByText(/GPS \d+ m/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Head Home" })).toBeVisible()
  await page.getByRole("button", { name: "Head Home" }).click()
  await expect(page.getByRole("region", { name: /Ride mode|Ride preview/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Live guidance", { exact: true })).toBeVisible()
  expect(capture.requests[0]?.points).toEqual([
    { lat: 40.2732, lon: -76.8867, label: "Current position" },
    { lat: 40.28, lon: -76.84, label: "Home" }
  ])
})

async function assertSmallFreeRideLayout(page: Page, expectedBrowser: "chromium" | "webkit"): Promise<void> {
  await page.setViewportSize({ width: 320, height: 568 })
  expect(page.context().browser()?.browserType().name()).toBe(expectedBrowser)
  expect(page.viewportSize()).toEqual({ width: 320, height: 568 })
  if (expectedBrowser === "chromium") {
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0)
  }

  await installPlannerServices(page)
  await page.route("**/api/free-ride/suggestions", (routeRequest) => routeRequest.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      source: "curvature-database",
      suggestion: { ...suggestion, expiresAt: "2099-01-01T00:00:00.000Z" },
      suppressed: false
    })
  }))
  await installRouteApi(page, tripPlan([makeRoute("neural", { name: "Small accepted route" })]))

  await page.goto(appUrl)
  await page.getByRole("button", { name: "Free Ride" }).click()
  await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("region", { name: "Suggested fun road" })).toBeVisible({ timeout: 15_000 })

  const viewport = page.viewportSize()
  const selectors = [
    ".free-ride-speed",
    ".free-ride-heading",
    ".free-ride-instruction",
    ".free-ride-suggestion",
    ".free-ride-telemetry",
    ".free-ride-controls"
  ]
  const boxes = await Object.fromEntries(await Promise.all(selectors.map(async (selector) => [
    selector,
    await page.locator(selector).boundingBox()
  ]))) as Record<string, { x: number; y: number; width: number; height: number } | null>

  expect(viewport).toEqual({ width: 320, height: 568 })
  for (const selector of selectors) expect(boxes[selector], `${selector} must be measurable`).not.toBeNull()

  const speed = boxes[".free-ride-speed"]!
  const heading = boxes[".free-ride-heading"]!
  const instruction = boxes[".free-ride-instruction"]!
  const suggestionPanel = boxes[".free-ride-suggestion"]!
  const telemetry = boxes[".free-ride-telemetry"]!
  const controls = boxes[".free-ride-controls"]!
  const reason = page.getByRole("listitem").first()
  await expect(reason).toBeVisible()
  await expect(reason).toContainText("Strong curvature")
  expect(speed.y + speed.height).toBeLessThanOrEqual(heading.y)
  expect(heading.y + heading.height).toBeLessThanOrEqual(instruction.y)
  expect(instruction.y + instruction.height).toBeLessThanOrEqual(suggestionPanel.y)
  expect(suggestionPanel.y + suggestionPanel.height).toBeLessThanOrEqual(telemetry.y)
  expect(telemetry.y + telemetry.height).toBeLessThanOrEqual(controls.y)
  expect(controls.y + controls.height).toBeLessThanOrEqual(viewport!.height)
  expect(await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    suggestionOverflow: getComputedStyle(document.querySelector(".free-ride-suggestion")!).overflowY
  }))).toEqual({
    documentWidth: viewport!.width,
    bodyWidth: viewport!.width,
    suggestionOverflow: "visible"
  })

  for (const button of await page.locator(".free-ride-suggestion-actions button, .free-ride-controls button").all()) {
    const box = await button.boundingBox()
    expect(box, "Free Ride controls must be measurable").not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await expect(button).toBeInViewport()
  }

  const accept = page.getByRole("button", { name: "Accept suggestion" })
  await accept.tap()
  await expect(page.getByRole("region", { name: /Ride mode|Ride preview/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Live guidance", { exact: true })).toBeVisible()
}

test("keeps the short small-phone Free Ride stack free of occlusion", async ({ page: fixturePage, browser }, testInfo) => {
  let ownedContext: BrowserContext | undefined
  const expectedBrowser = testInfo.project.name === "desktop-chromium" ? "chromium" : "webkit"
  let page = fixturePage

  try {
    if (testInfo.project.name === "desktop-chromium") {
      ownedContext = await browser.newContext({
        ...devices["Pixel 5"],
        baseURL: e2eBaseUrl,
        viewport: { width: 320, height: 568 },
        screen: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
        geolocation: { latitude: 40.2732, longitude: -76.8867 },
        permissions: ["geolocation"],
        serviceWorkers: "block",
        timezoneId: "America/New_York"
      })
      page = await ownedContext.newPage()
    }
    await assertSmallFreeRideLayout(page, expectedBrowser)
  } finally {
    await ownedContext?.close()
  }
})
