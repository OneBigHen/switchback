import { expect, test } from "@playwright/test"
import {
  FIXTURE_START,
  expandPhonePlanner,
  expectRouteOutcome,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  tripPlan
} from "../helpers/planner-fixtures"

test("destination prompt ignores a model-only origin and routes from the rider's current start", async ({ page }) => {
  await installPlannerServices(page)

  const geocodeQueries: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.pathname !== "/api/geocode") return
    geocodeQueries.push(url.searchParams.get("q") ?? "")
  })

  await page.route("**/api/ride-intent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "destination",
        profile: "scenic",
        rideCharacter: "scenic",
        targetMinutes: null,
        tollPolicy: "allow-with-warning",
        ambiguous: false,
        // Deliberately plausible and geocodable. A sentinel-only filter would
        // not protect this case; only rider-authored origin authority does.
        startQuery: "Dar es Salaam",
        destinationQuery: "Fixture finish",
        stopQuery: null,
        preferGravel: false,
        avoidHighways: false,
        summary: "scenic fixture destination",
        source: "openrouter"
      })
    })
  })

  const capture = await installRouteApi(
    page,
    tripPlan([makeRoute("scenic", { name: "Origin authority result" })])
  )

  await page.goto("/")
  await expandPhonePlanner(page)
  const prompt = page.getByPlaceholder("Search a place or describe a ride")
  await prompt.fill("a scenic ride to Fixture finish")
  await prompt.press("Enter")

  await expectRouteOutcome(page, capture)
  expect(geocodeQueries).toEqual(["Fixture finish"])
  expect(capture.requests[0]).toMatchObject({
    points: [
      { lat: FIXTURE_START.lat, lon: FIXTURE_START.lon },
      expect.objectContaining({ label: "Fixture finish, Pennsylvania" })
    ]
  })
  await expect(page.getByRole("region", { name: "Route choices" })
    .getByText("Origin authority result", { exact: true })).toBeVisible()
})
