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
  capabilityRequests?: string[]
}

async function mockAdvisor(page: import("@playwright/test").Page, options: AdvisorMockOptions = {}) {
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      options.capabilityRequests?.push(routeRequest.request().url())
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

function goblinBuilder(page: import("@playwright/test").Page) {
  return page.getByLabel("Gravel Goblin ride builder").getByRole("button")
}

test("Gravel Goblin is available before routing and becomes the route companion after planning", async ({ page }) => {
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

  const builder = goblinBuilder(page)
  await expect(builder).toBeVisible()
  await expect(builder).toContainText("Gravel Goblin")
  await expect(builder).toContainText("Need a ride idea?")
  await builder.click()

  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.fill("Three hours, gravel, no highways or tolls, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect(page.getByText("Three hours of ridge roads and gravel to Gettysburg.")).toBeVisible()

  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect.poll(() => primaryRequests[0]).toMatchObject({
    profile: "adventure",
    targetMinutes: 180,
    avoidHighways: true,
    tollPolicy: "avoid"
  })
  expect((primaryRequests[0] as { points: Array<{ label?: string }> }).points.map((point) => point.label))
    .toEqual(["Harrisburg", "Pine Grove Road", "Gettysburg"])

  await expect(page.getByText(/I’d run the ridges south/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()
  await expect(page.getByLabel("Gravel Goblin conversation")).toBeVisible()
  await expect(page.getByRole("button", { name: "Edit route" })).toBeVisible()

  await page.getByRole("button", { name: "Edit route" }).click()
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(options).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("checkbox", { name: "Avoid highways" })).toBeChecked()
  const avoidTolls = page.getByRole("checkbox", { name: "Avoid tolls" })
  await expect(avoidTolls).toBeChecked()

  await avoidTolls.uncheck()
  await page.getByRole("button", { name: "Replan", exact: true }).click()
  await expect.poll(() => primaryRequests[1]).toMatchObject({
    profile: "adventure",
    targetMinutes: 180,
    avoidHighways: true,
    tollPolicy: "allow-with-warning"
  })
})

test("the Gravel Goblin surface does not exist at all when the capability is absent", async ({ page }) => {
  await mockBase(page)
  const posts: Array<Record<string, unknown>> = []
  await mockAdvisor(page, {
    capabilityPayload: { enabled: false, sources: [], attributions: [] },
    posts
  })

  await page.goto(appUrl)
  await expect(page.getByLabel("Gravel Goblin ride builder")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Ask Gravel Goblin" })).toHaveCount(0)
  await expect(page.getByLabel("Gravel Goblin")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Ride options", exact: true })).toBeVisible()
  expect(posts).toHaveLength(0)
})

test("an offline rider is never asked to wait on a capability probe that cannot succeed", async ({ page }) => {
  await mockBase(page)
  const capabilityRequests: string[] = []
  await mockAdvisor(page, { capabilityRequests })

  await page.addInitScript(() => {
    let online = false
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online })
    Object.defineProperty(window, "__setOnline", {
      configurable: true,
      value: (next: boolean) => { online = next }
    })
  })

  await page.goto(appUrl)
  await expect(page.getByRole("button", { name: "Ride options", exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  expect(capabilityRequests).toHaveLength(0)
  await expect(page.getByLabel("Gravel Goblin ride builder")).toHaveCount(0)

  await page.evaluate(() => {
    ;(window as unknown as { __setOnline(next: boolean): void }).__setOnline(true)
    window.dispatchEvent(new Event("online"))
  })
  await expect(goblinBuilder(page)).toBeVisible()
  expect(capabilityRequests.length).toBeGreaterThan(0)
})

test("opening Gravel Goblin spends no model turn until the rider actually asks", async ({ page }) => {
  await mockBase(page)
  const posts: Array<Record<string, unknown>> = []
  await mockAdvisor(page, { posts })

  await page.goto(appUrl)
  const builder = goblinBuilder(page)
  await expect(builder).toBeVisible()
  await builder.click()

  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await expect(composer).toBeVisible()
  await page.waitForTimeout(500)
  expect(posts).toHaveLength(0)

  await page.getByRole("button", { name: "Somewhere twisty for the afternoon" }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ riderMessage: "Somewhere twisty for the afternoon" })
  expect(posts[0]!.context ?? null).toBeNull()
})

test("the Gravel Goblin composer is reachable and operable by keyboard alone", async ({ page }) => {
  await mockBase(page)
  await mockAdvisor(page)
  await page.goto(appUrl)

  await goblinBuilder(page).click()
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.focus()
  await expect(composer).toBeFocused()
  await composer.fill("Three hours of gravel")
  await page.keyboard.press("Enter")
  await expect(page.getByText("Three hours of ridge roads and gravel to Gettysburg.")).toBeVisible()

  const close = page.getByRole("button", { name: "Close Gravel Goblin" })
  await close.focus()
  await expect(close).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(composer).toHaveCount(0)
})

test("a stale in-flight Goblin answer never paints against a route it was not asked about", async ({ page }) => {
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
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end near Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" }).fill("Anything worth stopping for?")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect(page.getByText("Sniffing out the good roads…")).toBeVisible()

  await page.getByRole("button", { name: "Select Fastest Now" }).first().click()
  release()
  await page.waitForTimeout(750)

  await expect(page.getByText("Stale Brewery")).toHaveCount(0)
  await expect(page.getByText("STALE ANSWER about the route you already left.")).toHaveCount(0)
  await expect(page.getByText("Three hours, gravel, end near Gettysburg")).toBeVisible()
})
