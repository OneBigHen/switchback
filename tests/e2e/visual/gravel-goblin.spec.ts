import { expect, test, type Page } from "@playwright/test"
import { CANONICAL_HEALTH_RESPONSE } from "../helpers/health-fixtures"
import { expandPhonePlanner } from "../helpers/planner-fixtures"
import { pinVisualClock } from "../helpers/ux-state-fixtures"

const capability = {
  enabled: true,
  sources: ["switchback-local"],
  attributions: ["Place data © OpenStreetMap contributors"]
}

const route = {
  id: "goblin-visual-route",
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

const proposedRide = {
  mode: "destination",
  profile: "adventure",
  targetMinutes: 180,
  start: { name: "Harrisburg", lat: 40.2732, lon: -76.8867 },
  finish: { name: "Gettysburg", lat: 39.8309, lon: -77.2311 },
  waypoints: [{ name: "Pine Grove Road", lat: 40.1, lon: -77.05 }],
  avoidHighways: true,
  tollPolicy: "avoid",
  summary: "Three hours of ridge roads and gravel to Gettysburg."
}

const builderReply = {
  status: "ok",
  message: "Run the ridges south, use Pine Grove Road for the mixed-surface section, then finish in Gettysburg.",
  secondOpinion: null,
  proposedStops: [],
  proposedRide,
  citations: [],
  usage: { toolCalls: 2, groundedQueries: 0 },
  capability
}

async function installMocks(page: Page): Promise<void> {
  await page.route("https://tiles.openfreemap.org/styles/**", (request) => request.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: 8, sources: {}, layers: [] })
  }))
  await page.route("**/api/health", (request) => request.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(CANONICAL_HEALTH_RESPONSE)
  }))
  for (const pattern of ["**/api/curvature?**", "**/api/map-features?**", "**/api/pa-unpaved-roads?**"]) {
    await page.route(pattern, (request) => request.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify({ type: "FeatureCollection", features: [] })
    }))
  }
  await page.route("**/api/geocode?**", (request) => request.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ places: [] })
  }))
  await page.route("**/api/gpx-library**", (request) => request.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/route-weather", (request) => request.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ source: "nws", samples: [] })
  }))
  await page.route("**/api/advisor", async (request) => {
    if (request.request().method() === "GET") {
      await request.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    await request.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(builderReply)
    })
  })
  await page.route("**/api/routes", (request) => request.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route] })
  }))
}

async function openPlanner(page: Page): Promise<void> {
  await page.goto("/")
  await expandPhonePlanner(page)
  await expect(page.getByLabel("Gravel Goblin ride builder")).toBeVisible()
}

async function openBuilderWithProposal(page: Page): Promise<void> {
  await page.getByLabel("Gravel Goblin ride builder").getByRole("button").click()
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.fill("Three hours, gravel, no highways or tolls, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect(page.getByText(proposedRide.summary)).toBeVisible()
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 }
] as const) {
  test.describe(`Gravel Goblin ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test.beforeEach(async ({ page }) => {
      await pinVisualClock(page)
      await installMocks(page)
    })

    test("idle invitation", async ({ page }) => {
      await openPlanner(page)
      await expect(page).toHaveScreenshot(`gravel-goblin-idle-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.02,
        mask: [page.locator(".nextjs-toast")]
      })
    })

    test("expanded ride proposal", async ({ page }) => {
      await openPlanner(page)
      await openBuilderWithProposal(page)
      await expect(page.getByLabel("Gravel Goblin conversation")).toBeVisible()
      await expect(page).toHaveScreenshot(`gravel-goblin-proposal-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.02,
        mask: [page.locator(".nextjs-toast")]
      })
    })

    test("routed companion", async ({ page }) => {
      await openPlanner(page)
      await openBuilderWithProposal(page)
      await page.getByRole("button", { name: "Plan this ride" }).click()
      await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()
      await expect(page.getByLabel("Gravel Goblin conversation")).toBeVisible()
      await expect(page).toHaveScreenshot(`gravel-goblin-routed-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.02,
        mask: [page.locator(".nextjs-toast")]
      })
    })
  })
}
