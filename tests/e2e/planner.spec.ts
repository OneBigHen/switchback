import { expect, test } from "@playwright/test"
import type { PlannedRoute, RouteProfileId } from "../../src/lib/routing/types"
import { CANONICAL_HEALTH_RESPONSE } from "./helpers/health-fixtures"

const appUrl = process.env.SWITCHBACK_E2E_URL ?? "/"

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

async function expectNoOverlap(
  left: import("@playwright/test").Locator,
  right: import("@playwright/test").Locator
) {
  const leftBox = await left.boundingBox()
  const rightBox = await right.boundingBox()
  expect(leftBox).not.toBeNull()
  expect(rightBox).not.toBeNull()
  const overlaps = !(
    leftBox!.x + leftBox!.width <= rightBox!.x ||
    rightBox!.x + rightBox!.width <= leftBox!.x ||
    leftBox!.y + leftBox!.height <= rightBox!.y ||
    rightBox!.y + rightBox!.height <= leftBox!.y
  )
  expect(overlaps).toBe(false)
}

async function expectRideViewportLocked(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(100, 100))
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight
  }))
  expect(metrics.scrollX).toBe(0)
  expect(metrics.scrollY).toBe(0)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth + 1)
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.innerHeight + 1)
  expect(metrics.bodyHeight).toBeLessThanOrEqual(metrics.innerHeight + 1)
}

async function openRouteEditor(page: import("@playwright/test").Page) {
  const startField = page.getByRole("combobox", { name: "Start", exact: true })
  if (await startField.isVisible().catch(() => false)) return

  const options = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(async () => {
    await expect(options).toBeVisible({ timeout: 1_000 })
    if (await options.getAttribute("aria-expanded") !== "true") await options.click()
    await expect(startField).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
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

const routeWeather = {
  source: "nws",
  samples: [{
    coordinate: { lat: 40.2732, lon: -76.8867 },
    location: { city: "Harrisburg", state: "PA" },
    status: "ok",
    forecastUpdatedAt: "2026-07-13T12:00:00Z",
    hourly: [{
      startTime: "2026-07-13T13:00:00Z",
      isDaytime: true,
      temperatureF: 72,
      precipitationChance: 8,
      windSpeedMph: 6,
      windDirection: "NW",
      shortForecast: "Clear and mild"
    }],
    alerts: [{
      id: "heat-advisory-e2e",
      event: "Heat Advisory",
      headline: "Dangerous heat is expected along the route.",
      severity: "Moderate",
      urgency: "Expected",
      certainty: "Likely",
      onset: "2026-07-13T13:00:00Z",
      expires: "2026-07-13T23:00:00Z"
    }],
    unavailable: []
  }]
}

const paUnpavedRoads = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "pa-e2e-1",
    geometry: {
      type: "LineString",
      coordinates: [[-76.881, 40.271], [-76.865, 40.281]]
    },
    properties: {
      id: "pa-e2e-1",
      county: "Dauphin",
      lengthMeters: 1_840,
      source: "Pennsylvania Department of Environmental Protection",
      dataset: "Unpaved Roads 2009_07"
    }
  }],
  metadata: {
    count: 1,
    limit: 500,
    truncated: false,
    source: "Pennsylvania Department of Environmental Protection",
    dataset: "Unpaved Roads 2009_07"
  }
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
    body: JSON.stringify({ type: "FeatureCollection", features: [] })
  }))
  await page.route("**/api/map-features?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/geo+json",
    body: JSON.stringify({ type: "FeatureCollection", features: [] })
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
    body: JSON.stringify(paUnpavedRoads)
  }))
}

test("plans, compares, saves, exports, restores, and opens ride mode", async ({ page }, testInfo) => {
  let routeRequest: Record<string, unknown> | undefined
  const projectRoute = {
    ...plannedRoute("scenic", [[-77.1, 40.1], [-77.2, 40.2]], {
      distance: 19.4,
      duration: 34,
      twistiness: 71,
      overlap: 0
    }),
    id: "project-gpx-e2e",
    name: "Pine Ridge Ramble"
  }
  await mockSharedPlannerServices(page)
  await page.route("**/api/gpx-library**", (route) => {
    const requestedId = new URL(route.request().url()).searchParams.get("id")
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(requestedId ? projectRoute : {
        importedRoutes: 1,
        routes: [{
          id: projectRoute.id,
          name: projectRoute.name,
          distanceMiles: projectRoute.distanceMiles,
          durationMinutes: projectRoute.durationMinutes,
          twistiness: projectRoute.twistiness,
          turnCount: projectRoute.turnCount,
          sourceProject: "LongWay",
          sourceFile: "LongWay/public/gpx/pine-ridge.gpx",
          sources: ["LongWay/public/gpx/pine-ridge.gpx"]
        }]
      })
    })
  })
  await page.route("**/api/routes", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    // The progressive client fires primary then alternatives; assert the
    // primary request only.
    if ((body.candidateSet ?? "primary") === "primary") routeRequest = body
    await new Promise((resolve) => setTimeout(resolve, 120))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan)
    })
  })

  await page.goto(appUrl)
  await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
  await openRouteEditor(page)
  await expect(page.getByRole("combobox", { name: "Start", exact: true })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Start" })).toHaveValue("Current location")
  await expect(page.getByRole("combobox", { name: "Finish" })).toHaveValue("")
  if (testInfo.project.name.includes("landscape")) {
    await expectInsideViewport(page, page.locator(".planner-deck"))
  }
  // Provider health is intentionally degraded-only: healthy status stays
  // quiet, while provider failures are covered by focused planner tests.
  if (testInfo.project.name !== "desktop-chromium") {
    await expectNoOverlap(
      page.getByRole("button", { name: "Open map layers" }),
      page.locator(".maplibregl-ctrl-bottom-right")
    )
  }

  await page.getByRole("button", { name: /Minimize planner|Collapse planner sheet by dragging down or tapping/ }).last().click()
  await expect(page.getByRole("button", { name: "Expand planner" })).toBeVisible()
  await expectInsideViewport(page, page.getByRole("button", { name: "Plan route" }))
  await page.getByRole("button", { name: "Expand planner" }).click()
  await expect(page.getByRole("combobox", { name: "Start", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Loop", exact: true }).click()
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  // The V2 timing control presents the 120-minute preset as “2 hr”. Selecting
  // it explicitly keeps this behavioral journey independent of the old CTA.
  await page.getByLabel("Loop duration").getByRole("button", { name: "2 hr", exact: true }).click()
  await page.getByRole("button", { name: "Twisty", exact: true }).click()
  const planRouteButton = page.locator(".planner-action-dock .plan-button")
  await expect(planRouteButton).toHaveAccessibleName(/Plan/)
  await expectInsideViewport(page, planRouteButton)
  await planRouteButton.click()
  await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()
  expect(routeRequest).toMatchObject({ profile: "twisty", compare: false, candidateSet: "primary" })
  await page.getByRole("button", { name: "Select Maximum Twisties", exact: true }).click()
  const showRouteDetails = page.getByRole("button", { name: /Show route details/i })
  if (await showRouteDetails.isVisible().catch(() => false)) await showRouteDetails.click()
  await expect(page.getByRole("heading", { name: "Ride weather" })).toBeVisible()
  await expect(page.getByText("Clear and mild")).toBeVisible()
  await expectInsideViewport(page, page.getByRole("button", { name: /Start .* route/i }).last())

  await page.getByRole("button", { name: "Select Fastest Now", exact: true }).click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export GPX" }).click()
  await expect((await downloadPromise).suggestedFilename()).toMatch(/quick-route\.gpx$/)

  await page.getByRole("button", { name: "Save route" }).click()
  await expect(page.getByText("Route saved on this device.")).toBeHidden({ timeout: 10_000 })
  await page.screenshot({
    path: `artifacts/screenshots/e2e-planner-${testInfo.project.name}.png`,
    fullPage: false
  })

  // Saved rides live on the Rides destination. The V1 counted "Library" button
  // and its modal drawer are retired; primary navigation is the way in, and
  // importing is a two-step flow (open the import panel, then choose what the
  // file becomes) rather than a bare file input inside the drawer.
  await page.getByRole("button", { name: "Rides", exact: true }).click()
  const rides = page.getByRole("main", { name: "Rides destination" })
  await expect(rides).toBeVisible()
  if (testInfo.project.name.includes("landscape")) {
    await expectInsideViewport(page, rides)
  }
  await expect(page.getByRole("button", { name: /^Open Quick route/ })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Open Pine Ridge Ramble/i })).toBeVisible()

  await page.getByRole("button", { name: "Import ride" }).click()
  await page.getByLabel("Choose GPX, KML, or KMZ file").setInputFiles({
    name: "imported-loop.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(`<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Imported Loop</name></metadata><trk><trkseg><trkpt lat="40.1" lon="-76.9"/><trkpt lat="40.2" lon="-76.8"/></trkseg></trk></gpx>`)
  })
  await page.getByRole("button", { name: /Open as a route/ }).click()
  await expect(page.getByText("Imported Loop imported to your library.")).toBeVisible()
  await page.screenshot({
    path: `artifacts/screenshots/e2e-library-${testInfo.project.name}.png`,
    fullPage: false
  })

  await expect(page.getByText("Imported Loop imported to your library.")).toBeHidden({ timeout: 10_000 })
  await page.getByRole("button", { name: "Rides", exact: true }).click()
  await page.getByRole("button", { name: /^Open Quick route/ }).click()
  await page.getByRole("button", { name: /Start .* route/i }).click()
  await expect(page.getByRole("region", { name: "Ride mode for Quick route" })).toBeVisible()
  await expect(page.getByText("Live guidance")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Continue onto Ridge Road" })).toBeVisible()
  await expectInsideViewport(page, page.locator(".ride-topbar"))
  await expectInsideViewport(page, page.locator(".ride-instruction"))
  await expectInsideViewport(page, page.locator(".ride-telemetry"))
  await expectRideViewportLocked(page)

  const dismissHeat = page.getByRole("button", { name: "Dismiss Heat Advisory" })
  await expect(dismissHeat).toBeVisible()
  await dismissHeat.click()
  await expect(dismissHeat).toBeHidden()

  await page.context().setGeolocation({ latitude: 40.04, longitude: -77.0 })
  await expect(page.getByRole("heading", { name: "Turn left onto Valley Road" })).toBeVisible()

  await page.screenshot({
    path: `artifacts/screenshots/e2e-ride-${testInfo.project.name}.png`,
    fullPage: false
  })

  await page.getByRole("button", { name: "Exit ride mode" }).click()
  await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
})

test("turns a free-form timebox into a gravel loop with route intelligence", async ({ page }) => {
  let intentRequest: Record<string, unknown> | undefined
  let loopRequest: Record<string, unknown> | undefined
  let paRequestCount = 0
  const loopRoute = {
    ...plannedRoute("adventure", [
      [-76.8867, 40.2732],
      [-76.858, 40.287],
      [-76.842, 40.263],
      [-76.8867, 40.2732]
    ], { distance: 31.2, duration: 90, twistiness: 67, overlap: 100 }),
    name: "Gravel loop",
    waypoints: [
      { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" }
    ],
    roadMix: { secondary: 32, unclassified: 68 },
    surfaceMix: { asphalt: 28, gravel: 72 }
  }

  await mockSharedPlannerServices(page)
  await page.route("**/api/pa-unpaved-roads?**", async (route) => {
    paRequestCount += 1
    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify(paUnpavedRoads)
    })
  })
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/ride-intent", async (route) => {
    intentRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "loop",
        profile: "adventure",
        rideCharacter: "adventure",
        targetMinutes: 90,
        tollPolicy: "allow-with-warning",
        ambiguous: false,
        startQuery: null,
        destinationQuery: null,
        stopQuery: null,
        preferGravel: true,
        avoidHighways: true,
        summary: "90-minute adventure loop",
        source: "local"
      })
    })
  })
  await page.route("**/api/routes", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if ((body.candidateSet ?? "primary") === "primary") loopRequest = body
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: loopRoute.id,
        warnings: [],
        routes: [loopRoute]
      })
    })
  })

  await page.goto(appUrl)
  await page.locator("#ride-prompt").pressSequentially("90 minutes of gravel, avoid highways")
  await page.getByRole("button", { name: "Find ride options" }).click()

  await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()
  expect(intentRequest).toEqual({ prompt: "90 minutes of gravel, avoid highways" })
  expect(loopRequest).toMatchObject({
    profile: "adventure",
    compare: false,
    candidateSet: "primary",
    points: [{ lat: 40.2732, lon: -76.8867 }],
    roundTrip: { targetMinutes: 90 }
  })
  await openRouteEditor(page)
  await expect(page.getByRole("button", { name: "Loop", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "90 min" })).toHaveAttribute("aria-pressed", "true")
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  if (await options.getAttribute("aria-expanded") === "true") await options.click()
  await page.getByRole("button", { name: /Show route details/i }).click()
  await expect(page.getByRole("button", { name: /Start .* route/i })).toBeVisible()
  await expect(page.getByText(/72% non-paved mix/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Ride weather" })).toBeVisible()

  await page.getByRole("button", { name: "Open map layers" }).click()
  const layers = page.getByRole("dialog", { name: "Map layers and style" })
  await expect(layers).toBeVisible()
  await expect.poll(() => paRequestCount).toBeGreaterThan(0)
  await expect(layers.getByRole("checkbox", { name: "PA unpaved roads" })).toBeChecked()
})

test("interprets a free-form destination ride without live geocoding", async ({ page }) => {
  let intentRequest: Record<string, unknown> | undefined
  let routeRequest: Record<string, unknown> | undefined

  await mockSharedPlannerServices(page)
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/ride-intent", async (route) => {
    intentRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "destination",
        profile: "twisty",
        rideCharacter: "twisty",
        targetMinutes: null,
        tollPolicy: "allow-with-warning",
        ambiguous: false,
        startQuery: "Harrisburg",
        destinationQuery: "Gettysburg",
        stopQuery: null,
        preferGravel: false,
        avoidHighways: false,
        summary: "twisty ride from Harrisburg to Gettysburg",
        source: "local"
      })
    })
  })
  await page.route("**/api/geocode?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? ""
    const places = query.toLowerCase().includes("gettysburg") ? [{
      id: "gettysburg-pa",
      name: "Gettysburg",
      label: "Gettysburg, Pennsylvania",
      lat: 39.8309,
      lon: -77.2311,
      region: "Pennsylvania",
      country: "United States"
    }] : [{
      id: "harrisburg-pa",
      name: "Harrisburg",
      label: "Harrisburg, Pennsylvania",
      lat: 40.2732,
      lon: -76.8867,
      region: "Pennsylvania",
      country: "United States"
    }]
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ places })
    })
  })
  await page.route("**/api/routes", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if ((body.candidateSet ?? "primary") === "primary") routeRequest = body
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan)
    })
  })

  await page.goto(appUrl)
  const prompt = page.locator("#ride-prompt")
  await prompt.click()
  await page.keyboard.type("I want to ride from Harrisburg to Gettysburg via some twisty roads")
  const submit = page.getByRole("button", { name: "Find ride options" })
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()
  expect(intentRequest).toEqual({
    prompt: "I want to ride from Harrisburg to Gettysburg via some twisty roads"
  })
  expect(routeRequest).toMatchObject({
    profile: "twisty",
    compare: false,
    candidateSet: "primary",
    points: [
      { lat: 40.2732, lon: -76.8867, label: "Harrisburg, Pennsylvania" },
      { lat: 39.8309, lon: -77.2311, label: "Gettysburg, Pennsylvania" }
    ]
  })
  await openRouteEditor(page)
  await expect(page.getByRole("combobox", { name: "Start" })).toHaveValue("Harrisburg, Pennsylvania")
  await expect(page.getByRole("combobox", { name: "Finish", exact: true })).toHaveValue("Gettysburg, Pennsylvania")
  await expect(
    page.getByLabel("Motorcycle routing profile").getByRole("button", { name: "Twisty", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
})

test("draws a rough route on the map and snaps it into editable route points", async ({ page }, testInfo) => {
  const routeRequests: Array<{ points?: Array<Record<string, unknown>> }> = []

  await mockSharedPlannerServices(page)
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/routes", async (route) => {
    const body = route.request().postDataJSON() as { points?: Array<Record<string, unknown>>; candidateSet?: string }
    // Count only primary requests so sketch/replan counts stay stable despite
    // the background alternatives call.
    if ((body.candidateSet ?? "primary") === "primary") routeRequests.push(body)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan)
    })
  })

  await page.goto(appUrl)
  await openRouteEditor(page)
  await expect(page.locator(".map-loading")).toBeHidden({ timeout: 15_000 })
  await page.getByRole("button", { name: "Draw", exact: true }).click()
  const surface = page.getByRole("region", { name: "Draw a rough route" })
  await expect(surface).toBeVisible()
  if (testInfo.project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/screenshots/e2e-sketch-mobile-safari.png", fullPage: false })
  }
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height * 0.65, { steps: 8 })
  await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.5, { steps: 8 })
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height * 0.62, { steps: 8 })
  await page.mouse.up()

  await page.getByRole("button", { name: "Finish drawing" }).click()
  await expect(surface).toBeHidden()
  await expect(page.getByText(/read your line as a corridor/i)).toBeVisible()
  await expect.poll(() => routeRequests[0]?.points?.length ?? 0).toBeGreaterThan(3)
  const sketchRequest = routeRequests[0]
  expect(sketchRequest?.points?.length).toBeLessThanOrEqual(8)
  expect(sketchRequest?.points?.[0]).toMatchObject({ lat: 40.2732, lon: -76.8867 })
  expect(sketchRequest?.points).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ lat: 39.8309, lon: -77.2311 })
  ]))
  // PlannerDeck remounts after sketch ends, so the editor toggle state resets.
  // Re-open the editor to expose the via-points list before asserting count.
  await openRouteEditor(page)
  // The editor lists exactly the shaping stops that were routed. How many the
  // stroke yields depends on its length at the current zoom, so assert the
  // list against the request rather than a fixed count.
  await expect(page.getByLabel("Shaping stops").locator(":scope > div > span:first-child"))
    .toHaveCount((sketchRequest?.points?.length ?? 0) - 2)

  await page.getByRole("button", { name: "Move Sketch stop 2 earlier" }).click()
  await expect.poll(() => routeRequests.length).toBe(2)
  expect(routeRequests[1]?.points?.[1]).toMatchObject({ label: "Sketch stop 2" })

  await openRouteEditor(page)
  await page.getByRole("button", { name: "Undo route edit" }).click()
  await expect.poll(() => routeRequests.length).toBe(3)
  expect(routeRequests[2]?.points?.[1]).toMatchObject({ label: "Sketch stop 1" })

  await openRouteEditor(page)
  await page.getByRole("button", { name: "Redo route edit" }).click()
  await expect.poll(() => routeRequests.length).toBe(4)
  expect(routeRequests[3]?.points?.[1]).toMatchObject({ label: "Sketch stop 2" })

  await openRouteEditor(page)
  await page.getByRole("button", { name: "Reverse route" }).click()
  await expect.poll(() => routeRequests.length).toBe(5)
  const beforeReverse = routeRequests[3]?.points
  const afterReverse = routeRequests[4]?.points
  expect(beforeReverse).toBeDefined()
  expect(afterReverse).toEqual([...beforeReverse!].reverse())
  if (testInfo.project.name === "mobile-safari") {
    await page.screenshot({ path: "artifacts/screenshots/e2e-sketch-result-mobile-safari.png", fullPage: false })
  }
})

test("offers corridor options for a drawn line instead of a single traced route", async ({ page }) => {
  const primaryRequests: Array<Record<string, unknown>> = []
  const alternativesRequests: Array<Record<string, unknown>> = []

  // The primary answers the stroke literally; the alternatives call answers it
  // as a corridor. Both option sets come back through the normal API, so this
  // asserts the client contract: the stroke is sent, and the options render.
  const traced = {
    ...plannedRoute("scenic", [
      [-76.8867, 40.2732],
      [-76.95, 40.1],
      [-77.1, 39.95],
      [-77.2311, 39.8309]
    ], { distance: 42, duration: 80, twistiness: 74, overlap: 100 }),
    id: "traced-e2e",
    name: "Traced",
    corridorOption: "traced",
    corridorAdherence: { score: 96, meanDeviationMeters: 120, maxDeviationMeters: 400, coveredShare: 1 }
  }
  const betterRoads = {
    ...plannedRoute("twisty", [
      [-76.8867, 40.2732],
      [-77.02, 40.14],
      [-77.18, 39.93],
      [-77.2311, 39.8309]
    ], { distance: 47, duration: 92, twistiness: 89, overlap: 44 }),
    id: "better-roads-e2e",
    name: "Better roads nearby",
    corridorOption: "better-roads",
    corridorAdherence: { score: 78, meanDeviationMeters: 900, maxDeviationMeters: 2100, coveredShare: 0.82 }
  }
  const leaner = {
    ...plannedRoute("quick", [
      [-76.8867, 40.2732],
      [-77.0, 40.04],
      [-77.2311, 39.8309]
    ], { distance: 38, duration: 62, twistiness: 45, overlap: 22 }),
    id: "leaner-e2e",
    name: "Leaner",
    corridorOption: "leaner",
    corridorAdherence: { score: 52, meanDeviationMeters: 2400, maxDeviationMeters: 5200, coveredShare: 0.51 }
  }

  await mockSharedPlannerServices(page)
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/routes", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    const alternatives = body.candidateSet === "alternatives"
    if (alternatives) alternativesRequests.push(body)
    else primaryRequests.push(body)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(alternatives
        ? { selectedRouteId: "traced-e2e", warnings: [], routes: [betterRoads, leaner] }
        : { selectedRouteId: "traced-e2e", warnings: [], routes: [traced] })
    })
  })

  await page.goto(appUrl)
  await openRouteEditor(page)
  await expect(page.locator(".map-loading")).toBeHidden({ timeout: 15_000 })
  await page.getByRole("button", { name: "Draw", exact: true }).click()
  const surface = page.getByRole("region", { name: "Draw a rough route" })
  await expect(surface).toBeVisible()
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height * 0.65, { steps: 8 })
  await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.5, { steps: 8 })
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height * 0.62, { steps: 8 })
  await page.mouse.up()
  await page.getByRole("button", { name: "Finish drawing" }).click()
  await expect(surface).toBeHidden()

  // The stroke itself reaches the planner as a soft corridor on both calls.
  await expect.poll(() => alternativesRequests.length).toBeGreaterThan(0)
  const drawnCorridor = primaryRequests[0]?.sketchCorridor as number[][] | undefined
  expect(drawnCorridor?.length).toBeGreaterThan(2)
  expect(drawnCorridor?.length).toBeLessThanOrEqual(48)
  expect(alternativesRequests[0]?.sketchCorridor).toEqual(drawnCorridor)

  // Three named options, not one traced line — and each is selectable.
  const rail = page.getByRole("region", { name: "Route choices" })
  await expect(rail.getByRole("article")).toHaveCount(3)
  for (const option of ["Traced", "Better roads nearby", "Leaner"]) {
    await expect(rail.getByRole("button", { name: `Select ${option}` })).toBeVisible()
  }

  // Added minutes versus the fastest option stay visible on every card.
  await expect(rail.getByText("+18 min")).toBeVisible()
  await expect(rail.getByText("+30 min")).toBeVisible()

  await rail.getByRole("button", { name: "Select Leaner" }).click()
  await expect(rail.getByRole("button", { name: "Select Leaner" })).toHaveAttribute("aria-pressed", "true")
})
