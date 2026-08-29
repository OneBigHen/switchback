import { expect, type Locator, type Page } from "@playwright/test"
import type { PlannedRoute, RouteProfileId } from "../../../src/lib/routing/types"
import { CANONICAL_HEALTH_RESPONSE } from "./health-fixtures"

export const FIXTURE_START = { lat: 40.2732, lon: -76.8867, label: "Fixture start" }
// Keep the browser fixture snapped to the connected scenic branch. The
// disconnected component is reserved for the explicit rejection checks.
export const FIXTURE_FINISH = { lat: 40.28, lon: -76.84, label: "Fixture finish" }

export const EMPTY_MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [{
    id: "background",
    type: "background",
    paint: { "background-color": "#f2f0ea" }
  }]
}

export type RouteFixture = PlannedRoute & { geometry: [number, number][] }

const PROFILE_LABELS: Record<RouteProfileId, string> = {
  quick: "Quick",
  balanced: "Balanced",
  twisty: "Twisty",
  scenic: "Scenic",
  adventure: "Adventure",
  gravel: "Gravel",
  "avoid-highways": "Avoid Highways",
  neural: "Neural"
}

export function makeRoute(
  profile: RouteProfileId,
  options: {
    id?: string
    name?: string
    geometry?: [number, number][]
    distanceMiles?: number
    durationMinutes?: number
    twistiness?: number
    surfaceMix?: Record<string, number>
  } = {}
): RouteFixture {
  const geometry = options.geometry ?? [
    [FIXTURE_START.lon, FIXTURE_START.lat],
    [-76.85, 40.29],
    [FIXTURE_FINISH.lon, FIXTURE_FINISH.lat]
  ]
  const label = PROFILE_LABELS[profile]
  return {
    id: options.id ?? `${profile}-critical-fixture`,
    name: options.name ?? `${label} fixture route`,
    profile,
    geometry,
    waypoints: [FIXTURE_START, FIXTURE_FINISH],
    instructions: geometry.slice(0, -1).map((_, index) => ({
      distanceMeters: 1_000,
      timeMilliseconds: 60_000,
      sign: index === 0 ? 0 : -2,
      text: index === 0 ? "Continue onto Fixture Road" : "Turn left onto Test Road",
      streetName: index === 0 ? "Fixture Road" : "Test Road",
      interval: [index, index + 1]
    })),
    distanceMiles: options.distanceMiles ?? 8.2,
    durationMinutes: options.durationMinutes ?? 17,
    ascentMeters: 120,
    descentMeters: 110,
    twistiness: options.twistiness ?? 82,
    turnCount: 12,
    roadMix: { secondary: 88, residential: 12 },
    surfaceMix: options.surfaceMix ?? { asphalt: 100 },
    routingSource: "live",
    previewOnly: false
  }
}

export function tripPlan(routes: RouteFixture[], warnings: string[] = []) {
  return {
    selectedRouteId: routes[0]?.id ?? "",
    routes,
    warnings
  }
}

export interface RouteCapture {
  requests: Array<Record<string, unknown>>
  responses: Array<{ request: Record<string, unknown>; body: ReturnType<typeof tripPlan> }>
}

export async function installPlannerServices(page: Page): Promise<void> {
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(EMPTY_MAP_STYLE)
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
  await page.route("**/api/route-weather", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ source: "none", samples: [], unavailable: ["fixture"] })
  }))
  await page.route("**/api/pa-unpaved-roads?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/geo+json",
    body: JSON.stringify({ type: "FeatureCollection", features: [] })
  }))
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/geocode?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      places: [{
        id: "fixture-finish",
        label: "Fixture finish, Pennsylvania",
        name: "Fixture finish",
        region: "Pennsylvania",
        country: "United States",
        lat: FIXTURE_FINISH.lat,
        lon: FIXTURE_FINISH.lon
      }]
    })
  }))
}

export async function installRouteApi(
  page: Page,
  response: ReturnType<typeof tripPlan> = tripPlan([makeRoute("twisty")])
): Promise<RouteCapture> {
  const capture: RouteCapture = { requests: [], responses: [] }
  await page.route("**/api/routes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    capture.requests.push(request)
    capture.responses.push({ request, body: response })
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response)
    })
  })
  return capture
}

export async function openPlannerEditor(page: Page): Promise<void> {
  const editor = page.getByRole("heading", { name: /Pick two points|Start here/i })
  if (await editor.isVisible().catch(() => false)) return
  await expandPhonePlanner(page)
  // A real tap must reach this control: a regression where the home-state
  // action dock occluded "Edit route" on phones used to require force here.
  // An actionability failure now flags that overlap instead of masking it.
  await page.getByRole("button", { name: "Edit route" }).click()
  await expect(editor).toBeVisible()
}

export async function expandPhonePlanner(page: Page): Promise<void> {
  if (!await page.evaluate(() => window.matchMedia("(max-width: 760px)").matches)) return
  const expand = page.getByRole("button", { name: "Expand planner" })
  const prompt = page.getByRole("textbox", { name: "Where do you want to ride?" })
  if (await expand.isVisible().catch(() => false)) await expand.click()
  await expect(prompt, "mobile planner prompt must appear after expanding").toBeVisible({ timeout: 15_000 })
}

// These fixtures are shared by touch projects (mobile QA, critical-webkit) and
// pointer-only ones (the Desktop Chrome `visual` project). `.tap()` throws
// outright without `hasTouch`, so dispatch whichever input the context actually
// supports instead of splitting every caller in two.
async function pressControl(page: Page, target: Locator, options?: { timeout?: number }): Promise<void> {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
  if (hasTouch) await target.tap(options)
  else await target.click(options)
}

export async function ensureFixtureStart(page: Page): Promise<void> {
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  if ((await start.inputValue()).length === 0) {
    const startButton = page.getByRole("button", { name: /current location/i })
    await expect(startButton, "fixture start must expose the current-location action").toBeVisible({ timeout: 15_000 })
    await pressControl(page, startButton)
  }
  await expect(start, "fixture start must be selected before routing").toHaveValue(/Current location|Fixture start/, { timeout: 15_000 })
}

export async function fillFixtureFinish(page: Page): Promise<void> {
  const finish = page.getByRole("combobox", { name: "Finish", exact: true })
  await finish.fill("Fixture finish")
  await tapAutocompleteOption(page, /Fixture finish/i)
  await expect(finish, "fixture finish must be selected before routing").toHaveValue(/Fixture finish/i, { timeout: 15_000 })
}

export async function tapAutocompleteOption(page: Page, name: string | RegExp): Promise<void> {
  const option = page.getByRole("option", { name })
  await expect(option, `autocomplete option ${String(name)} must become visible`).toBeVisible({ timeout: 15_000 })
  await expect(option, `autocomplete option ${String(name)} must be enabled`).toBeEnabled({ timeout: 15_000 })
  await pressControl(page, option, { timeout: 15_000 })
}

export async function expectRouteOutcome(page: Page, capture: RouteCapture): Promise<void> {
  await expect.poll(() => capture.requests.length, { timeout: 30_000 }).toBeGreaterThan(0)
  expectFixtureRequestStart(capture)
  await expect(page.getByRole("heading", { name: /Choose a route/i })).toBeVisible({ timeout: 30_000 })
  const successful = capture.responses.at(-1)?.body.routes ?? []
  expect(successful.length).toBeGreaterThan(0)
  expect(successful[0]?.geometry.length ?? 0).toBeGreaterThanOrEqual(2)
  expect(successful[0]?.distanceMiles ?? 0).toBeGreaterThan(0)
  expect(successful[0]?.durationMinutes ?? 0).toBeGreaterThan(0)
  await expect(page.getByRole("button", { name: /^Select / }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/\b(?:miles|mi)\b/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Route unavailable")).toBeHidden({ timeout: 30_000 })
}

function expectFixtureRequestStart(capture: RouteCapture): void {
  const request = capture.requests.at(-1)
  const points = request?.points
  const firstPoint = Array.isArray(points) ? points[0] : undefined
  expect(firstPoint).toMatchObject({ lat: FIXTURE_START.lat, lon: FIXTURE_START.lon })
}

export function rideIntentForPrompt(prompt: string): Record<string, unknown> {
  const normalized = prompt.toLowerCase()
  const destinationPrompt = normalized.includes(" to ")
    || normalized.includes("pine creek")
    || normalized.includes("new hope")
    || normalized.includes("destination")
  const loop = !destinationPrompt && (
    normalized.includes("loop") || normalized.includes("twisty") || normalized.includes("gravel")
  )
  const profile = normalized.includes("scenic") ? "scenic"
    : normalized.includes("gravel") ? "adventure"
      : "twisty"
  return {
    mode: loop ? "loop" : "destination",
    profile,
    rideCharacter: profile,
    targetMinutes: loop ? 90 : undefined,
    tollPolicy: "allow-with-warning",
    ambiguous: false,
    startQuery: null,
    destinationQuery: loop ? null : "Fixture finish",
    stopQuery: null,
    preferGravel: profile === "adventure",
    avoidHighways: profile !== "scenic",
    summary: loop ? `${profile} fixture loop` : `${profile} fixture destination`,
    source: "local"
  }
}

export async function installRideIntentApi(page: Page): Promise<Array<Record<string, unknown>>> {
  const requests: Array<Record<string, unknown>> = []
  await page.route("**/api/ride-intent", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    requests.push(request)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rideIntentForPrompt(String(request.prompt ?? "")))
    })
  })
  return requests
}
