import { expect, test, type Locator, type Page } from "@playwright/test"
import {
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
import { pinVisualClock } from "../helpers/ux-state-fixtures"

// Visual regression harness for the primary V2 surfaces. Every spec asserts
// the screen's semantic root is visible and non-zero-size in addition to the
// pixel diff, so a selector cannot silently point at a retired V1 surface.

test.beforeEach(async ({ page }) => {
  await pinVisualClock(page)
})

function screenshotOptions(page: Page): { maxDiffPixelRatio: number; mask: Locator[] } {
  return { maxDiffPixelRatio: 0.02, mask: [page.locator(".nextjs-toast")] }
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 }
] as const

const PLAN_EMPTY_VIEWPORTS = [
  { name: "320x700", width: 320, height: 700 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 }
] as const

async function assertPanelVisible(locator: Locator, minHeight = 200): Promise<void> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(minHeight)
}

async function expectPlanReady(page: Page): Promise<void> {
  await expect(page.getByRole("textbox", { name: "Ride request" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Ride options", exact: true })).toBeVisible()
}

async function assertIdlePlanGeometry(page: Page, viewport: { width: number; height: number }): Promise<void> {
  const panel = page.locator(".planner-deck")
  const box = await panel.boundingBox()
  expect(box).not.toBeNull()

  expect(box!.height).toBeLessThan(viewport!.height * 0.45)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
  if (viewport!.width > 760 && viewport!.width <= 800 && viewport!.height >= 900) {
    expect(box!.width).toBe(360)
  }
}

async function assertPlannerDeckClearsNavigation(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (viewport!.width <= 760) return

  const navigation = await page.locator(".app-navigation").boundingBox()
  const deck = await page.locator(".planner-deck").boundingBox()
  expect(navigation).not.toBeNull()
  expect(deck).not.toBeNull()
  expect(deck!.x).toBeGreaterThanOrEqual(navigation!.x + navigation!.width + 8)
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
  await expandPhonePlanner(page)
  await expectPlanReady(page)
  await openPlannerEditor(page)
  await ensureStart(page)
  await chooseFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).click()
  await expectRouteOutcome(page, capture)
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} viewport`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test("Plan screen (route result)", async ({ page }) => {
      await installPlannerServices(page)
      const capture = await installRouteApi(page, tripPlan([
        makeRoute("twisty", { name: "Visual fixture route" })
      ]))
      await planFixtureRoute(page, capture)
      await assertPanelVisible(page.locator(".planner-deck"))
      await assertPlannerDeckClearsNavigation(page)
      await expect(page).toHaveScreenshot(`plan-result-${viewport.name}.png`, screenshotOptions(page))
    })

    test("Rides screen", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await page.getByRole("button", { name: "Rides", exact: true }).click()
      const panel = page.getByRole("main", { name: "Rides destination" })
      await assertPanelVisible(panel)
      await expect(page.getByRole("region", { name: "Rides" })).toBeVisible()
      await expect(page).toHaveScreenshot(`rides-${viewport.name}.png`, screenshotOptions(page))
    })

    test("Record screen", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await page.getByRole("button", { name: "Record", exact: true }).click()
      const panel = page.locator(".record-panel")
      await assertPanelVisible(panel)
      await expect(page).toHaveScreenshot(`record-${viewport.name}.png`, screenshotOptions(page))
    })

    test("Settings screen", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      await page.getByRole("button", { name: "Settings", exact: true }).click()
      const panel = page.getByRole("main", { name: "Settings destination" })
      await assertPanelVisible(panel)
      await expect(page.getByRole("region", { name: "Settings" })).toBeVisible()
      await expect(page).toHaveScreenshot(`profile-${viewport.name}.png`, screenshotOptions(page))
    })

    test("Ride HUD", async ({ page }) => {
      await installPlannerServices(page)
      await installRideIntentApi(page)
      const capture = await installRouteApi(page, tripPlan([
        makeRoute("twisty", { name: "Visual fixture route" })
      ]))
      await planFixtureRoute(page, capture)
      await page.getByRole("button", { name: /Start .* route/i }).first().click()
      const panel = page.locator(".ride-hud")
      await assertPanelVisible(panel)
      await expect(page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeVisible()
      await expect(page).toHaveScreenshot(`ride-hud-${viewport.name}.png`, screenshotOptions(page))
    })
  })
}

for (const viewport of PLAN_EMPTY_VIEWPORTS) {
  test.describe(`Plan empty ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test("Plan screen (empty)", async ({ page }) => {
      await installPlannerServices(page)
      await page.goto("/")
      if (viewport.width <= 760) {
        await expect(page.getByRole("button", { name: "Expand planner" })).toBeVisible()
      } else {
        await expectPlanReady(page)
      }
      await assertPanelVisible(page.locator(".planner-deck"), 0)
      await expect(page.locator(".planner-deck")).toHaveClass(/is-idle-plan/)
      await assertIdlePlanGeometry(page, viewport)
      await expect(page).toHaveScreenshot(`plan-empty-${viewport.name}.png`, screenshotOptions(page))
    })
  })
}
