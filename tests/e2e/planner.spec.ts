import { expect, test } from "@playwright/test"
import type { PlannedRoute, RouteProfileId } from "../../src/lib/routing/types"

async function waitForAnimations(locator: import("@playwright/test").Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
  })
}

async function expectInsideViewport(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator
) {
  const viewport = page.viewportSize()
  const box = await locator.boundingBox()
  expect(viewport).not.toBeNull()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
}

function plannedRoute(
  profile: RouteProfileId,
  geometry: [number, number][],
  metrics: { distance: number; duration: number; twistiness: number; overlap: number }
): PlannedRoute {
  const label = profile[0].toUpperCase() + profile.slice(1)
  return {
    id: `${profile}-e2e`,
    name: `${label} route`,
    profile,
    geometry,
    waypoints: [
      { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" }
    ],
    instructions: [
      {
        distanceMeters: 1_200,
        timeMilliseconds: 90_000,
        sign: 0,
        text: "Continue onto Ridge Road",
        streetName: "Ridge Road",
        interval: [0, 1]
      }
    ],
    distanceMiles: metrics.distance,
    durationMinutes: metrics.duration,
    ascentMeters: 340,
    descentMeters: 320,
    twistiness: metrics.twistiness,
    turnCount: 24,
    roadMix: { secondary: 72, primary: 28 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false,
    overlapPercent: metrics.overlap
  }
}

const tripPlan = {
  selectedRouteId: "twisty-e2e",
  warnings: [],
  routes: [
    plannedRoute("twisty", [
      [-76.8867, 40.2732],
      [-76.95, 40.1],
      [-77.1, 39.95],
      [-77.2311, 39.8309]
    ], { distance: 41.5, duration: 79, twistiness: 88, overlap: 100 }),
    plannedRoute("scenic", [
      [-76.8867, 40.2732],
      [-77.05, 40.18],
      [-77.25, 40.0],
      [-77.2311, 39.8309]
    ], { distance: 45.8, duration: 85, twistiness: 76, overlap: 31 }),
    plannedRoute("quick", [
      [-76.8867, 40.2732],
      [-77.0, 40.04],
      [-77.2311, 39.8309]
    ], { distance: 37.8, duration: 49, twistiness: 42, overlap: 14 })
  ]
}

test("plans, compares, saves, exports, restores, and opens ride mode", async ({ page }, testInfo) => {
  let routeRequest: Record<string, unknown> | undefined
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, app: { ok: true }, router: { ok: true } })
  }))
  await page.route("**/api/curvature?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/geo+json",
    body: JSON.stringify({ type: "FeatureCollection", features: [] })
  }))
  await page.route("**/api/routes", async (route) => {
    routeRequest = route.request().postDataJSON() as Record<string, unknown>
    await new Promise((resolve) => setTimeout(resolve, 120))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan)
    })
  })

  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Pick two points/i })).toBeVisible()
  if (testInfo.project.name.includes("landscape")) {
    await expectInsideViewport(page, page.locator(".planner-deck"))
  }
  await expect(page.getByText("Router live")).toBeVisible()

  await page.getByRole("button", { name: "Build my route" }).click()
  await page.getByRole("button", { name: "Twisty", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Choose your line" })).toBeVisible()
  expect(routeRequest).toMatchObject({ profile: "twisty", compare: true })

  await page.getByRole("button", { name: "Select Quick route" }).click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export GPX" }).click()
  await expect((await downloadPromise).suggestedFilename()).toMatch(/quick-route\.gpx$/)

  await page.getByRole("button", { name: "Save route" }).click()
  await expect(page.getByRole("button", { name: /Library 1/ })).toBeVisible()
  await expect(page.getByText("Route saved on this device.")).toBeHidden({ timeout: 10_000 })
  await page.screenshot({
    path: `artifacts/screenshots/e2e-planner-${testInfo.project.name}.png`,
    fullPage: false
  })

  await page.getByRole("button", { name: /Library 1/ }).click()
  await expect(page.getByRole("heading", { name: "Ride library" })).toBeVisible()
  await waitForAnimations(page.getByRole("dialog", { name: "Ride library" }))
  if (testInfo.project.name.includes("landscape")) {
    await expectInsideViewport(page, page.getByRole("dialog", { name: "Ride library" }))
  }
  await expect(page.getByRole("button", { name: /Quick route 37.8 mi/ })).toBeVisible()
  await page.getByLabel("Import GPX file").setInputFiles({
    name: "imported-loop.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(`<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Imported Loop</name></metadata><trk><trkseg><trkpt lat="40.1" lon="-76.9"/><trkpt lat="40.2" lon="-76.8"/></trkseg></trk></gpx>`)
  })
  await expect(page.getByText("Imported Loop imported to your library.")).toBeVisible()
  await expect(page.locator(".library-load", { hasText: "Imported Loop" })).toBeVisible()
  await page.screenshot({
    path: `artifacts/screenshots/e2e-library-${testInfo.project.name}.png`,
    fullPage: false
  })

  await expect(page.getByText("Imported Loop imported to your library.")).toBeHidden({ timeout: 10_000 })
  await page.getByRole("button", { name: /Quick route 37.8 mi/ }).click()
  await page.getByRole("button", { name: "Start ride" }).click()
  await expect(page.getByRole("region", { name: "Ride mode for Quick route" })).toBeVisible()
  await expect(page.getByText("Guidance beta")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Continue onto Ridge Road" })).toBeVisible()
  if (testInfo.project.name.includes("landscape")) {
    await expectInsideViewport(page, page.locator(".ride-topbar"))
    await expectInsideViewport(page, page.locator(".ride-instruction"))
    await expectInsideViewport(page, page.locator(".ride-telemetry"))
  }
  await page.screenshot({
    path: `artifacts/screenshots/e2e-ride-${testInfo.project.name}.png`,
    fullPage: false
  })

  await page.getByRole("button", { name: "Exit ride mode" }).click()
  await expect(page.getByRole("button", { name: "Build my route" })).toBeVisible()
})
