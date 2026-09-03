import { expect, test, uxState } from "../fixtures"
import {
  capturePlannerState,
  expectCleanRuntime,
  expectMobilePlannerContracts,
  expectPrepareContracts,
  planFixtureRoute,
  readableRouteSet,
  submitFixturePlan,
} from "../planner-mobile-states"
import { expandPhonePlanner, installPlannerServices, installRouteApi, openPlannerEditor, tripPlan } from "../../helpers/planner-fixtures"
import { settleMapDelay } from "../../helpers/ux-state-fixtures"
import { expectOnlyDeliberateNetworkFailures } from "../persistence-mobile-states"

async function expectIdleComposer(page: import("@playwright/test").Page): Promise<void> {
  await expandPhonePlanner(page)
  await expect(page.getByRole("textbox", { name: "Ride request" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Options", exact: true })).toBeVisible()
}

test.describe("mobile planner Level A core states", () => {
  test("starts from a deterministic fresh planning state", async ({ page }, testInfo) => {
    await installPlannerServices(page)
    await page.goto("/")
    await settleMapDelay(page)
    await expectIdleComposer(page)
    await capturePlannerState(page, testInfo, "plan-fresh")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })

  test("keeps the route-loading state visible until the provider responds", async ({ page }, testInfo) => {
    const held = await uxState.routeLoading(page)
    await expect(page.getByRole("status", { name: "Ride planning progress" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Reading the roads…" })).toBeVisible()
    await capturePlannerState(page, testInfo, "route-loading")
    await held.release()
    await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Pick the ride, not the algorithm." })).toBeVisible()
    expectCleanRuntime(page)
  })

  test("surfaces a base-map provider failure while keeping routing available", async ({ page, mobileQa }, testInfo) => {
    await installPlannerServices(page)
    await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "fixture map provider unavailable" }),
    }))
    await page.goto("/")
    await expect(page.locator(".map-error")).toContainText("base map could not load", { timeout: 15_000 })
    await expectIdleComposer(page)
    await capturePlannerState(page, testInfo, "map-provider-failure")
    expectOnlyDeliberateNetworkFailures(mobileQa.runtimeIssues, { host: "tiles.openfreemap.org", pathname: "/styles/positron", status: 503 })
  })

  test("renders three V2 route decision cards without implying rider selection", async ({ page }, testInfo) => {
    await planFixtureRoute(page, readableRouteSet())
    const choices = page.getByRole("region", { name: "Route choices" })
    const cards = choices.getByRole("button", { name: /^Select / })
    await expect(cards).toHaveCount(3)
    await expect(choices.getByRole("heading", { name: "Pick the ride, not the algorithm." })).toBeVisible()
    await expect(cards.first()).toHaveAttribute("aria-pressed", "false")
    await cards.first().tap()
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true")
    await expect(choices.getByRole("article").first()).toHaveAttribute("data-selected", "true")
    await capturePlannerState(page, testInfo, "choose-three")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })

  test("records a real tap selection and keeps the selected route reachable", async ({ page }, testInfo) => {
    await planFixtureRoute(page, readableRouteSet())
    const choices = page.getByRole("region", { name: "Route choices" })
    const scenicCard = choices.getByRole("article").filter({ hasText: "Scenic prepare route" })
    const selected = scenicCard.getByRole("button", { name: /^Select / })
    await selected.tap()
    await expect(selected).toHaveAttribute("aria-pressed", "true")
    await expect(scenicCard).toHaveAttribute("data-selected", "true")
    await expect(scenicCard.getByText("Scenic prepare route", { exact: true })).toBeVisible()

    const expandSheet = page.getByRole("button", { name: "Expand planner sheet" })
    await expect(expandSheet).toBeVisible()
    await expandSheet.tap()
    await expect(page.getByRole("button", { name: "Collapse planner sheet" })).toBeVisible()
    await page.getByRole("button", { name: "Collapse planner sheet" }).tap()
    await expect(page.getByRole("button", { name: "Expand planner sheet" })).toBeVisible()
    await expect(choices.getByText("Scenic prepare route", { exact: true })).toBeVisible()

    await capturePlannerState(page, testInfo, "route-selected")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })

  test("opens Prepare with readable directions, metadata, dock clearance, and containment", async ({ page }, testInfo) => {
    const [route] = readableRouteSet()
    if (!route) throw new Error("Prepare fixture route is missing")
    await planFixtureRoute(page, [route])
    await page.getByRole("button", { name: "Show route details" }).tap()
    await expect(page.getByRole("button", { name: "Hide route details" })).toBeVisible()
    await page.getByRole("button", { name: "Show turn-by-turn directions" }).tap()
    await expect(page.getByRole("region", { name: "Turn-by-turn directions" })).toBeVisible()
    await expectPrepareContracts(page)
    await capturePlannerState(page, testInfo, "prepare")
    expectCleanRuntime(page)
  })

  test("ends a provider failure in an actionable, non-loading state", async ({ page }, testInfo) => {
    await installPlannerServices(page)
    await page.route("**/api/routes", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "PROVIDER_UNAVAILABLE", message: "The route service is temporarily unavailable. Try again in a moment." } }),
    }))
    await page.goto("/")
    await expandPhonePlanner(page)
    await openPlannerEditor(page)
    await submitFixturePlan(page)
    const plannerError = page.locator('.plan-v2__error[role="alert"]')
    await expect(plannerError).toContainText("Route unavailable")
    await expect(plannerError).toContainText("temporarily unavailable")
    await expect(page.getByRole("status", { name: "Ride planning progress" })).toBeHidden()
    await expect(page.getByRole("button", { name: "Plan route" })).toBeEnabled()
    await capturePlannerState(page, testInfo, "provider-failure")
    await expectMobilePlannerContracts(page)
  })

  test("keeps the keyboard-sensitive ride prompt focused and actionable", async ({ page }, testInfo) => {
    await installPlannerServices(page)
    await page.goto("/")
    await expandPhonePlanner(page)
    const prompt = page.getByRole("textbox", { name: "Ride request" })
    await prompt.tap()
    await page.keyboard.type("A scenic ride")
    await expect(page.getByRole("button", { name: "Find ride options" })).toBeEnabled()
    await expect(prompt).toBeFocused()
    const box = await prompt.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((await page.evaluate(() => window.visualViewport?.width ?? window.innerWidth)) + 1)
    await capturePlannerState(page, testInfo, "plan-keyboard")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })

  test("keeps a successful empty response honest as no results", async ({ page }, testInfo) => {
    await installPlannerServices(page)
    const capture = await installRouteApi(page, tripPlan([]))
    await page.goto("/")
    await expandPhonePlanner(page)
    await openPlannerEditor(page)
    await submitFixturePlan(page)
    await expect.poll(() => capture.requests.length).toBeGreaterThan(0)
    await expect(page.getByRole("region", { name: "Route choices" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Select / })).toHaveCount(0)
    await expect(page.getByRole("textbox", { name: "Ride request" })).toBeVisible()
    await expect(page.getByRole("status", { name: "Ride planning progress" })).toBeHidden()
    await capturePlannerState(page, testInfo, "empty-no-results")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })
})

test.describe("mobile planner theme coverage", () => {
  test.use({ mobileQaColorScheme: "dark" })

  test("keeps the Plan surface usable in dark mode", async ({ page }, testInfo) => {
    await installPlannerServices(page)
    await page.goto("/")
    await settleMapDelay(page)
    await expectIdleComposer(page)
    await capturePlannerState(page, testInfo, "plan-dark")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })

  test("keeps the Prepare surface readable in dark mode", async ({ page }, testInfo) => {
    const [route] = readableRouteSet()
    if (!route) throw new Error("Prepare fixture route is missing")
    await planFixtureRoute(page, [route])
    await page.getByRole("button", { name: "Show route details" }).tap()
    await page.getByRole("button", { name: "Show turn-by-turn directions" }).tap()
    await expect(page.getByRole("region", { name: "Turn-by-turn directions" })).toBeVisible()
    await expectPrepareContracts(page)
    const preparationColors = await page.locator([
      '[aria-label="Route choices"] article',
      ".directions-panel",
      ".directions-toggle",
      ".route-share-panel > label input",
      ".route-share-panel > label textarea",
      ".route-share-panel > label select",
      ".gpx-export-variant select",
      ".route-actions .tool-button",
      '[aria-label^="Open road locks"]',
    ].join(", ")).evaluateAll((elements) => elements.map((element) => ({
      selector: element.className,
      tagName: element.tagName,
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      appearance: getComputedStyle(element).appearance,
    })))
    expect(preparationColors.length).toBeGreaterThan(0)
    expect(preparationColors.every(({ background }) => ![
      "rgb(255, 255, 255)",
      "rgb(255, 255, 253)",
      "rgb(255, 253, 249)",
      "rgb(250, 250, 250)",
    ].includes(background))).toBe(true)
    expect(preparationColors
      .filter(({ tagName }) => tagName === "SELECT")
      .every(({ appearance }) => appearance === "none")).toBe(true)
    await capturePlannerState(page, testInfo, "prepare-dark")
    expectCleanRuntime(page)
  })
})
