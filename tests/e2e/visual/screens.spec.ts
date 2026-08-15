import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  installPlannerServices,
  installRideIntentApi,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  expectRouteOutcome,
  tripPlan,
  type RouteCapture
} from "../helpers/planner-fixtures"

// TASK-0.1: visual regression harness for the six primary screens. Every spec
// asserts the screen's root panel is actually visible and non-zero-size in
// addition to the pixel diff — a passing screenshot alone would not have
// caught the Profile-panel outage (TASK-1.1), where the panel painted with
// zero effective size but no test failed.
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
] as const

async function assertPanelVisible(locator: Locator, minHeight = 200): Promise<void> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(minHeight)
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

async function planFixtureRoute(page: Page, capture: RouteCapture): Promise<void> {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
  await openPlannerEditor(page)
  await ensureStart(page)
  await chooseFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).click()
  await expectRouteOutcome(page, capture)
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} viewport`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test("Plan screen (empty)", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
      await assertPanelVisible(page.locator(".planner-deck"))
      await expect(page).toHaveScreenshot(`plan-empty-${viewport.name}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test("Plan screen (route result)", async ({ page }) => {
      await installPlannerServices(page)
      const capture = await installRouteApi(page, tripPlan([
        makeRoute("twisty", { name: "Visual fixture route" })
      ]))
      await planFixtureRoute(page, capture)
      await assertPanelVisible(page.locator(".planner-deck"))
      await expect(page).toHaveScreenshot(`plan-result-${viewport.name}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test("Library screen", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await page.getByRole("button", { name: "Library", exact: true }).click()
      const panel = page.locator(".library-drawer")
      await assertPanelVisible(panel)
      await expect(page).toHaveScreenshot(`library-${viewport.name}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test("Record screen", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await page.getByRole("button", { name: "Record", exact: true }).click()
      const panel = page.locator(".record-panel")
      await assertPanelVisible(panel)
      await expect(page).toHaveScreenshot(`record-${viewport.name}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test("Profile screen", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await page.getByRole("button", { name: "Profile", exact: true }).click()
      const panel = page.locator(".profile-panel")
      // This is the exact check that would have caught TASK-1.1: the panel
      // rendered in the a11y tree with no visible content on any viewport.
      await assertPanelVisible(panel)
      await expect(page).toHaveScreenshot(`profile-${viewport.name}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test("Ride HUD", async ({ page }) => {
      await installPlannerServices(page)
      await installRideIntentApi(page)
      const capture = await installRouteApi(page, tripPlan([
        makeRoute("twisty", { name: "Visual fixture route" })
      ]))
      await planFixtureRoute(page, capture)
      await page.getByRole("button", { name: /Show route details/i }).first().click()
      await page.getByRole("button", { name: /Start .* route/i }).first().click()
      const panel = page.locator(".ride-hud")
      await assertPanelVisible(panel)
      await expect(page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeVisible()
      await expect(page).toHaveScreenshot(`ride-hud-${viewport.name}.png`, { maxDiffPixelRatio: 0.02 })
    })
  })
}
