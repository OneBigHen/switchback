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
  expectViewportFitAndSafeAreaContainment,
  isWebkitOfflineInternalError
} from "../assertions"
import { installPlannerServices, makeRoute } from "../../helpers/planner-fixtures"
import {
  captureMobileQaScreenshot,
  expectOfflineBrowserState,
  readSavedRouteName,
  savedRouteSeed,
  seedSavedRoute
} from "../persistence-mobile-states"

test("offline keeps the local Rides destination honest and recovers online without rerouting", async ({ page, mobileQa }, testInfo) => {
  const route = savedRouteSeed(makeRoute("balanced", { id: "mobile-offline-local", name: "Offline local route" }))
  await installPlannerServices(page)
  await seedSavedRoute(page, route)
  expect(await readSavedRouteName(page, route.id)).toBe(route.name)
  await page.goto("/")
  await expectMobileAppReady(page)
  await page.getByRole("button", { name: "Rides", exact: true }).tap()
  await expect(page).toHaveURL(/tab=rides/)
  await expect(page.getByRole("heading", { name: "Rides", exact: true })).toBeVisible()
  const localRoute = page.getByRole("button", { name: `Open ${route.name}` })
  await expect(localRoute).toBeVisible()
  await mobileQa.setNetwork("offline")
  await expectOfflineBrowserState(page)
  await expect(localRoute).toBeVisible()
  await localRoute.tap()
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
  // This is the only test that deliberately forces the context offline and back.
  // Mobile Playwright WebKit reports the overlay loads it drops on that
  // transition as `WebKit encountered an internal error` (Chromium reports a
  // clean net::ERR_*). Ignore that exact diagnostic here only; every other
  // console error or failed request still fails.
  expectNoConsoleErrors(page, mobileQa.runtimeIssues, { ignore: isWebkitOfflineInternalError })
  expectNoUnexpectedNetworkFailures(page, mobileQa.runtimeIssues, { ignore: isWebkitOfflineInternalError })
})
