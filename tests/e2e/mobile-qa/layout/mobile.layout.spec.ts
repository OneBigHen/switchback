import { expect, expectMobileAppReady, test } from "../fixtures"
import type { TestInfo } from "@playwright/test"
import {
  expectFixedAndStickyContainment,
  expectInteractiveElementsUnclipped,
  expectMinimumTouchTargetSize,
  expectNavigationReachability,
  expectNoHorizontalOverflow,
  expectRealScrollOwner,
  expectSheetsAndModalsInsideVisualViewport,
  expectViewportFitAndSafeAreaContainment,
  scrollExplicitOwner,
  scrollOwnerToEnd,
} from "../assertions"
import { MOBILE_QA_DEVICES } from "../devices"
import {
  expectCleanRuntime,
  expectDockClearance,
  expectMobileRuntimeContract,
  expectNoNestedScrollTrap,
} from "./layout-helpers"
import { pinVisualClock, settleMapDelay, uxState } from "../../helpers/ux-state-fixtures"

type LayoutState = "plan" | "prepare" | "library" | "free-ride" | "ride" | "settings" | "keyboard" | "offline"

const PROJECTS = new Set(MOBILE_QA_DEVICES.map((device) => device.id))
const FAST_PROJECTS = new Set(["webkit-standard", "chromium-standard"])
const PORTRAIT_PROJECTS = new Set(MOBILE_QA_DEVICES.filter((device) => device.orientation === "portrait").map((device) => device.id))
const STATE_PROJECTS: Record<LayoutState, ReadonlySet<string>> = {
  plan: PROJECTS,
  prepare: new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  library: new Set([...FAST_PROJECTS, "webkit-small", "webkit-large", "webkit-standard-landscape"]),
  "free-ride": new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  ride: new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  settings: new Set([...PORTRAIT_PROJECTS]),
  keyboard: new Set([...FAST_PROJECTS, "webkit-small", "webkit-large"]),
  offline: FAST_PROJECTS,
}

function selectMatrix(state: LayoutState, testInfo: TestInfo): void {
  testInfo.annotations.push({ type: "mobile-matrix", description: `${state}:${testInfo.project.name}` })
  test.skip(!STATE_PROJECTS[state].has(testInfo.project.name), `selective mobile matrix excludes ${state} on ${testInfo.project.name}`)
}

test.beforeEach(async ({ page }) => {
  await pinVisualClock(page)
})

test("Plan sheet geometry and browser containment (not physical safe-area proof)", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("plan", testInfo)
  await uxState.home(page)
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expectViewportFitAndSafeAreaContainment(page)
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectNavigationReachability(page)
  const sheet = page.locator("#planner-sheet")
  await expect(sheet).toHaveAttribute("data-sheet-detent", "half")
  await page.getByRole("button", { name: "Expand planner sheet" }).tap()
  await expect(sheet).toHaveAttribute("data-sheet-detent", "full")
  if (testInfo.project.name === "webkit-standard-landscape" || testInfo.project.name === "webkit-small") {
    const quickIntentGeometry = await page.locator(".ride-quick-intents").evaluate((row) => {
      const rowBox = row.getBoundingClientRect()
      const buttons = Array.from(row.querySelectorAll<HTMLElement>("button"))
      return {
        viewportWidth: window.innerWidth,
        overflowX: getComputedStyle(row).overflowX,
        row: { left: rowBox.left, right: rowBox.right, top: rowBox.top, bottom: rowBox.bottom },
        buttons: buttons.map((button) => {
          const box = button.getBoundingClientRect()
          const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return {
            text: button.textContent?.trim(),
            width: box.width,
            height: box.height,
            centerIsReachable: center === button || button.contains(center),
          }
        }),
      }
    })
    expect(quickIntentGeometry.row.left).toBeGreaterThanOrEqual(0)
    expect(quickIntentGeometry.row.right).toBeLessThanOrEqual(quickIntentGeometry.viewportWidth)
    expect(quickIntentGeometry.buttons).toHaveLength(3)
    if (testInfo.project.name === "webkit-small") expect(quickIntentGeometry.overflowX).toBe("auto")
    for (const button of quickIntentGeometry.buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44)
      expect(button.height).toBeGreaterThanOrEqual(44)
      if (testInfo.project.name === "webkit-standard-landscape") {
        expect(button.centerIsReachable, `${button.text} center should be reachable`).toBe(true)
      }
    }
  }
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectFixedAndStickyContainment(page)
  await expectDockClearance(page)
  await page.getByRole("button", { name: "Collapse planner sheet" }).tap()
  await expect(sheet).toHaveAttribute("data-sheet-detent", "half")
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("Prepare keeps static headings, dock, and scroll content reachable", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("prepare", testInfo)
  await uxState.routeDetail(page)
  await settleMapDelay(page)
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expect(page.locator("#route-preparation")).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectRealScrollOwner(page, ".planner-scroll")
  await expectNoNestedScrollTrap(page)
  await expectFixedAndStickyContainment(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectMinimumTouchTargetSize(page)
  await scrollExplicitOwner(page, ".planner-scroll")
  await scrollOwnerToEnd(page, ".planner-scroll")
  await expect(page.locator(".route-data-quality-panel")).toBeVisible()
  await expectFixedAndStickyContainment(page)
  await expectDockClearance(page)
  await expectNavigationReachability(page)
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("saved Library survives the mobile drawer open and close path", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("library", testInfo)
  await uxState.routeSelected(page)
  await page.getByRole("button", { name: "Show route details" }).first().tap()
  await page.getByRole("button", { name: "Save route" }).tap()
  await expect(page.getByText("Route saved on this device.")).toBeVisible()
  // The planner deck used to carry its own counted "Library 1" button beside
  // the ride preferences; that block is no longer part of the route-result
  // surface, and primary navigation is now the way in. Both call the same
  // handler, so match either and stay honest about which affordance exists.
  await page.getByRole("button", { name: /^Library(\s+\d+)?$/ }).first().tap()
  const library = page.getByRole("dialog", { name: "Ride library" })
  await expect(library).toBeVisible()
  await expect(page.getByText("Contract fixture route")).toBeVisible()
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expectNoHorizontalOverflow(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectFixedAndStickyContainment(page)
  await expectNavigationReachability(page)
  await expectRealScrollOwner(page, ".library-drawer")
  await expectNoNestedScrollTrap(page)
  await page.getByRole("button", { name: "Close library" }).tap()
  await expect(library).toBeHidden()
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("Free Ride controls remain inside the touch viewport and escape cleanly", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("free-ride", testInfo)
  await uxState.freeRideIdle(page)
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Exit Free Ride" })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectFixedAndStickyContainment(page)
  // Leaving Free Ride discards an unsaved recording, which is deliberately
  // confirmed (SB-027). Playwright dismisses dialogs by default, so without
  // accepting it the exit is cancelled and the surface never changes — which
  // reads as a broken escape rather than the guard doing its job.
  page.once("dialog", (dialog) => void dialog.accept())
  await page.getByRole("button", { name: "Exit Free Ride" }).tap()
  await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("active navigation HUD keeps telemetry and controls reachable", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("ride", testInfo)
  await uxState.ride(page)
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expect(page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeVisible()
  await expect(page.locator(".ride-telemetry")).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectFixedAndStickyContainment(page)
  await expectNavigationReachability(page)
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("primary navigation, settings sheet, and modal escape remain usable", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("settings", testInfo)
  await uxState.home(page)
  const navigation = page.locator("nav.app-navigation")
  for (const tab of ["Library", "Record", "Profile", "Plan"] as const) {
    const target = navigation.locator("button").filter({ hasText: tab }).first()
    await target.tap()
    await expect(target).toHaveAttribute("aria-current", "page")
    if (tab === "Library") {
      const library = page.getByRole("dialog", { name: "Ride library" })
      await expect(library).toBeVisible()
      const isolatedLibraryNavigationButton = navigation.locator("button").filter({ hasText: tab }).first()
      await expect(isolatedLibraryNavigationButton).toHaveAttribute("aria-current", "page")
      await page.getByRole("button", { name: "Close library" }).tap()
      await expect(library).toBeHidden()
    }
  }
  await navigation.getByRole("button", { name: "Profile", exact: true }).tap()
  await expect(page.getByRole("region", { name: "Profile and settings" })).toBeVisible()
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expectNoHorizontalOverflow(page)
  await expectFixedAndStickyContainment(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectRealScrollOwner(page, ".profile-panel")
  await page.getByRole("button", { name: "Offline regions" }).tap()
  const downloads = page.getByRole("dialog", { name: "Region downloads" })
  await expect(downloads).toBeVisible()
  await expectSheetsAndModalsInsideVisualViewport(page)
  await page.getByRole("button", { name: "Close region downloads" }).tap()
  await expect(downloads).toBeHidden()
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("route editor keeps keyboard focus and actions in view", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("keyboard", testInfo)
  await uxState.routeEdit(page)
  const finish = page.getByRole("combobox", { name: "Finish", exact: true })
  await finish.focus()
  await expect(finish).toBeFocused()
  const box = await finish.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.y).toBeGreaterThanOrEqual(0)
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight)) + 1)
  await expectNoHorizontalOverflow(page)
  await expectMinimumTouchTargetSize(page)
  await expectNavigationReachability(page)
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})

test("saved route reloads and remains available while offline", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("offline", testInfo)
  await uxState.routeSelected(page)
  await page.getByRole("button", { name: "Show route details" }).first().tap()
  await page.getByRole("button", { name: "Save route" }).tap()
  await expect(page.getByText("Route saved on this device.")).toBeVisible()
  await page.getByRole("button", { name: "Library", exact: true }).tap()
  await expect(page).toHaveURL(/tab=library/)
  await expect(page.getByRole("heading", { name: "Ride library" })).toBeVisible()
  await page.reload()
  await expectMobileAppReady(page, { tab: "library", heading: "Ride library" })
  const navigation = page.locator("nav.app-navigation")
  await expect(navigation).toHaveAttribute("aria-hidden", "true")
  await expect(navigation).toHaveJSProperty("inert", true)
  await expect(navigation.locator("button[aria-current='page']")).toHaveText("Library")
  await expect(page.getByRole("dialog", { name: "Ride library" })).toBeVisible()
  await mobileQa.setNetwork("offline")
  await expect(page.getByText("Contract fixture route")).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await mobileQa.setNetwork("online")
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})
