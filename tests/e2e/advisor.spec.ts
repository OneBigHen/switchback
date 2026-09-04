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

const generatedRide = {
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
  message: "I’d run the ridges south, use Pine Grove Road for the mixed-surface section, then finish in Gettysburg.",
  secondOpinion: null,
  proposedStops: [],
  proposedRide: generatedRide,
  citations: [],
  usage: { toolCalls: 2, groundedQueries: 1 },
  capability
}

interface AdvisorMockOptions {
  capabilityPayload?: unknown
  reply?: unknown
  posts?: Array<Record<string, unknown>>
}

async function mockAdvisor(page: import("@playwright/test").Page, options: AdvisorMockOptions = {}) {
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability: options.capabilityPayload ?? capability })
      })
      return
    }
    options.posts?.push(routeRequest.request().postDataJSON() as Record<string, unknown>)
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.reply ?? builderReply)
    })
  })
}

test("AI builder is available before routing and becomes the route advisor after planning", async ({ page }) => {
  await mockBase(page)
  const primaryRequests: Record<string, unknown>[] = []

  await mockAdvisor(page)

  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    if ((body.candidateSet ?? "primary") === "primary") primaryRequests.push(body)
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route] })
    })
  })

  await page.goto(appUrl)

  // A: the AI path exists before RouteComparison. After deterministic routing,
  // this same conversation becomes B: the advisor for the produced route.
  const builder = page.getByRole("button", { name: "Plan a ride with me" })
  await expect(builder).toBeVisible()
  await builder.click()

  const composer = page.getByRole("textbox", { name: "Ask the ride advisor" })
  await composer.fill("Three hours, gravel, no highways or tolls, end around Gettysburg")
  await page.getByRole("button", { name: "Send to the ride advisor" }).click()
  await expect(page.getByText("Three hours of ridge roads and gravel to Gettysburg.")).toBeVisible()

  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect.poll(() => primaryRequests[0]).toMatchObject({
    profile: "adventure",
    targetMinutes: 180,
    avoidHighways: true,
    tollPolicy: "avoid"
  })
  // The card promised start -> Pine Grove Road -> Gettysburg. The very first
  // deterministic request must carry exactly that, in that order: no React
  // state commit may sit between the card and the router.
  expect((primaryRequests[0] as { points: Array<{ label?: string }> }).points.map((point) => point.label))
    .toEqual(["Harrisburg", "Pine Grove Road", "Gettysburg"])

  // The transcript survives the no-route -> route transition.
  await expect(page.getByText(/I’d run the ridges south/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "What I'd do" })).toBeVisible()

  // AI-confirmed shaping choices are ordinary, rider-editable planner options.
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  await expect(page.getByRole("checkbox", { name: "Avoid highways" })).toBeChecked()
  const avoidTolls = page.getByRole("checkbox", { name: "Avoid tolls" })
  await expect(avoidTolls).toBeChecked()

  // Editing the generated choice must affect the next deterministic route
  // request rather than remaining presentation-only state.
  await avoidTolls.uncheck()
  await page.getByRole("button", { name: "Replan", exact: true }).click()
  await expect.poll(() => primaryRequests[1]).toMatchObject({
    profile: "adventure",
    targetMinutes: 180,
    avoidHighways: true,
    tollPolicy: "allow-with-warning"
  })
})


test("the advisor surface does not exist at all when the capability is absent", async ({ page }) => {
  await mockBase(page)
  const posts: Array<Record<string, unknown>> = []
  await mockAdvisor(page, {
    capabilityPayload: { enabled: false, sources: [], attributions: [] },
    posts
  })

  await page.goto(appUrl)
  await expect(page.getByRole("button", { name: "Plan a ride with me" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Ask about this ride" })).toHaveCount(0)
  await expect(page.getByLabel("AI ride builder")).toHaveCount(0)
  // Ordinary planning is untouched: the planner's own controls are still there.
  await expect(page.getByRole("button", { name: "Ride options", exact: true })).toBeVisible()
  expect(posts).toHaveLength(0)
})

test("opening the empty builder spends no model turn until the rider actually asks", async ({ page }) => {
  await mockBase(page)
  const posts: Array<Record<string, unknown>> = []
  await mockAdvisor(page, { posts })

  await page.goto(appUrl)
  const builder = page.getByRole("button", { name: "Plan a ride with me" })
  await expect(builder).toBeVisible()
  await builder.click()

  const composer = page.getByRole("textbox", { name: "Ask the ride advisor" })
  await expect(composer).toBeVisible()
  // Give any accidental automatic turn time to fire.
  await page.waitForTimeout(500)
  expect(posts).toHaveLength(0)

  // A starter chip is a real question, so that one does spend a turn.
  await page.getByRole("button", { name: "Somewhere twisty for the afternoon" }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ riderMessage: "Somewhere twisty for the afternoon" })
  // No route yet, so no route context may be invented for the model.
  expect(posts[0]!.context ?? null).toBeNull()
})

test("the composer is reachable and operable by keyboard alone", async ({ page }) => {
  await mockBase(page)
  await mockAdvisor(page)
  await page.goto(appUrl)

  await page.getByRole("button", { name: "Plan a ride with me" }).click()
  const composer = page.getByRole("textbox", { name: "Ask the ride advisor" })
  await composer.focus()
  await expect(composer).toBeFocused()
  await composer.fill("Three hours of gravel")
  await page.keyboard.press("Enter")
  await expect(page.getByText("Three hours of ridge roads and gravel to Gettysburg.")).toBeVisible()

  // The close control is a labelled button, not an icon-only div.
  const close = page.getByRole("button", { name: "Close the ride advisor" })
  await close.focus()
  await expect(close).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(composer).toHaveCount(0)
})

test("a stale in-flight answer never paints against a route it was not asked about", async ({ page }) => {
  await mockBase(page)
  const second = { ...route, id: "advisor-e2e-alt", name: "Fast way south", twistiness: 30, durationMinutes: 120 }

  let release = (): void => {}
  const held = new Promise<void>((resolve) => { release = () => resolve() })
  const staleReply = {
    status: "ok",
    message: "STALE ANSWER about the route you already left.",
    secondOpinion: null,
    proposedStops: [{
      id: "stale-stop",
      name: "Stale Brewery",
      reason: "Belongs to the route you replaced.",
      kind: "brewery",
      anchor: { lat: 40.1, lon: -77.0 },
      routeProgress: 0.5,
      citations: []
    }],
    proposedRide: null,
    citations: [],
    usage: { toolCalls: 1, groundedQueries: 0 },
    capability
  }

  let turn = 0
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    turn += 1
    // Turn 1 builds the ride. Turn 2 is the one we hold in flight.
    const body = turn === 1 ? builderReply : staleReply
    if (turn === 2) await held
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body)
    })
  })

  await page.route("**/api/routes", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route, second] })
    })
  })

  await page.goto(appUrl)
  await page.getByRole("button", { name: "Plan a ride with me" }).click()
  await page.getByRole("textbox", { name: "Ask the ride advisor" })
    .fill("Three hours, gravel, end near Gettysburg")
  await page.getByRole("button", { name: "Send to the ride advisor" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "What I\'d do" })).toBeVisible()

  // Ask about the route that exists now, and hold that turn in flight.
  await page.getByRole("textbox", { name: "Ask the ride advisor" }).fill("Anything worth stopping for?")
  await page.getByRole("button", { name: "Send to the ride advisor" }).click()
  await expect(page.getByText("Reading the roads…")).toBeVisible()

  // The rider changes which route they are deciding about, then the old answer
  // finally arrives. It was asked about a different route and must be discarded.
  await page.getByRole("button", { name: "Select Fastest Now" }).first().click()
  release()
  await page.waitForTimeout(750)

  await expect(page.getByText("Stale Brewery")).toHaveCount(0)
  await expect(page.getByText("STALE ANSWER about the route you already left.")).toHaveCount(0)
  // The transcript itself survives the route change; only route-scoped artifacts go.
  await expect(page.getByText("Three hours, gravel, end near Gettysburg")).toBeVisible()
})
