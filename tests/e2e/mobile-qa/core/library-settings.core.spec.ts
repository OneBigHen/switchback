import { expect, expectMobileAppReady, test } from "../fixtures"
import {
  expectInteractiveElementsUnclipped,
  expectMinimumTouchTargetSize,
  expectNavigationReachability,
  expectNoConsoleErrors,
  expectNoHorizontalOverflow,
  expectNoUnexpectedNetworkFailures,
  expectSheetsAndModalsInsideVisualViewport,
  expectViewportFitAndSafeAreaContainment
} from "../assertions"
import {
  installPlannerServices,
  makeRoute,
  openPlannerEditor
} from "../../helpers/planner-fixtures"
import { ensureFixtureStart, fillFixtureFinish } from "../planner-mobile-states"
import {
  captureMobileQaScreenshot,
  expectOnlyDeliberateNetworkFailures,
  expectFocusedControlInVisualViewport,
  readSavedRouteName,
  savedRouteSeed,
  seedSavedRoute
} from "../persistence-mobile-states"

async function openLibrary(page: import("@playwright/test").Page): Promise<void> {
  if (await page.getByRole("heading", { name: "Ride library" }).isVisible().catch(() => false)) return
  await page.getByRole("button", { name: "Rides", exact: true }).tap()
  await expect(page).toHaveURL(/tab=rides/)
  await expect(page.getByRole("heading", { name: "Ride library" })).toBeVisible()
}

async function openSettings(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).tap()
  await expect(page.getByRole("heading", { name: "You and your bike" })).toBeVisible()
}

async function assertSharedMobileSurface(page: import("@playwright/test").Page): Promise<void> {
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectViewportFitAndSafeAreaContainment(page)
  await expectNavigationReachability(page)
}

test("fresh empty saved routes are honest and reachable on mobile", async ({ page, mobileQa }, testInfo) => {
  await installPlannerServices(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
  await openLibrary(page)
  await expect(page.getByText("No routes parked yet")).toBeVisible()
  await expect(page.getByText("Build a live route, then save it here for another day.")).toBeVisible()
  await expectSheetsAndModalsInsideVisualViewport(page)
  await captureMobileQaScreenshot(page, testInfo, "empty-saved-routes")
  await page.getByRole("button", { name: "Close library" }).tap()
  await assertSharedMobileSurface(page)
  expect(mobileQa.hasTouch).toBe(true)
  expectNoConsoleErrors(page, mobileQa.runtimeIssues)
  expectNoUnexpectedNetworkFailures(page, mobileQa.runtimeIssues)
})

test("saved route drawer supports list, detail load, and navigation", async ({ page, mobileQa }, testInfo) => {
  const route = savedRouteSeed(makeRoute("scenic", { id: "mobile-saved-scenic", name: "Mobile scenic saved route" }))
  await installPlannerServices(page)
  await seedSavedRoute(page, route)
  expect(await readSavedRouteName(page, route.id)).toBe(route.name)
  await page.goto("/")
  await openLibrary(page)
  await expect(page.getByText("On this device")).toBeVisible()
  const row = page.locator(".library-load").filter({ hasText: route.name })
  await expect(row).toBeVisible()
  await expect(row).toContainText("8.2 mi")
  await captureMobileQaScreenshot(page, testInfo, "saved-route-drawer")
  await row.tap()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(route.name).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Show route details/i })).toBeVisible()
  await openLibrary(page)
  await expect(page.getByText(route.name).first()).toBeVisible()
  await expectNoConsoleErrors(page, mobileQa.runtimeIssues)
  expectNoUnexpectedNetworkFailures(page, mobileQa.runtimeIssues)
})

test.describe("reload persistence", () => {
  test.use({ mobileQaStorage: "persisted" })

test("saved route persists through reload in the local IndexedDB library", async ({ page, mobileQa }, testInfo) => {
  const route = savedRouteSeed(makeRoute("twisty", { id: "mobile-persisted-route", name: "Persisted mobile route" }))
  await installPlannerServices(page)
  await seedSavedRoute(page, route)
  expect(await readSavedRouteName(page, route.id)).toBe(route.name)
  await page.goto("/")
  await openLibrary(page)
  await expect(page.getByText(route.name)).toBeVisible()
  await page.reload()
  await expectMobileAppReady(page, { tab: "rides", heading: "Ride library" })
  const navigation = page.locator("nav.app-navigation")
  const mapWorkspace = page.locator('[data-map-workspace="true"]')
  await expect(mapWorkspace).toHaveAttribute("aria-hidden", "true")
  await expect(mapWorkspace).toHaveJSProperty("inert", true)
  await expect.poll(() => navigation.evaluate((element) => {
    const inertOwner = element.closest<HTMLElement>("[inert]")
    return inertOwner?.dataset.mapWorkspace === "true"
      && inertOwner.getAttribute("aria-hidden") === "true"
  })).toBe(true)
  await expect(navigation.locator(".app-navigation-primary button[aria-current='page']")).toHaveText("Rides")
  await expect(page.getByRole("dialog", { name: "Ride library" })).toBeVisible()
  await expect(page.getByText(route.name)).toBeVisible()
  expect(await readSavedRouteName(page, route.id)).toBe(route.name)
  await page.getByRole("button", { name: "Close library" }).tap()
  await expect(page.getByRole("dialog", { name: "Ride library" })).toBeHidden()
  await page.goBack()
  await expect(page.getByRole("dialog", { name: "Ride library" })).toBeHidden()
  await captureMobileQaScreenshot(page, testInfo, "persisted-route-reload")
  await expectNoHorizontalOverflow(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectNoConsoleErrors(page, mobileQa.runtimeIssues)
  expectNoUnexpectedNetworkFailures(page, mobileQa.runtimeIssues)
})

test("settings preserve a safe local preference and light/dark theme across reload", async ({ page, mobileQa }, testInfo) => {
  await installPlannerServices(page)
  await page.goto("/")
  await openSettings(page)
  await expect(page.getByLabel("Rider name")).toHaveValue("")
  await expectFocusedControlInVisualViewport(page, "Rider name")
  await page.getByLabel("Rider name").fill("Local mobile rider")
  await page.getByLabel("Units").selectOption("metric")
  await page.getByLabel("Theme").selectOption("light")
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("light")
  await captureMobileQaScreenshot(page, testInfo, "settings-light")
  await page.getByLabel("Theme").selectOption("dark")
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark")
  await captureMobileQaScreenshot(page, testInfo, "settings-dark")
  await page.reload()
  // Settings is an overlay, not a URL destination: after a reload the app
  // lands on Plan, so reopen the launcher before asserting persistence.
  await expectMobileAppReady(page)
  await expect(page.getByRole("heading", { name: "You and your bike" })).toBeHidden()
  await openSettings(page)
  await expect(page.getByLabel("Rider name")).toHaveValue("Local mobile rider")
  await expect(page.getByLabel("Units")).toHaveValue("metric")
  await expect(page.getByLabel("Theme")).toHaveValue("dark")
  const stored = await page.evaluate(() => ({
    theme: localStorage.getItem("switchback:theme"),
    settings: localStorage.getItem("switchback:rider-settings")
  }))
  expect(stored.theme).toBe("dark")
  expect(stored.settings).toContain("Local mobile rider")
  await expectNoConsoleErrors(page, mobileQa.runtimeIssues)
  expectNoUnexpectedNetworkFailures(page, mobileQa.runtimeIssues)
})

})

test("provider failure remains visible and is limited to the deliberate routes endpoint", async ({ page, mobileQa }, testInfo) => {
  await installPlannerServices(page)
  await page.route("**/api/routes", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "fixture provider unavailable" })
  }))
  await page.goto("/")
  await openPlannerEditor(page)
  await ensureFixtureStart(page)
  await fillFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).tap()
  await expect(page.getByText("Route unavailable")).toBeVisible()
  await captureMobileQaScreenshot(page, testInfo, "provider-failure")
  expectOnlyDeliberateNetworkFailures(mobileQa.runtimeIssues, { host: new URL(page.url()).host, pathname: "/api/routes", status: 503 })
})
