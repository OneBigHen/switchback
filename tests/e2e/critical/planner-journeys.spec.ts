import { expect, test } from "@playwright/test"
import {
  FIXTURE_FINISH,
  installPlannerServices,
  installRideIntentApi,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  expandPhonePlanner,
  expectRouteOutcome,
  tripPlan,
  type RouteCapture
} from "../helpers/planner-fixtures"

const QUICK_SUGGESTIONS = [
  { label: "1-hour loop", name: "one-hour loop" },
  { label: "Twisties", name: "Twisties" },
  { label: "Scenic", name: "Scenic" }
] as const

const PROMPT_EXAMPLES = [
  { prompt: "Twisty ride to Pine Creek Gorge", name: "Pine Creek Gorge" },
  { prompt: "Scenic ride to New Hope with a coffee stop", name: "New Hope scenic route" }
] as const

async function ensureStart(page: import("@playwright/test").Page): Promise<void> {
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  if ((await start.inputValue()).length === 0) {
    await page.getByRole("button", { name: /current location/i }).click()
  }
  await expect(start).toHaveValue(/Current location|Fixture start/)
}

async function chooseFixtureFinish(page: import("@playwright/test").Page): Promise<void> {
  const finish = page.getByRole("combobox", { name: "Finish", exact: true })
  await finish.fill("Fixture finish")
  await expect(page.getByRole("option", { name: /Fixture finish/i })).toBeVisible()
  await page.getByRole("option", { name: /Fixture finish/i }).click()
  await expect(finish).toHaveValue(/Fixture finish/i)
}

async function planDirectRoute(page: import("@playwright/test").Page, capture: RouteCapture): Promise<void> {
  await page.goto("/")
  await expandPhonePlanner(page)
  await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
  await openPlannerEditor(page)
  await ensureStart(page)
  await chooseFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).click()
  await expectRouteOutcome(page, capture)
}

for (const suggestion of QUICK_SUGGESTIONS) {
  test(`built-in ${suggestion.name} suggestion reaches a routed outcome`, async ({ page }) => {
    await installPlannerServices(page)
    await installRideIntentApi(page)
    const capture = await installRouteApi(page, tripPlan([makeRoute(
      suggestion.label === "Scenic" ? "scenic" : "twisty",
      { name: `${suggestion.name} result` }
    )]))

    await page.goto("/")
    await expandPhonePlanner(page)
    await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
    // These chips are intentionally removed as soon as the prompt is
    // committed. Dispatch the user click without asking Playwright to keep
    // re-resolving a DOM node that the product deliberately replaces.
    await page.getByRole("button", { name: new RegExp(`^${suggestion.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).evaluate((element) => {
      (element as HTMLButtonElement).click()
    })
    await expectRouteOutcome(page, capture)
    await expect(page.getByText(new RegExp(`${suggestion.name} result`))).toBeVisible()
  })
}

for (const suggestion of PROMPT_EXAMPLES) {
  test(`ride example ${suggestion.name} reaches a routed outcome`, async ({ page }) => {
    await installPlannerServices(page)
    await installRideIntentApi(page)
    const capture = await installRouteApi(page, tripPlan([makeRoute(
      suggestion.name === "New Hope scenic route" ? "scenic" : "twisty",
      { name: `${suggestion.name} result` }
    )]))

    await page.goto("/")
    await expandPhonePlanner(page)
    const prompt = page.getByRole("textbox", { name: "Where do you want to ride?" })
    // Type rather than fill(): Playwright's fill() dispatches a single
    // synthetic input event that WebKit + this controlled input can drop,
    // leaving React state empty while the DOM shows the text. Real keystrokes
    // commit state reliably in every engine.
    await prompt.click()
    await page.keyboard.type(suggestion.prompt)
    // Wait for the app to commit the typed value (submit enables only once
    // the controlled state has caught up) before pressing Enter.
    await expect(page.getByRole("button", { name: "Find ride options" })).toBeEnabled()
    await prompt.press("Enter")
    await expectRouteOutcome(page, capture)
    await expect(page.getByText(new RegExp(`${suggestion.name} result`))).toBeVisible()
  })
}

test("destination planning sends the selected points and displays the final route", async ({ page }) => {
  await installPlannerServices(page)
  const capture = await installRouteApi(page, tripPlan([makeRoute("quick", { name: "Destination result", distanceMiles: 6.4, durationMinutes: 12 })]))
  await planDirectRoute(page, capture)

  expect(capture.requests[0]).toMatchObject({
    profile: "twisty",
    points: [
      { lat: 40.2732, lon: -76.8867 },
      { lat: FIXTURE_FINISH.lat, lon: FIXTURE_FINISH.lon }
    ]
  })
  await expect(page.getByText("Destination result")).toBeVisible()
})

test("loop planning uses one fixed start and completes with a non-empty geometry", async ({ page }) => {
  await installPlannerServices(page)
  const loop = makeRoute("twisty", {
    name: "Two-hour loop result",
    geometry: [
      [-76.8867, 40.2732],
      [-76.84, 40.31],
      [-76.8, 40.27],
      [-76.8867, 40.2732]
    ],
    distanceMiles: 42.1,
    durationMinutes: 120
  })
  const capture = await installRouteApi(page, tripPlan([loop]))
  await page.goto("/")
  await openPlannerEditor(page)
  await ensureStart(page)
  await page.getByRole("button", { name: "Loop ride" }).click()
  await page.getByRole("button", { name: "Plan a 2-hour loop" }).click()
  await expectRouteOutcome(page, capture)
  expect(capture.requests[0]).toMatchObject({
    roundTrip: { targetMinutes: 120 },
    points: [{ lat: 40.2732, lon: -76.8867 }]
  })
  expect(capture.responses[0]?.body.routes[0]?.geometry.length).toBeGreaterThanOrEqual(4)
})

test("location denial falls back to an honest approximate start and still reaches a route", async ({ page }) => {
  await page.context().clearPermissions()
  await installPlannerServices(page)
  await installRideIntentApi(page)
  const capture = await installRouteApi(page, tripPlan([makeRoute("twisty", { name: "Denied-location fallback" })]))
  await page.goto("/")
  await page.getByRole("button", { name: "1-hour loop" }).click()
  await expectRouteOutcome(page, capture)
  await expect(page.getByText("Couldn't get a live location", { exact: false })).toBeVisible()
  expect(capture.requests[0]?.points).toEqual([{
    lat: 40.2732,
    lon: -76.8867,
    label: "Approximate start · Harrisburg area"
  }])
})

test("provider failure ends loading and exposes a typed actionable error", async ({ page }) => {
  await installPlannerServices(page)
  await page.route("**/api/routes", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The route service is temporarily unavailable. Try again in a moment."
        }
      })
    })
  })
  await page.goto("/")
  await openPlannerEditor(page)
  await ensureStart(page)
  await chooseFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).click()
  await expect(page.getByText("Route unavailable")).toBeVisible()
  await expect(page.getByText(/temporarily unavailable/i)).toBeVisible()
  await expect(page.getByRole("status", { name: "Ride planning progress" })).toBeHidden()
  await expect(page.getByRole("button", { name: "Plan route" })).toBeEnabled()
})

test("a newer plan wins and a stale provider response cannot overwrite it", async ({ page }) => {
  await installPlannerServices(page)
  await installRideIntentApi(page)
  const requests: Array<Record<string, unknown>> = []
  const responses = [
    tripPlan([makeRoute("scenic", { id: "stale-route", name: "Stale first result" })]),
    tripPlan([makeRoute("twisty", { id: "fresh-route", name: "Fresh second result" })])
  ]
  await page.route("**/api/routes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    requests.push(request)
    const response = responses[Math.min(requests.length - 1, responses.length - 1)]!
    if (requests.length === 1) await new Promise((resolve) => setTimeout(resolve, 1_500))
    try {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) })
    } catch {
      // The client intentionally aborts the stale request; its response must
      // not become a visible test failure.
    }
  })

  await page.goto("/")
  await expandPhonePlanner(page)
  const prompt = page.locator("#ride-prompt")
  await prompt.click()
  await page.keyboard.type("first destination")
  await prompt.press("Enter")
  await expect.poll(() => requests.length).toBe(1)
  await page.getByRole("button", { name: "Twisties", exact: true }).click()
  await expectRouteOutcome(page, {
    requests,
    responses: requests.map((request, index) => ({ request, body: responses[Math.min(index, responses.length - 1)]! }))
  })
  await expect(page.getByText("Fresh second result")).toBeVisible()
  await expect(page.getByText("Stale first result")).toBeHidden()
  expect(requests.length).toBeGreaterThanOrEqual(2)
})

test("route alternatives arrive after the primary and selection updates the visible route", async ({ page }) => {
  await installPlannerServices(page)
  const primary = makeRoute("twisty", { id: "primary-route", name: "Primary route" })
  const alternative = makeRoute("scenic", {
    id: "alternative-route",
    name: "Scenic alternative",
    geometry: [[-76.8867, 40.2732], [-76.92, 40.32], [-76.82, 40.31]],
    distanceMiles: 9.6,
    durationMinutes: 21
  })
  const capture: RouteCapture = { requests: [], responses: [] }
  await page.route("**/api/routes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    const response = request.candidateSet === "alternatives"
      ? tripPlan([alternative])
      : tripPlan([primary])
    capture.requests.push(request)
    capture.responses.push({ request, body: response })
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) })
  })
  await planDirectRoute(page, capture)
  await expect.poll(() => capture.requests.filter((request) => request.candidateSet === "alternatives").length).toBeGreaterThan(0)
  await expect(page.getByRole("button", { name: "Select Scenic alternative" })).toBeVisible()
  await page.getByRole("button", { name: "Select Scenic alternative" }).click()
  await expect(page.getByRole("button", { name: "Select Scenic alternative" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("9.6")).toBeVisible()
})

test("a saved route survives a reload and remains available in the library", async ({ page }) => {
  await installPlannerServices(page)
  const capture = await installRouteApi(page, tripPlan([makeRoute("quick", { name: "Saved fixture route" })]))
  await planDirectRoute(page, capture)
  await page.getByRole("button", { name: /Show route details/i }).click()
  await page.getByRole("button", { name: "Save route" }).click()
  await expect(page.getByText("Route saved on this device.")).toBeVisible()
  await expect(page.getByRole("button", { name: /Library 1/ })).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: "Library", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Ride library" })).toBeVisible()
  await expect(page.getByText("Saved fixture route")).toBeVisible()
})

test("valid GPX import appears in the route library", async ({ page }) => {
  await installPlannerServices(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Library", exact: true }).last().click()
  await expect(page.getByRole("heading", { name: "Ride library" })).toBeVisible()
  await page.getByLabel("Import GPX, KML, or KMZ file").setInputFiles({
    name: "critical-import.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(`<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Critical imported loop</name></metadata><trk><trkseg><trkpt lat="40.2732" lon="-76.8867"/><trkpt lat="40.31" lon="-76.82"/></trkseg></trk></gpx>`)
  })
  await expect(page.getByText("Critical imported loop imported to your library.")).toBeVisible()
  await expect(page.locator(".library-load", { hasText: "Critical imported loop" })).toBeVisible()
})

test("Free Ride accepts one suggestion into a normal guided Ride", async ({ page }) => {
  await installPlannerServices(page)
  const suggestionRouteFragment: [number, number][] = [
    [-76.8867, 40.2732],
    [-76.85, 40.29],
    [-76.82, 40.31]
  ]
  const suggestion = {
    id: "critical-suggestion",
    kind: "fun-road",
    title: "Fun road ahead — Follow this road in 0.8 mi — +4 min",
    actionLabel: "Accept suggestion",
    origin: [-76.8867, 40.2732],
    destination: [-76.82, 40.31],
    routeFragment: suggestionRouteFragment,
    triggerDistanceMeters: 1_200,
    addedDurationSeconds: 240,
    score: {
      total: 84, fun: 92, twistiness: 94, scenic: 77, elevation: 58, gravel: 0,
      traffic: 89, simplicity: 83, safety: 96, novelty: 74, confidence: 90,
      preferenceFit: 84, etaPenalty: 0, explanations: ["Strong curvature."], explanation: ["Strong curvature."]
    },
    reasons: ["Strong curvature and sustained bends (94/100)."],
    confidence: 0.9,
    // Always fresh: an expired suggestion is never shown (SB-030).
    expiresAt: new Date(Date.now() + 45_000).toISOString()
  }
  const guidedRoute = makeRoute("neural", {
    id: "guided-neural-route",
    name: "Guided Neural route",
    geometry: suggestion.routeFragment,
    distanceMiles: 8.2,
    durationMinutes: 17
  })
  await page.route("**/api/free-ride/suggestions", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ source: "fixture", suggestion, suppressed: false })
  }))
  const capture = await installRouteApi(page, tripPlan([guidedRoute]))
  await page.goto("/")
  await page.getByRole("button", { name: "Free Ride" }).click()
  await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Suggested fun road" })).toBeVisible({ timeout: 15_000 })
  await page.getByRole("button", { name: "Accept suggestion" }).click()
  await expect(page.getByRole("region", { name: /Ride mode|Ride preview/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Live guidance", { exact: true })).toBeVisible()
  expect(capture.requests[0]).toMatchObject({ profile: "neural" })
})

test("desktop and iPhone-sized planner layouts keep controls and route outcome inside the viewport", async ({ page }) => {
  await installPlannerServices(page)
  const capture = await installRouteApi(page, tripPlan([makeRoute("scenic", { name: "Responsive route" })]))
  await planDirectRoute(page, capture)
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }))
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.width + 1)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.width + 1)
  const routeRack = page.getByRole("heading", { name: "Choose a route" })
  const box = await routeRack.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(metrics.width)
})
