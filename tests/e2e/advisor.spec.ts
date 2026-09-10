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

const advisorAlternateRoute = {
  ...route,
  id: "advisor-e2e-better",
  name: "Ridge alternative",
  geometry: [
    [-76.8867, 40.2732],
    [-76.98, 40.21],
    [-77.12, 40.02],
    [-77.2311, 39.8309]
  ],
  distanceMiles: 61.2,
  durationMinutes: 188,
  twistiness: 86,
  turnCount: 61
}

const advisorDuplicateRoute = {
  ...advisorAlternateRoute,
  id: "advisor-e2e-duplicate",
  name: "Duplicate geometry option",
  geometry: route.geometry,
  distanceMiles: route.distanceMiles,
  durationMinutes: route.durationMinutes,
  twistiness: route.twistiness,
  turnCount: route.turnCount
}

const advisorFoodStop = {
  id: "osm-food-1",
  name: "Pine Diner",
  reason: "Grounded food stop near the route midpoint.",
  kind: "food",
  anchor: { lat: 40.16, lon: -77.11 },
  routeProgress: 0.54,
  citations: [{
    title: "OpenStreetMap",
    url: "https://www.openstreetmap.org/?mlat=40.1&mlon=-77.05",
    source: "switchback-local"
  }]
}

const compoundReply = {
  status: "ok",
  message: "Grounded stop: Pine Diner. A different verified route candidate is ready.",
  secondOpinion: {
    agreesWithSwitchback: false,
    wouldPick: advisorAlternateRoute.id,
    rationale: "More curves on the verified candidate.",
    cautions: [],
    confidence: "medium"
  },
  proposedStops: [advisorFoodStop],
  proposedRide: null,
  citations: advisorFoodStop.citations,
  usage: { toolCalls: 1, groundedQueries: 1 },
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
  // Changing a ride option *is* the replan in V2: the toll switch applies the
  // edit, re-runs routing itself, and leaves the editor once the new route is
  // ready. The separate "Replan" tap belonged to V1 and now races that exit —
  // on a phone the button has already unmounted by the time the tap lands. So
  // assert the ride the rider ends up with, both on the wire and on screen.
  await expect(page.getByText("Allowed tolls")).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => primaryRequests[1], { timeout: 30_000 }).toMatchObject({
    profile: "adventure",
    targetMinutes: 180,
    avoidHighways: true,
    tollPolicy: "allow-with-warning"
  })
})

test("a grounded better-route-plus-stop command routes through canonical planner state", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  const routeRequests: Array<Record<string, unknown>> = []

  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1 ? builderReply : compoundReply)
    })
  })

  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    routeRequests.push(body)
    const points = Array.isArray(body.points) ? body.points as Array<{ label?: string }> : []
    const includesFoodStop = points.some((point) => point.label === advisorFoodStop.name)
    const routes = includesFoodStop ? [
      {
        ...route,
        id: "advisor-e2e-with-food",
        name: "Ridge route via Pine Diner",
        geometry: [
          [-76.8867, 40.2732],
          [-76.94, 40.22],
          [-77.05, 40.1],
          [-77.2311, 39.8309]
        ],
        waypoints: [
          route.waypoints[0],
          advisorFoodStop.anchor,
          route.waypoints[route.waypoints.length - 1]!
        ],
        distanceMiles: 63.7,
        durationMinutes: 196,
        twistiness: 84,
        turnCount: 58
      }
    ] : [route, advisorAlternateRoute]
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: routes[0]!.id,
        warnings: [],
        routes
      })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  const changedRouteRequest = page.waitForRequest((request) => {
    if (request.url().includes("/api/routes") === false || request.method() !== "POST") return false
    const body = request.postDataJSON() as Record<string, unknown>
    return Array.isArray(body.points)
      && (body.points as Array<{ label?: string }>).some((point) => point.label === advisorFoodStop.name)
  })
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.fill("Find me a better route with a good food stop")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await changedRouteRequest

  await expect(page.getByLabel("Current route setup").getByText("Ridge route via Pine Diner")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Pine Diner is on a verified changed route/)).toBeVisible()
  expect(routeRequests.some((request) => {
    const points = request.points
    return Array.isArray(points) && (points as Array<{ label?: string }>).some((point) => point.label === advisorFoodStop.name)
  })).toBe(true)
  await expect(page.locator("canvas").first()).toBeVisible()
})

test("a stale compound Goblin route request cannot overwrite a newer manual route selection", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  let releaseRoute!: () => void
  const heldRoute = new Promise<void>((resolve) => { releaseRoute = resolve })
  let heldRequest = false
  let compoundRequestSettled = false

  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ capability }) })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1 ? builderReply : compoundReply)
    })
  })

  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    const points = Array.isArray(body.points) ? body.points as Array<{ label?: string }> : []
    const includesFoodStop = points.some((point) => point.label === advisorFoodStop.name)
    if (includesFoodStop) {
      heldRequest = true
      await heldRoute
      try {
        await routeRequest.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            selectedRouteId: "advisor-e2e-with-food",
            warnings: [],
            routes: [{
              ...route,
              id: "advisor-e2e-with-food",
              name: "Ridge route via Pine Diner",
              geometry: [[-76.8867, 40.2732], [-76.94, 40.22], [-77.2311, 39.8309]],
              distanceMiles: 63.7,
              durationMinutes: 196,
              twistiness: 84,
              turnCount: 58
            }]
          })
        })
      } finally {
        compoundRequestSettled = true
      }
      return
    }
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route, advisorAlternateRoute] })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" }).fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" }).fill("Find me a better route with a good food stop")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect.poll(() => heldRequest).toBe(true)

  const manualChoice = page.getByRole("button", { name: "Select Ridge alternative", exact: true })
  await manualChoice.click()
  await expect(manualChoice).toHaveAttribute("aria-pressed", "true")

  releaseRoute()
  await expect.poll(() => compoundRequestSettled).toBe(true)

  await expect(page.getByRole("button", { name: "Select Ridge alternative", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Pine Diner is on a verified changed route.")).toHaveCount(0)
  await page.getByRole("button", { name: "Edit route", exact: true }).click()
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(options).toBeVisible()
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  await expect(page.getByRole("button", { name: /Remove .*Pine Diner/i })).toHaveCount(0)
})

test("a failed grounded-stop lookup leaves the existing route untouched", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  const routeRequests: Array<Record<string, unknown>> = []

  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1
        ? builderReply
        : {
            ...compoundReply,
            message: "I couldn’t ground a routable stop for that request, so I left the route unchanged.",
            proposedStops: [],
            secondOpinion: null,
            citations: [],
            usage: { toolCalls: 1, groundedQueries: 1 }
          })
    })
  })

  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    routeRequests.push(body)
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: route.id,
        warnings: [],
        routes: [route, advisorAlternateRoute]
      })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  const requestsBeforeCommand = routeRequests.length
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.fill("Find me a better route with a good food stop")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  await expect(page.getByText(/couldn.t ground a routable stop|route unchanged/i)).toBeVisible()
  await expect(page.getByLabel("Current route setup").getByText("Ridge & gravel run")).toBeVisible()
  expect(routeRequests).toHaveLength(requestsBeforeCommand)
  await expect(page.getByText(/Pine Diner|Imaginary|Secret Ridge/)).toHaveCount(0)
})

test("a grounded stop whose routing fails leaves the canonical route and waypoints untouched", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  const routeRequests: Array<Record<string, unknown>> = []

  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1 ? builderReply : compoundReply)
    })
  })

  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    routeRequests.push(body)
    const points = Array.isArray(body.points) ? body.points as Array<{ label?: string }> : []
    if (points.some((point) => point.label === advisorFoodStop.name)) {
      await routeRequest.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ROUTE_UNAVAILABLE", message: "Fixture router unavailable" } })
      })
      return
    }
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: route.id,
        warnings: [],
        routes: [route, advisorAlternateRoute]
      })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  const requestsBeforeCommand = routeRequests.length
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.fill("Find me a better route with a good food stop")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  await expect(page.getByText(/couldn.t route through Pine Diner|route unchanged/i)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel("Current route setup").getByText("Ridge & gravel run")).toBeVisible()
  expect(routeRequests.length).toBeGreaterThan(requestsBeforeCommand)

  await page.getByRole("button", { name: "Edit route", exact: true }).click()
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(options).toBeVisible({ timeout: 15_000 })
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  await expect(page.getByRole("button", { name: /Remove .*Pine Diner/i })).toHaveCount(0)
})

test("a grounded stop with no changed route leaves canonical intent untouched", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1 ? builderReply : compoundReply)
    })
  })
  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    const points = Array.isArray(body.points) ? body.points as Array<{ label?: string }> : []
    const includesFoodStop = points.some((point) => point.label === advisorFoodStop.name)
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: route.id,
        warnings: [],
        routes: includesFoodStop ? [route] : [route, advisorAlternateRoute]
      })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Find me a better route with a good food stop")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  await expect(page.getByText(/could not verify a different valid route|route is unchanged/i)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Edit route", exact: true }).click()
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(options).toBeVisible({ timeout: 15_000 })
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  await expect(page.getByRole("button", { name: /Remove .*Pine Diner/i })).toHaveCount(0)
})

test("a pure reroute command selects a verified alternative in canonical planner and map state", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1
        ? builderReply
        : {
            ...compoundReply,
            message: "Better verified candidate: Ridge alternative.",
            proposedStops: [],
            secondOpinion: {
              ...compoundReply.secondOpinion,
              wouldPick: advisorAlternateRoute.id
            }
          })
    })
  })
  await page.route("**/api/routes", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: route.id,
        warnings: [],
        routes: [route, advisorAlternateRoute]
      })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Find me a better route")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect(page.getByText(/Better verified candidate: Ridge alternative/)).toBeVisible()
  await expect(page.getByLabel("Current route setup").getByText("Ridge alternative")).toBeVisible()
  await expect(page.getByRole("button", { name: "Select Ridge alternative", exact: true })).toHaveAttribute("aria-pressed", "true")
})

test("a pure reroute without a verified alternative leaves the existing route unchanged", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  const routeRequests: Array<Record<string, unknown>> = []
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1
        ? builderReply
        : {
            ...compoundReply,
            message: "I found a wonderful secret route through Secret Ridge.",
            proposedStops: [],
            secondOpinion: null
          })
    })
  })
  await page.route("**/api/routes", async (routeRequest) => {
    routeRequests.push(routeRequest.request().postDataJSON() as Record<string, unknown>)
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route, advisorAlternateRoute] })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  const requestsBeforeCommand = routeRequests.length
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Find me a better route")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  await expect(page.getByText(/don.t have a better verified route candidate/i)).toBeVisible()
  await expect(page.getByLabel("Current route setup").getByText("Ridge & gravel run")).toBeVisible()
  expect(routeRequests).toHaveLength(requestsBeforeCommand)
  await expect(page.getByText(/Secret Ridge/)).toHaveCount(0)
})

test("a pure reroute rejects a different id when the candidate geometry is identical", async ({ page }) => {
  await mockBase(page)
  let advisorTurns = 0
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    advisorTurns += 1
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisorTurns === 1
        ? builderReply
        : {
            ...compoundReply,
            message: "Better verified candidate: Duplicate geometry option.",
            proposedStops: [],
            secondOpinion: {
              ...compoundReply.secondOpinion,
              wouldPick: advisorDuplicateRoute.id
            }
          })
    })
  })
  await page.route("**/api/routes", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: route.id,
        warnings: [],
        routes: [route, advisorDuplicateRoute]
      })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Find me a better route")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  await expect(page.getByText(/don.t have a better verified route candidate/i)).toBeVisible()
  await expect(page.getByLabel("Current route setup").getByText("Ridge & gravel run")).toBeVisible()
  await expect(page.getByRole("button", { name: "Select Ridge & gravel run", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "Select Duplicate geometry option", exact: true })).toHaveAttribute("aria-pressed", "false")
})

test("a route-only question shows deterministic route facts, never a bare spinner", async ({ page }) => {
  await mockBase(page)
  let turn = 0
  await page.route("**/api/advisor", async (routeRequest) => {
    if (routeRequest.request().method() === "GET") {
      await routeRequest.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ capability })
      })
      return
    }
    turn += 1
    if (turn === 1) {
      // First turn builds the ride, so the planner has a route to talk about.
      await routeRequest.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify(builderReply)
      })
      return
    }
    // Second turn is the route-only question. Hold it open so the working
    // state is observable: the point of the mode is that the rider is not
    // staring at nothing while this happens.
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    await routeRequest.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        message: "Take the gravel — the extra time buys real dirt.",
        secondOpinion: null, proposedStops: [], proposedRide: null, citations: [],
        usage: { toolCalls: 0, groundedQueries: 0, mode: "route-only", answeredBy: "openrouter" },
        capability
      })
    })
  })
  await page.route("**/api/routes", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ selectedRouteId: route.id, warnings: [], routes: [route] })
    })
  })

  await page.goto(appUrl)
  await goblinBuilder(page).click()
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  await composer.fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  // Now a question answerable from the briefing alone.
  await composer.fill("Worth the extra 25 minutes?")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  // While the turn is in flight the rider sees the arithmetic Switchback
  // already did — a real fact, not "Sniffing out the good roads…" and not a preview of
  // the model's verdict.
  const working = page.getByText(/Weighing .*(min|unpaved|curve)/)
  await expect(working).toBeVisible()
  const workingText = (await working.textContent()) ?? ""
  for (const verdict of ["worth", "recommend", "better", "should"]) {
    expect(workingText.toLowerCase()).not.toContain(verdict)
  }

  // It is replaced by the validated answer, never left alongside it.
  await expect(page.getByText("Take the gravel — the extra time buys real dirt.")).toBeVisible()
  await expect(working).toHaveCount(0)
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

test("an invalid advisor request keeps the rider's text and explains recovery", async ({ page }) => {
  await mockBase(page)
  const posts: Array<Record<string, unknown>> = []
  await page.route("**/api/advisor", async (request) => {
    if (request.request().method() === "GET") {
      await request.fulfill({ status: 200, json: { capability } })
      return
    }
    posts.push(request.request().postDataJSON() as Record<string, unknown>)
    if (posts.length === 1) {
      await request.fulfill({ status: 400, json: { error: { code: "INVALID_ADVISOR_REQUEST" } } })
      return
    }
    await request.fulfill({ status: 200, json: builderReply })
  })
  await page.goto(appUrl)
  await goblinBuilder(page).click()
  const composer = page.getByRole("textbox", { name: "Ask Gravel Goblin" })
  const riderMessage = "I have 90 minutes; mostly backroads."
  await composer.fill(riderMessage)
  await composer.press("Enter")
  await expect(page.getByText("I couldn’t read that ride request. Shorten it or refresh the ride, then try again.")).toBeVisible()
  await expect(composer).toHaveValue(riderMessage)
  await expect(page.getByRole("button", { name: "Send to Gravel Goblin" })).toBeEnabled()

  await composer.press("Enter")
  await expect(page.getByText(builderReply.message)).toBeVisible()
  expect(posts).toHaveLength(2)
  expect(posts.map((post) => post.riderMessage)).toEqual([riderMessage, riderMessage])
  expect(posts[1]?.conversation).toEqual([])
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
  let staleResponseSettled = false
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
    const isStaleTurn = turn === 2
    const body = turn === 1 ? builderReply : staleReply
    if (isStaleTurn) await held
    try {
      await routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body)
      })
    } finally {
      if (isStaleTurn) staleResponseSettled = true
    }
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

  await page.getByRole("button", { name: "Select Fast way south", exact: true }).click()
  release()
  await expect.poll(() => staleResponseSettled).toBe(true)

  await expect(page.getByText("Stale Brewery")).toHaveCount(0)
  await expect(page.getByText("STALE ANSWER about the route you already left.")).toHaveCount(0)
  await expect(page.getByText("Three hours, gravel, end near Gettysburg")).toBeVisible()
})
