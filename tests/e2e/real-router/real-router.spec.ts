import { expect, test, type Page } from "@playwright/test"
import {
  EMPTY_MAP_STYLE,
  FIXTURE_FINISH,
  FIXTURE_START,
  openPlannerEditor
} from "../helpers/planner-fixtures"

async function installRealRouterServices(page: Page): Promise<void> {
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(EMPTY_MAP_STYLE)
  }))
  for (const pattern of [
    "**/api/curvature**",
    "**/api/map-features**",
    "**/api/route-weather**",
    "**/api/pa-unpaved-roads**"
  ]) {
    await page.route(pattern, (route) => route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify({ type: "FeatureCollection", features: [] })
    }))
  }
  await page.route("**/api/gpx-library**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ importedRoutes: 0, routes: [] })
  }))
  await page.route("**/api/geocode**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q")?.toLowerCase() ?? ""
    const place = query.includes("private")
      ? { id: "private-yard", label: "Private Yard Road, fixture", name: "Private Yard Road", lat: 40.255, lon: -76.864 }
      : query.includes("closed")
        ? { id: "motorcycle-closed", label: "Motorcycle Closed Spur, fixture", name: "Motorcycle Closed Spur", lat: 40.255, lon: -76.884 }
        : query.includes("disconnected")
          ? { id: "disconnected", label: "Disconnected Test Road, fixture", name: "Disconnected Test Road", lat: 40.315, lon: -76.805 }
          : { id: "fixture-finish", label: "Fixture finish, Pennsylvania", name: "Fixture finish", lat: FIXTURE_FINISH.lat, lon: FIXTURE_FINISH.lon }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ places: [{ ...place, region: "Pennsylvania", country: "United States" }] })
    })
  })
}

async function ensureStart(page: Page): Promise<void> {
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  if ((await start.inputValue()).length === 0) {
    await page.getByRole("button", { name: /current location/i }).click()
  }
  await expect(start).toHaveValue(/Current location|Fixture start/)
}

async function chooseFixtureFinish(page: Page): Promise<void> {
  const finish = page.getByRole("combobox", { name: "Finish", exact: true })
  await finish.fill("Fixture finish")
  await expect(page.getByRole("option", { name: /Fixture finish/i })).toBeVisible()
  await page.getByRole("option", { name: /Fixture finish/i }).click()
  await expect(finish).toHaveValue(/Fixture finish/i)
}

function routeResponse(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === "/api/routes" && response.request().method() === "POST"
  })
}

test("the planner UI reaches the real GraphHopper fixture and preserves live evidence", async ({ page }) => {
  await installRealRouterServices(page)
  await page.goto("/")
  await openPlannerEditor(page)
  await ensureStart(page)
  await chooseFixtureFinish(page)
  const responsePromise = routeResponse(page)
  await page.getByRole("button", { name: "Plan route" }).click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const body = await response.json() as {
    routes: Array<{
      geometry: [number, number][]
      distanceMiles: number
      durationMinutes: number
      routingSource: string
      tollEvidence?: { known: boolean }
    }>
  }
  const route = body.routes[0]
  expect(route).toBeDefined()
  expect(route.routingSource).toBe("live")
  expect(route.geometry.length).toBeGreaterThanOrEqual(2)
  expect(route.distanceMiles).toBeGreaterThan(0)
  expect(route.durationMinutes).toBeGreaterThan(0)
  expect(route.tollEvidence?.known).toBe(true)
  await expect(page.getByRole("heading", { name: /Choose a route/i })).toBeVisible()
  await expect(page.getByText("Route unavailable")).toBeHidden()
})

test("the real API completes a closed twisty loop on the fixture", async ({ page }) => {
  await installRealRouterServices(page)
  await page.goto("/")
  const response = await page.request.post("/api/routes", {
    data: {
      profile: "twisty",
      compare: false,
      points: [FIXTURE_START],
      roundTrip: { targetMinutes: 20, seed: 17 }
    }
  })
  expect(response.status()).toBe(200)
  const body = await response.json() as {
    routes: Array<{ geometry: [number, number][]; loopTargetMinutes?: number; routingSource: string }>
  }
  const route = body.routes[0]
  expect(route).toBeDefined()
  expect(route.routingSource).toBe("live")
  expect(route.loopTargetMinutes).toBe(20)
  expect(route.geometry.length).toBeGreaterThanOrEqual(3)
  const first = route.geometry[0]!
  const last = route.geometry.at(-1)!
  expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(0.01)
})

const inaccessibleDestinations = [
  { name: "private road", query: "Private Yard Road", code: "OUT_OF_COVERAGE" },
  { name: "motorcycle-closed road", query: "Motorcycle Closed Spur", code: "OUT_OF_COVERAGE" },
  { name: "disconnected road", query: "Disconnected Test Road", code: "ROUTING_REJECTED" }
] as const

for (const destination of inaccessibleDestinations) {
  test(`the real router rejects the ${destination.name} fixture path honestly`, async ({ page }) => {
    await installRealRouterServices(page)
    await page.goto("/")
    const response = await page.request.post("/api/routes", {
      data: {
        profile: "quick",
        compare: false,
        points: [FIXTURE_START, {
          lat: destination.name === "private road" ? 40.255 : destination.name === "motorcycle-closed road" ? 40.255 : 40.315,
          lon: destination.name === "private road" ? -76.864 : destination.name === "motorcycle-closed road" ? -76.884 : -76.805,
          label: destination.query
        }]
      }
    })
    expect(response.status()).toBe(400)
    const body = await response.json() as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe(destination.code)
    expect(body.error?.message).toMatch(/covered map|different start or finish/i)
  })
}
