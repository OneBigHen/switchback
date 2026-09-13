import { expect, expectMobileAppReady, test } from "../fixtures"
import {
  expectInteractiveElementsUnclipped,
  expectMinimumTouchTargetSize,
  expectNavigationReachability,
  expectNoConsoleErrors,
  expectNoHorizontalOverflow,
  expectSheetsAndModalsInsideVisualViewport,
  expectViewportFitAndSafeAreaContainment
} from "../assertions"
import { installPlannerServices } from "../../helpers/planner-fixtures"
import { captureMobileQaScreenshot } from "../persistence-mobile-states"

/**
 * The approved OpenGravel mobile redesign, run across the mobile-QA device
 * matrix.
 *
 * `opengravel-mobile-redesign.spec.ts` in the plan is named for the tree, not
 * the file: the mobile-QA projects only pick up `core/*.core.spec.ts` and
 * `layout|visual` specs, so a file at the plan's literal path would run in no
 * project at all and guard nothing. This lives in `core/` so it actually runs
 * — on webkit and chromium at 390x844.
 */

async function assertSharedMobileSurface(page: import("@playwright/test").Page): Promise<void> {
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectViewportFitAndSafeAreaContainment(page)
  await expectNavigationReachability(page)
}

test.describe("OpenGravel mobile redesign", () => {
  test("planner keeps the map useful and shows the approved composition", async ({ mobileQa }, testInfo) => {
    const { page } = mobileQa
    await installPlannerServices(page)
    await page.goto("/")
    // Plan is the root destination; unlike the named destinations it has no
    // historical `?tab=plan` URL contract.
    await expectMobileAppReady(page)

    await expect(page.getByPlaceholder("Search a place or describe a ride")).toBeVisible()
    const tripShape = page.getByRole("group", { name: "Trip shape" })
    await expect(tripShape.getByRole("button", { name: "To", exact: true })).toBeVisible()
    await expect(tripShape.getByRole("button", { name: "Loop", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: /Create ride/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Draw manually/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Ride options/ })).toHaveCount(1)

    const viewport = page.viewportSize()!
    const sheet = await page.locator("#planner-sheet").boundingBox()
    // Portrait phones must keep roughly half the screen as map; the landscape
    // projects in this matrix use a different sheet geometry entirely.
    if (viewport.height > viewport.width) {
      expect(sheet!.y / viewport.height).toBeGreaterThanOrEqual(0.4)
    }

    await captureMobileQaScreenshot(page, testInfo, "redesign-planner")
    await assertSharedMobileSurface(page)
    expectNoConsoleErrors(page)
  })

  test("explore is map-first and keeps card and map selection together", async ({ mobileQa }, testInfo) => {
    const { page } = mobileQa
    await installPlannerServices(page)
    await page.goto("/?tab=explore")
    await expect(page.getByRole("heading", { name: "Explore routes" })).toBeVisible({ timeout: 15_000 })

    const presentation = page.getByRole("group", { name: "Presentation" })
    await expect(presentation.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true")

    const rail = page.getByRole("list", { name: "Routes on the map" })
    if (await rail.locator("[data-route-card]").count()) {
      const select = rail.locator("[data-route-card]").first().getByRole("button", { name: /show on map/ })
      await select.tap()
      await expect(select).toHaveAttribute("aria-pressed", "true")
    }

    await captureMobileQaScreenshot(page, testInfo, "redesign-explore-map")
    await assertSharedMobileSurface(page)
    expectNoConsoleErrors(page)
  })

  test("the GPX library gives every card geography and keeps one shared renderer", async ({ mobileQa }, testInfo) => {
    const { page } = mobileQa
    await page.goto("/gpx-library")
    await expect(page.getByRole("heading", { name: "GPX Library" })).toBeVisible()

    const cards = page.locator("[data-route-card]")
    if (await cards.count()) {
      await expect(cards.first().locator("[data-route-preview]")).toHaveCount(1)
      // One off-screen renderer for the whole catalog, never a map per card.
      expect(await page.locator("[data-route-card] canvas").count()).toBe(0)
    }

    await captureMobileQaScreenshot(page, testInfo, "redesign-gpx-library")
    await expectNoHorizontalOverflow(page)
    await expectMinimumTouchTargetSize(page)
    expectNoConsoleErrors(page)
  })

  test("route detail opens on real geography with the decision above the diagnostics", async ({ mobileQa }, testInfo) => {
    const { page } = mobileQa
    await page.goto("/gpx-library")
    const firstRoute = page.locator("[data-route-card] a").first()
    if (!(await firstRoute.count())) test.skip(true, "no catalog routes on this machine")
    await firstRoute.click()

    await expect(page.getByRole("heading", { name: "Route details" })).toBeVisible()
    await expect(page.locator("[data-detail-map]")).toHaveCount(1)
    await expect(page.locator(".atlas-poster")).toHaveCount(0)

    const summary = page.getByRole("region", { name: "Route summary" })
    const technical = page.getByRole("region", { name: "Route data and diagnostics" })
    const summaryBox = await summary.boundingBox()
    const technicalBox = await technical.boundingBox()
    expect(technicalBox!.y).toBeGreaterThan(summaryBox!.y)

    await captureMobileQaScreenshot(page, testInfo, "redesign-route-detail")
    await expectNoHorizontalOverflow(page)
    expectNoConsoleErrors(page)
  })
})
