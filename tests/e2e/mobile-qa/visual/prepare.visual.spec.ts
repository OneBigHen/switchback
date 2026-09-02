import { expect, test } from "../fixtures"
import {
  capturePlannerState,
  expectMobilePlannerContracts,
  expectPrepareContracts,
  expectCleanRuntime,
  planFixtureRoute,
  PREPARE_VIEWPORTS,
  readableRouteSet,
} from "../planner-mobile-states"
import { installPlannerServices } from "../../helpers/planner-fixtures"
import { settleMapDelay } from "../../helpers/ux-state-fixtures"

async function expectDynamicViewportContracts(page: import("@playwright/test").Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const sheet = document.querySelector<HTMLElement>(".planner-deck")
    const dock = document.querySelector<HTMLElement>(".planner-action-dock")
    if (!sheet || !dock) throw new Error("Planner viewport nodes are missing")
    const sheetBox = sheet.getBoundingClientRect()
    const dockBox = dock.getBoundingClientRect()
    return {
      viewportHeight,
      sheetBottom: sheetBox.bottom,
      dockBottom: dockBox.bottom,
      dockPaddingBottom: Number.parseFloat(getComputedStyle(dock).paddingBottom),
    }
  })
  expect(metrics.sheetBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1)
  expect(metrics.dockBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1)
  if ((page.viewportSize()?.width ?? 0) <= 760) expect(metrics.dockPaddingBottom).toBeGreaterThanOrEqual(13)
}

for (const [state, viewport] of Object.entries(PREPARE_VIEWPORTS) as Array<[
  keyof typeof PREPARE_VIEWPORTS,
  (typeof PREPARE_VIEWPORTS)[keyof typeof PREPARE_VIEWPORTS],
]>) {
  test(`Prepare matrix ${state}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)

    if (state.endsWith("collapsed")) {
      await installPlannerServices(page)
      await page.goto("/")
      await settleMapDelay(page)
      await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
      const minimize = page.getByRole("button", { name: "Minimize planner" })
      if (await minimize.isVisible()) await minimize.tap()
      await expect(page.getByRole("button", { name: "Expand planner" })).toBeVisible()
      await expectDynamicViewportContracts(page)
      await expectMobilePlannerContracts(page)
      await capturePlannerState(page, testInfo, state)
      return
    }

    if (state.endsWith("expanded")) {
      await installPlannerServices(page)
      await page.goto("/")
      await settleMapDelay(page)
      const prompt = page.getByRole("textbox", { name: "Ride request" })
      if (!await prompt.isVisible()) await page.getByRole("button", { name: "Expand planner" }).tap()
      await expect(prompt).toBeVisible()
      await expectDynamicViewportContracts(page)
      await expectMobilePlannerContracts(page)
      await capturePlannerState(page, testInfo, state)
      return
    }

    if (state === "390-selected-peek") {
      await planFixtureRoute(page)
      const selected = page.getByRole("button", { name: "Select Scenic prepare route" })
      await selected.tap()
      await expect(selected).toHaveAttribute("aria-pressed", "true")
      await page.getByRole("button", { name: "Minimize planner" }).tap()
      await expect(page.getByRole("button", { name: "Expand planner" })).toContainText("Scenic prepare route")
      await expectDynamicViewportContracts(page)
      await expectMobilePlannerContracts(page)
      await capturePlannerState(page, testInfo, state)
      return
    }

    const [route] = readableRouteSet()
    if (!route) throw new Error("Prepare fixture route is missing")
    await planFixtureRoute(page, [route])
    await page.getByRole("button", { name: "Show route details" }).tap()
    await expect(page.getByRole("button", { name: "Hide route details" })).toBeVisible()
    // Directions collapse by default, and expectPrepareContracts measures the
    // maneuver type scale — so open them here, as planner.core.spec.ts does.
    await page.getByRole("button", { name: "Show turn-by-turn directions" }).tap()
    await expect(page.getByRole("region", { name: "Turn-by-turn directions" })).toBeVisible()
    await expectPrepareContracts(page)
    await expectDynamicViewportContracts(page)
    await capturePlannerState(page, testInfo, state)
    expectCleanRuntime(page)
  })
}
