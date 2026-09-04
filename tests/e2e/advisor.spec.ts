import { expect, test } from "@playwright/test"
import { CANONICAL_HEALTH_RESPONSE } from "./helpers/health-fixtures"

const appUrl = process.env.SWITCHBACK_E2E_URL ?? "/"
const capability = {
  enabled: true,
  sources: ["switchback-local", "google-maps"],
  attributions: ["Place data © OpenStreetMap contributors", "Grounded with Google Maps"]
}

const route = {
  id: "advisor-e2e",
  name: "Ridge & gravel run",
  profile: "adventure",
  geometry: [
    [-76.8867, 40.2732],
    [-77.05, 40.1],
    [-77.2311, 39.8309]
  ],
  waypoints: [
    { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
    { lat: 40.1, lon: -77.05, label: "Pine Grove Road" },
    { lat: 39.8309, lon: -77.2311, label: "Gettysburg" }
  ],
  instructions: [],
  distanceMiles: 58.4,
  durationMinutes: 180,
  ascentMeters: 420,
  descentMeters: 390,
  twistiness: 79,
  turnCount: 47,
  roadMix: { secondary: 65, unclassified: 35 },
  surfaceMix: { asphalt: 62, gravel: 38 },
  routingSource: "live",
  previewOnly: false
}

async function mockBase(page: import("@playwright/test").Page) {
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: 8, sources: {}, layers: [] })
  }))
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(CANONICAL_HEALTH_RESPONSE)
  }))
  for (const pattern of ["**/api/curvature?**", "**/api/map-features?**", "**/api/pa-unpaved-roads?**"]) {
    await page.route(pattern, (route) => route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify({ type: "FeatureCollection", features: [] })
    }))
  }
  await page.route("**/api/geocode?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ places: [] })
  }))
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/route-weather", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ source: "nws", samples: [] })
  }))
}

test("AI builder is available before routing and becomes the route advisor after planning", async ({ page }) => {
  await mockBase(page)
  let primaryRequest: Record<string, unknown> | undefined

  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        message: "I’d run the ridges south, use Pine Grove Road for the mixed-surface section, then finish in Gettysburg.",
        secondOpinion: null,
        proposedStops: [],
        proposedRide: {
          mode: "destination",
          profile: "adventure",
          targetMinutes: 180,
          start: { name: "Harrisburg", lat: 40.2732, lon: -76.8867 },
          finish: { name: "Gettysburg", lat: 39.8309, lon: -77.2311 },
          waypoints: [{ name: "Pine Grove Road", lat: 40.1, lon: -77.05 }],
          avoidHighways: true,
          tollPolicy: "avoid",
          summary: "Three hours of ridge roads and gravel to Gettysburg."
        },
        citations: [],
        usage: { toolCalls: 2, groundedQueries: 1 },
        capability
      })
    })
  })

  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    if ((body.candidateSet ?? "primary") === "primary") primaryRequest = body
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route] })
    })
  })

  await page.goto(appUrl)

  // The AI path must exist before there is any RouteComparison. This is the
  // builder half of the product; after routing the same surface becomes B.
  const builder = page.getByRole("button", { name: "Plan a ride with me" })
  await expect(builder).toBeVisible()
  await builder.click()

  const composer = page.getByRole("textbox", { name: "Ask the ride advisor" })
  await composer.fill("Three hours, gravel, no highways or tolls, end around Gettysburg")
  await page.getByRole("button", { name: "Send to the ride advisor" }).click()
  await expect(page.getByText("Three hours of ridge roads and gravel to Gettysburg.")).toBeVisible()

  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect.poll(() => primaryRequest).toMatchObject({
    profile: "adventure",
    targetMinutes: 180,
    avoidHighways: true,
    tollPolicy: "avoid"
  })

  // The builder conversation should survive the no-route -> planned-route
  // transition and become the advisor for the route it just created.
  await expect(page.getByText(/I’d run the ridges south/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "What I'd do" })).toBeVisible()

  // Every route-shaping choice on the AI card must also be visible/editable in
  // the ordinary planner controls after routing.
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  await expect(page.getByRole("checkbox", { name: "Avoid highways" })).toBeChecked()
  await expect(page.getByRole("checkbox", { name: "Avoid tolls" })).toBeChecked()
})
