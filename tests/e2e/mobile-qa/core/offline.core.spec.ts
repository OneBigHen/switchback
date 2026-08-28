import { expect, expectMobileAppReady, test } from "../fixtures"
import {
  expectInteractiveElementsUnclipped,
  expectMinimumTouchTargetSize,
  expectNavigationReachability,
  expectNoConsoleErrors,
  expectNoHorizontalOverflow,
  expectNoUnexpectedNetworkFailures,
  expectRealScrollOwner,
  expectSheetsAndModalsInsideVisualViewport,
  expectViewportFitAndSafeAreaContainment
} from "../assertions"
import { installPlannerServices, makeRoute } from "../../helpers/planner-fixtures"
import {
  captureMobileQaScreenshot,
  expectOfflineBrowserState,
  openLocalRouteForOffline,
  readSavedRouteName,
  savedRouteSeed,
  seedSavedRoute
} from "../persistence-mobile-states"

test("offline keeps the local library honest and recovers online without rerouting", async ({ page, mobileQa }, testInfo) => {
  const route = savedRouteSeed(makeRoute("balanced", { id: "mobile-offline-local", name: "Offline local route" }))
  await installPlannerServices(page)
  await seedSavedRoute(page, route)
  expect(await readSavedRouteName(page, route.id)).toBe(route.name)
  await page.goto("/")
  await expectMobileAppReady(page)
  await page.getByRole("button", { name: "Library", exact: true }).tap()
  await expect(page).toHaveURL(/tab=library/)
  await expect(page.getByRole("heading", { name: "Ride library" })).toBeVisible()
  await expect(page.getByText(route.name).first()).toBeVisible()
  await mobileQa.setNetwork("offline")
  await expectOfflineBrowserState(page)
  await expect(page.getByText("On this device")).toBeVisible()
  await openLocalRouteForOffline(page, route.name)
  await expect(page.getByText(route.name).first()).toBeVisible()
  await expect(page.getByText("Route unavailable")).toBeHidden()
  await captureMobileQaScreenshot(page, testInfo, "offline-local-library")
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectRealScrollOwner(page, ".planner-scroll")
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectViewportFitAndSafeAreaContainment(page)
  await expectNavigationReachability(page)
  await mobileQa.setNetwork("online")
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  await expectNoConsoleErrors(page, mobileQa.runtimeIssues)
  expectNoUnexpectedNetworkFailures(page, mobileQa.runtimeIssues)
})
