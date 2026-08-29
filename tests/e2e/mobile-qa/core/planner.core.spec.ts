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

test.describe("mobile planner Level A core states", () => {
  test("starts from a deterministic fresh planning state", async ({ page }, testInfo) => {
    await installPlannerServices(page)
    await page.goto("/")
    await settleMapDelay(page)
    await expect(page.getByRole("heading", { name: "Where do you want to ride?" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Where do you want to ride?" })).toBeVisible()
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
    await expect(page.getByRole("heading", { name: "Choose a route" })).toBeVisible()
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
    await expect(page.getByRole("textbox", { name: "Where do you want to ride?" })).toBeVisible()
    await capturePlannerState(page, testInfo, "map-provider-failure")
    expectOnlyDeliberateNetworkFailures(mobileQa.runtimeIssues, { host: "tiles.openfreemap.org", pathname: "/styles/positron", status: 503 })
  })

  test("renders three route cards in Choose without implying selection", async ({ page }, testInfo) => {
    await planFixtureRoute(page, readableRouteSet())
    const cards = page.getByRole("button", { name: /^Select / })
    await expect(cards).toHaveCount(3)
    await expect(page.getByRole("heading", { name: "Choose a route" })).toBeVisible()
    await expect(page.getByLabel("Planning stage: Choose")).toBeVisible()
    await expect(page.locator(".route-selection-identity")).toHaveCount(0)
    await expect(page.getByRole("status")).toContainText("Choose a route above")
    await expect(cards.first()).toHaveAttribute("aria-pressed", "false")
    await cards.first().tap()
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true")
    await expect(page.locator(".route-selection-identity")).toContainText("Twisty prepare route")
    await capturePlannerState(page, testInfo, "choose-three")
    await expectMobilePlannerContracts(page)
    expectCleanRuntime(page)
  })

  test("records a real tap selection and keeps the selected route identity reachable", async ({ page }, testInfo) => {
    await planFixtureRoute(page, readableRouteSet())
    const selected = page.getByRole("button", { name: "Select Scenic prepare route" })
    await selected.tap()
    await expect(selected).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByLabel("Planning stage: Prepare")).toBeVisible()
    const identity = page.locator(".route-selection-identity")
    await expect(identity).toContainText("Scenic prepare route")
    const expectIdentityInPlannerScroll = async () => {
      const geometry = await page.evaluate(() => {
        const identity = document.querySelector<HTMLElement>(".route-selection-identity")
        const scroll = document.querySelector<HTMLElement>(".planner-scroll")
        if (!identity || !scroll) throw new Error("selected route identity scroll nodes are missing")
        const identityBox = identity.getBoundingClientRect()
        const scrollBox = scroll.getBoundingClientRect()
        return {
          identityTop: identityBox.top,
          identityBottom: identityBox.bottom,
          scrollTop: scrollBox.top,
          scrollBottom: scrollBox.bottom,
        }
      })
      expect(geometry.identityTop).toBeGreaterThanOrEqual(geometry.scrollTop - 1)
      expect(geometry.identityBottom).toBeLessThanOrEqual(geometry.scrollBottom + 1)
    }
    await expectIdentityInPlannerScroll()
    await page.getByRole("button", { name: "Edit route" }).tap()
    await expect(page.getByRole("button", { name: "Hide route editor" })).toBeVisible()
    await expectIdentityInPlannerScroll()
    await page.getByRole("button", { name: "Minimize planner" }).tap()
    await expect(page.getByRole("button", { name: "Expand planner" })).toContainText("Scenic prepare route")
    await page.getByRole("button", { name: "Expand planner" }).tap()
    await expect(identity).toContainText("Scenic prepare route")
    await expectIdentityInPlannerScroll()
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
    await expect(page.getByRole("heading", { name: "Where do you want to ride?" })).toBeVisible()
    await expandPhonePlanner(page)
    await openPlannerEditor(page)
    await submitFixturePlan(page)
    const plannerError = page.locator(".planner-error")
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
    const prompt = page.getByRole("textbox", { name: "Where do you want to ride?" })
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
    await expect(page.locator(".route-rack")).toBeHidden()
    await expect(page.getByRole("button", { name: /^Select / })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Where do you want to ride?" })).toBeVisible()
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
    await expect(page.getByRole("heading", { name: "Where do you want to ride?" })).toBeVisible()
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
    await capturePlannerState(page, testInfo, "prepare-dark")
    expectCleanRuntime(page)
  })
})
