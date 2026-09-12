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
        // Passes through the grounded stop anchor so the compound response is
        // genuine stop-inclusion evidence, not merely a changed route.
        geometry: [
          [-76.8867, 40.2732],
          [-76.94, 40.22],
          [-77.11, 40.16],
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

test("a reroute reply carrying fabricated nested prose renders only verified copy", async ({ page }) => {
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
            status: "ok",
            message: "Take Fantasy Mountain Road past the closure-free freshly paved detour.",
            secondOpinion: {
              agreesWithSwitchback: false,
              wouldPick: advisorAlternateRoute.id,
              rationale: "Fantasy Mountain Road is freshly paved and closure-free today.",
              cautions: ["Secret Ridge Road is closed until June", "95% gravel on the new section"],
              confidence: "high"
            },
            proposedStops: [],
            proposedRide: null,
            citations: [],
            usage: { toolCalls: 1, groundedQueries: 0 },
            capability
          })
    })
  })
  await page.route("**/api/routes", async (routeRequest) => {
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

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Find me a better route")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()

  // The client-side evidence gate rebuilds mutating action copy from verified
  // route state: the verified candidate survives, while every invented clause
  // in the message, rationale and cautions is dropped before it can reach the
  // transcript or the second-opinion panel. The panel itself clears once the
  // verified selection applies (its scope is now stale), so the rider never
  // sees the fabricated rationale or cautions at any point.
  await expect(page.getByText(/Better verified candidate: Ridge alternative/i)).toBeVisible()
  await expect(page.getByLabel("Things to keep in mind")).toHaveCount(0)
  await expect(page.getByText(/Fantasy Mountain Road|Secret Ridge|closed until June|95% gravel|freshly paved/i))
    .toHaveCount(0)
})

test("a changed route that does not pass the grounded stop is rejected with the route preserved", async ({ page }) => {
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
  // The compound command receives a materially different route whose geometry
  // never approaches the grounded stop, so route-change evidence alone must
  // not be accepted as compound success.
  await page.route("**/api/routes", async (routeRequest) => {
    const body = routeRequest.request().postDataJSON() as Record<string, unknown>
    const points = Array.isArray(body.points) ? body.points as Array<{ label?: string }> : []
    const includesFoodStop = points.some((point) => point.label === advisorFoodStop.name)
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selectedRouteId: includesFoodStop ? advisorAlternateRoute.id : route.id,
        warnings: [],
        routes: includesFoodStop ? [advisorAlternateRoute] : [route, advisorAlternateRoute]
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

  // Rejection: the committed pre-command route is preserved, a truthful
  // failure notice replaces any success copy, and the tentative Advisor via
  // is rolled back.
  await expect(page.getByLabel("Current route setup").getByText("Ridge & gravel run")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/could not verify a changed route that passes through|route is unchanged/i)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/is on a verified changed route/)).toHaveCount(0)
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

  // While the turn is in flight the rider sees the arithmetic OpenGravel
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

// --- Real MapLibre route-source proof --------------------------------------
//
// Route-card text, selected IDs, aria-pressed state, and screenshots do not
// prove that the MapLibre rendering authority received new route geometry.
// These tests read the real `switchback-routes` GeoJSON source through the
// generic E2E-only diagnostic seam exposed by map-stage-sources.ts.

interface RouteSourceFeature {
  properties: { routeId: string; selected: boolean }
  geometry: { type: string; coordinates: number[][] }
}

interface RouteSourceSnapshot {
  type: string
  features: RouteSourceFeature[]
}

async function readRouteSource(
  page: import("@playwright/test").Page
): Promise<RouteSourceSnapshot | null> {
  return page.evaluate(async () => {
    const debug = window.__switchbackMapSourcesDebug
    if (!debug) return null
    return ((await debug.getSourceData("switchback-routes")) ?? null) as RouteSourceSnapshot | null
  })
}

function selectedRouteOf(snapshot: RouteSourceSnapshot | null) {
  if (!snapshot) return null
  const selected = snapshot.features.filter((feature) => feature.properties.selected)
  return selected.length === 1
    ? {
        routeId: selected[0]!.properties.routeId,
        coordinates: selected[0]!.geometry.coordinates
      }
    : null
}

async function routeSourceUpdateCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () => window.__switchbackMapSourcesDebug?.getUpdateCount("switchback-routes") ?? -1
  )
}

async function waitForMapSourceSeam(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__switchbackMapSourcesDebug)), {
      timeout: 20_000,
      message: "E2E map source seam is missing"
    })
    .toBe(true)
}

test("a successful reroute pushes the newly selected route into the real MapLibre route source", async ({
  page
}) => {
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
      body: JSON.stringify(
        advisorTurns === 1
          ? builderReply
          : {
              ...compoundReply,
              message: "Better verified candidate: Ridge alternative.",
              proposedStops: [],
              secondOpinion: {
                ...compoundReply.secondOpinion,
                wouldPick: advisorAlternateRoute.id
              }
            }
      )
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
  await page
    .getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await waitForMapSourceSeam(page)

  // BEFORE: the real route source's selected geometry is the original route.
  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), {
      timeout: 30_000
    })
    .toEqual({ routeId: "advisor-e2e", coordinates: route.geometry })
  const updatesBefore = await routeSourceUpdateCount(page)

  await page.getByRole("textbox", { name: "Ask Gravel Goblin" }).fill("Find me a better route")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect(page.getByText(/Better verified candidate: Ridge alternative/)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Select Ridge alternative", exact: true })
  ).toHaveAttribute("aria-pressed", "true")

  // AFTER: the source received the NEWLY SELECTED canonical route's geometry.
  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), {
      timeout: 30_000,
      message: "route source never received the rerouted geometry"
    })
    .toEqual({
      routeId: "advisor-e2e-better",
      coordinates: advisorAlternateRoute.geometry
    })
  const updatesAfter = await routeSourceUpdateCount(page)
  expect(updatesAfter).toBeGreaterThan(updatesBefore)

  const after = await readRouteSource(page)
  const stillSelectedOld = after!.features.filter(
    (feature) => feature.properties.routeId === "advisor-e2e" && feature.properties.selected
  )
  expect(stillSelectedOld).toHaveLength(0)
})

test("manual route selection updates the same MapLibre route source without an Advisor command", async ({
  page
}) => {
  await mockBase(page)
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
      body: JSON.stringify(builderReply)
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
  await page
    .getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Three hours, gravel, end around Gettysburg")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await page.getByRole("button", { name: "Plan this ride" }).click()
  await expect(page.getByRole("heading", { name: "Your second opinion" })).toBeVisible()

  await waitForMapSourceSeam(page)

  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), {
      timeout: 30_000
    })
    .toEqual({ routeId: "advisor-e2e", coordinates: route.geometry })

  const afterPlanning = await routeSourceUpdateCount(page)
  await page.getByRole("button", { name: "Select Ridge alternative", exact: true }).click()
  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), {
      timeout: 30_000
    })
    .toEqual({
      routeId: "advisor-e2e-better",
      coordinates: advisorAlternateRoute.geometry
    })
  const afterAlternate = await routeSourceUpdateCount(page)
  expect(afterAlternate).toBeGreaterThan(afterPlanning)

  await page.getByRole("button", { name: "Select Ridge & gravel run", exact: true }).click()
  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), {
      timeout: 30_000
    })
    .toEqual({ routeId: "advisor-e2e", coordinates: route.geometry })
  expect(await routeSourceUpdateCount(page)).toBeGreaterThan(afterAlternate)
})

// Harness diagnostics for the N2 map-ribbon test. Clicking the real route hit
// layer only works once MapLibre has finished loading its style and sources, so
// the load state and any transport errors have to be observable on failure.
const n2MapDiagnostics: { console: string[]; wire: string[] } = { console: [], wire: [] }

// --- N2 (issue #117): manual map-ribbon selection during a compound action --
//
// This is deliberately not a route-card test. Route cards, store callbacks and
// React state cannot prove which *surface* owned the rider's manual choice, and
// the reported race is specifically that the rendered MapLibre ribbon selects
// through a path that the vehicle for in-flight advisor results does not
// observe.
//
// So this test clicks the real hit layer: ROUTE_HIT_LAYER over
// "switchback-routes", which PlannerMapStage wires to the canonical
// selectRoute command. That layer is filtered to `!selected`, so while route A
// is committed the only ribbon any canvas click can reach is the alternative.

const mapSelectionAlternateRoute = {
  ...advisorAlternateRoute,
  geometry: [
    [-76.8867, 40.2732],
    [-76.9, 39.98],
    [-77.3, 39.94],
    [-77.2311, 39.8309]
  ]
}

/**
 * Canvas pixels where MapLibre's own hit test reports route geometry.
 *
 * The hover handler sets a pointer cursor only when ROUTE_HIT_LAYER has
 * rendered geometry underneath the exact pixel, and that layer is filtered to
 * unselected routes. Scanning with real mousemove events therefore uses the
 * renderer's hit test as the oracle instead of guessing at pixels.
 */
async function findRouteRibbonPixels(
  page: import("@playwright/test").Page
): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas")
    if (!canvas) return []
    const rect = canvas.getBoundingClientRect()
    const hits: Array<{ x: number; y: number }> = []
    const step = 12
    const move = (x: number, y: number) => {
      canvas.dispatchEvent(new MouseEvent("mousemove", {
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true
      }))
    }
    for (let y = 4; y < rect.height && hits.length < 600; y += step) {
      for (let x = 4; x < rect.width && hits.length < 600; x += step) {
        move(x, y)
        if (canvas.style.cursor === "pointer") hits.push({ x, y })
      }
    }
    move(-20, -20)
    return hits
  })
}

/**
 * Click the rendered route ribbon over the real map canvas and return the pixel
 * that worked. The pixel is chosen by MapLibre's own hit test (see
 * findRouteRibbonPixels) and the selection is confirmed in the authoritative
 * "switchback-routes" source, so a click that never reached the hit layer
 * cannot pass.
 */
async function clickRouteRibbon(
  page: import("@playwright/test").Page,
  routeId: string
): Promise<{ x: number; y: number }> {
  const consoleLogs: string[] = []
  page.on("console", (message) => consoleLogs.push(`${message.type()}: ${message.text()}`))
  page.on("pageerror", (error) => consoleLogs.push(`pageerror: ${error.message}`))

  const snapshot = await readRouteSource(page)
  const feature = snapshot?.features.find((entry) => entry.properties.routeId === routeId)
  if (!feature) throw new Error(`route ${routeId} is not present in the rendered route source`)

  const canvas = page.locator("canvas").first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("map canvas has no bounding box")

  const projected = await page.evaluate((coordinates) => {
    const debug = window.__switchbackMapSourcesDebug
    if (!debug) return []
    return coordinates.map((coordinate) => debug.projectCoordinate(coordinate))
  }, feature.geometry.coordinates as Array<[number, number]>)

  // MapLibre's hit-test queries return nothing until the style and sources have
  // finished loading. A missing public/maplibre worker bundle (the postinstall
  // copy step) leaves the map permanently unloaded, which would otherwise look
  // like "the ribbon was not where the geometry says it is".
  const loadState = await page.evaluate(() => window.__switchbackMapSourcesDebug?.loadState() ?? null)
  if (!loadState?.routeSourceLoaded) {
    throw new Error(
      `the real map source is not loaded, so route ribbons cannot be clicked: ${JSON.stringify(loadState)}. ` +
      `Run \`node scripts/copy-maplibre-worker.mjs\` — without the worker bundle every MapLibre hit test returns nothing.`
    )
  }

  const hits = await findRouteRibbonPixels(page)
  if (hits.length === 0) {
    const loadState = await page.evaluate(() => window.__switchbackMapSourcesDebug?.loadState() ?? null)
    throw new Error(
      `no canvas pixel reaches ROUTE_HIT_LAYER, so no click can select a route. ` +
      `canvas=${JSON.stringify(box)} projected=${JSON.stringify(projected)} loadState=${JSON.stringify(loadState)} ` +
      `console=${JSON.stringify(consoleLogs.slice(-25))} early=${JSON.stringify(n2MapDiagnostics.console.slice(-25))} wire=${JSON.stringify(n2MapDiagnostics.wire.slice(-25))}`
    )
  }

  const attempts: string[] = []
  const candidates = hits.filter((_, index) => index % 89 === 0).slice(0, 10)
  for (const hit of candidates) {
    const x = box.x + hit.x
    const y = box.y + hit.y
    await page.mouse.click(x, y)
    await page.waitForTimeout(80)
    const selected = selectedRouteOf(await readRouteSource(page))
    if (selected?.routeId === routeId) return { x, y }
    attempts.push(`(${Math.round(x)},${Math.round(y)}) -> ${selected?.routeId ?? "none"}`)
  }

  throw new Error(
    `route-hit pixels exist (${hits.length}) but none selected ${routeId}: ` +
    `${attempts.join(" | ")}; projected=${JSON.stringify(projected)}`
  )
}

test("a manual map-ribbon selection during an in-flight compound Goblin action stays canonical", async ({
  page
}) => {
  n2MapDiagnostics.console.length = 0
  n2MapDiagnostics.wire.length = 0
  page.on("console", (message) => n2MapDiagnostics.console.push(`${message.type()}: ${message.text()}`))
  page.on("pageerror", (error) => n2MapDiagnostics.console.push(`pageerror: ${error.message}`))
  page.on("requestfailed", (request) => n2MapDiagnostics.wire.push(`FAILED ${request.failure()?.errorText} ${request.url()}`))
  page.on("request", (request) => {
    if (!request.url().includes("127.0.0.1")) n2MapDiagnostics.wire.push(`REQ ${request.url()}`)
  })
  await mockBase(page)

  let advisorTurns = 0
  let releaseRoute!: () => void
  const heldRoute = new Promise<void>((resolve) => { releaseRoute = resolve })
  let heldRequest = false
  let compoundRequestSettled = false

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
    if (points.some((point) => point.label === advisorFoodStop.name)) {
      // The compound route+stop mutation is deliberately held open so the rider
      // can act while it is genuinely in flight.
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
      body: JSON.stringify({
        selectedRouteId: route.id,
        warnings: [],
        routes: [route, mapSelectionAlternateRoute]
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

  await waitForMapSourceSeam(page)
  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), { timeout: 30_000 })
    .toEqual({ routeId: route.id, coordinates: route.geometry })

  // Start the compound route+stop action and let it hang in flight.
  await page.getByRole("textbox", { name: "Ask Gravel Goblin" })
    .fill("Find me a better route with a good food stop")
  await page.getByRole("button", { name: "Send to Gravel Goblin" }).click()
  await expect.poll(() => heldRequest, { timeout: 30_000 }).toBe(true)

  // The rider now picks the alternative by clicking its rendered map ribbon.
  const clickedAt = await clickRouteRibbon(page, mapSelectionAlternateRoute.id)
  await expect
    .poll(async () => selectedRouteOf(await readRouteSource(page)), { timeout: 30_000 })
    .toEqual({
      routeId: mapSelectionAlternateRoute.id,
      coordinates: mapSelectionAlternateRoute.geometry
    })

  // Release the stale compound answer and let it try to settle.
  releaseRoute()
  await expect.poll(() => compoundRequestSettled, { timeout: 30_000 }).toBe(true)
  await page.waitForTimeout(1_000)

  // The stale answer must not restore the old selection or its stop, and the
  // rider's map choice must still be what the real route source renders.
  expect(await selectedRouteOf(await readRouteSource(page))).toEqual({
    routeId: mapSelectionAlternateRoute.id,
    coordinates: mapSelectionAlternateRoute.geometry
  })
  // The click landed on the map surface itself, not on a card or a control.
  const canvasBox = await page.locator("canvas").first().boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(clickedAt.x).toBeGreaterThanOrEqual(canvasBox!.x)
  expect(clickedAt.x).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width)
  expect(clickedAt.y).toBeGreaterThanOrEqual(canvasBox!.y)
  expect(clickedAt.y).toBeLessThanOrEqual(canvasBox!.y + canvasBox!.height)
  await expect(page.getByText("Pine Diner is on a verified changed route.")).toHaveCount(0)
  await page.getByRole("button", { name: "Edit route", exact: true }).click()
  const rideOptions = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(rideOptions).toBeVisible()
  if (await rideOptions.getAttribute("aria-expanded") !== "true") await rideOptions.click()
  await expect(page.getByRole("button", { name: /Remove .*Pine Diner/i })).toHaveCount(0)
})
