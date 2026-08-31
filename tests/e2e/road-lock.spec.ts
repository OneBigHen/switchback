import { expect, test } from "@playwright/test"
import type { PlannedRoute, RouteProfileId } from "../../src/lib/routing/types"
import { CANONICAL_HEALTH_RESPONSE } from "./helpers/health-fixtures"

const appUrl = process.env.SWITCHBACK_E2E_URL ?? "/"

function plannedRoute(
  profile: RouteProfileId,
  geometry: [number, number][],
  metrics: { distance: number; duration: number; twistiness: number; overlap: number }
): PlannedRoute {
  const label = profile[0].toLocaleUpperCase() + profile.slice(1)
  return {
    id: `${profile}-road-lock-e2e`,
    name: `${label} locked ride`,
    profile,
    geometry,
    waypoints: [
      { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" }
    ],
    instructions: geometry.slice(0, -1).map((_, index) => ({
      distanceMeters: 1_200,
      timeMilliseconds: 90_000,
      sign: index === 0 ? 0 : -2,
      text: index === 0 ? "Continue onto Ridge Road" : "Turn left onto Valley Road",
      streetName: index === 0 ? "Ridge Road" : "Valley Road",
      interval: [index, index + 1]
    })),
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
  selectedRouteId: "twisty-road-lock-e2e",
  warnings: [],
  routes: [
    plannedRoute(
      "twisty",
      [
        [-76.8867, 40.2732],
        [-76.95, 40.1],
        [-77.1, 39.95],
        [-77.2311, 39.8309]
      ],
      { distance: 41.5, duration: 79, twistiness: 88, overlap: 100 }
    )
  ]
}

const routeWeather = {
  source: "nws",
  samples: [{
    coordinate: { lat: 40.2732, lon: -76.8867 },
    location: { city: "Harrisburg", state: "PA" },
    status: "ok",
    forecastUpdatedAt: "2026-07-19T12:00:00Z",
    hourly: [{
      startTime: "2026-07-19T13:00:00Z",
      isDaytime: true,
      temperatureF: 72,
      precipitationChance: 8,
      windSpeedMph: 6,
      windDirection: "NW",
      shortForecast: "Clear and mild"
    }],
    alerts: [],
    unavailable: []
  }]
}

const emptyMapStyle = {
  version: 8,
  sources: {},
  layers: [{
    id: "background",
    type: "background",
    paint: { "background-color": "#f2f0ea" }
  }]
}

const EMPTY_GEOJSON = '{"type":"FeatureCollection","features":[]}'

async function mockSharedPlannerServices(page: import("@playwright/test").Page) {
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(emptyMapStyle)
  }))
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(CANONICAL_HEALTH_RESPONSE)
  }))
  await page.route("**/api/curvature?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/geo+json",
    body: EMPTY_GEOJSON
  }))
  await page.route("**/api/map-features?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/geo+json",
    body: EMPTY_GEOJSON
  }))
  await page.route("**/api/geocode?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ places: [] })
  }))
  await page.route("**/api/route-weather", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(routeWeather)
  }))
  await page.route("**/api/pa-unpaved-roads?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/geo+json",
    body: EMPTY_GEOJSON
  }))
}

async function openRouteEditor(page: import("@playwright/test").Page) {
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  if (await start.isVisible().catch(() => false)) return
  await page.getByRole("button", { name: "Options", exact: true }).click()
  await expect(start).toBeVisible()
}

test("tap a road, save as Must use (graph-matched), and confirm the lock is forwarded with edge ids", async ({
  page,
  baseURL
}) => {
  const startUrl = baseURL ?? appUrl
  let routeRequest: Record<string, unknown> | undefined
  let matchRequest: Record<string, unknown> | undefined
  await mockSharedPlannerServices(page)
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  // Road requirements are enabled (SB-013/014): saving a lock graph-matches
  // the two anchors against the live router and receives real edge ids.
  await page.route("**/api/road-matching", async (route) => {
    matchRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        matched: {
          displayName: "Matched PA-125 segment",
          edgeIds: ["edge-1", "edge-2", "edge-3"],
          geometry: [[-76.8867, 40.2732], [-76.9, 40.2], [-76.95, 40.1]],
          entry: { lat: 40.2732, lon: -76.8867 },
          exit: { lat: 40.1, lon: -76.95 },
          streetNames: ["PA-125"],
          access: { motorcycle: "permitted", toll: false, surface: "asphalt" },
          graphVersion: "gh-11-1",
          match: { status: "exact-edge", confidence: 1, maximumDriftMeters: 0 }
        },
        matchedAt: "2026-08-06T00:00:00Z"
      })
    })
  })
  await page.route("**/api/routes", async (route) => {
    routeRequest = route.request().postDataJSON() as Record<string, unknown>
    await new Promise((resolve) => setTimeout(resolve, 120))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan)
    })
  })

  await page.goto(startUrl)
  await expect(page.getByRole("textbox", { name: "Ride request" })).toBeVisible()
  await openRouteEditor(page)
  await expect(page.getByRole("heading", { name: "Route points" })).toBeVisible()

  await page.getByRole("button", { name: "Loop", exact: true }).click()
  await expect(page.getByRole("button", { name: "Plan a 2-hour loop" })).toBeVisible()

  await page.getByRole("button", { name: "Lock a road corridor" }).click()
  await expect(page.getByRole("region", { name: "Road lock draft" })).toBeVisible()
  await expect(page.getByText(/Choose the first road point/i)).toBeVisible()

  const mapStage = page.locator(".map-stage")
  const box = await mapStage.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.4)
  await expect(page.getByText(/First anchor set/i)).toBeVisible()

  await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.55)
  await expect(page.getByText(/Name and save this lock/i)).toBeVisible()

  // Road requirements are enabled: both modes are available and Must defaults.
  await expect(page.getByRole("radio", { name: /Must use/i })).toBeVisible()
  await page.getByRole("radio", { name: /Must use/i }).check()
  await page.getByRole("textbox", { name: /Name.*optional/i }).fill("Best section of PA-125")
  await page.getByRole("button", { name: "Save road lock" }).click()
  await expect(page.getByRole("region", { name: "Road lock draft" })).toBeHidden()

  // The lock was graph-matched: the matching endpoint received the two anchors.
  expect(matchRequest).toBeDefined()
  expect(matchRequest?.start).toBeDefined()
  expect(matchRequest?.end).toBeDefined()

  await page.getByRole("button", { name: "Plan a 2-hour loop" }).click()
  await expect(page.getByRole("heading", { name: /Choose a route/i })).toBeVisible()

  expect(routeRequest).toBeDefined()
  expect(Array.isArray(routeRequest?.roadLocks)).toBe(true)
  const locks = routeRequest?.roadLocks as Array<Record<string, unknown>>
  expect(locks.length).toBe(1)
  expect(locks[0]?.mode).toBe("must")
  expect(locks[0]?.displayName).toBe("Best section of PA-125")
  // A graph-matched lock carries real edge ids and an exact-match claim.
  expect(locks[0]?.edgeIds).toEqual(["edge-1", "edge-2", "edge-3"])
  expect(locks[0]?.confidence).toBe("exact")

  await page.getByRole("button", { name: /Open road locks/i }).click()
  await expect(page.getByRole("dialog", { name: "Road locks" })).toBeVisible()
  await expect(page.getByText("Best section of PA-125")).toBeVisible()
})

test.use({
  viewport: { width: 1280, height: 800 }
})
