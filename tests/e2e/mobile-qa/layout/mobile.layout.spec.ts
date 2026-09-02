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

type LayoutState = "plan" | "prepare" | "rides" | "free-ride" | "ride" | "settings" | "keyboard" | "offline"

const PROJECTS = new Set(MOBILE_QA_DEVICES.map((device) => device.id))
const FAST_PROJECTS = new Set(["webkit-standard", "chromium-standard"])
const PORTRAIT_PROJECTS = new Set(MOBILE_QA_DEVICES.filter((device) => device.orientation === "portrait").map((device) => device.id))
const STATE_PROJECTS: Record<LayoutState, ReadonlySet<string>> = {
  plan: PROJECTS,
  prepare: new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  rides: new Set([...FAST_PROJECTS, "webkit-small", "webkit-large", "webkit-standard-landscape"]),
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

async function expectShortLandscapeShellAndNavigation(page: import("@playwright/test").Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const rect = (element: HTMLElement | null, name: string) => {
      if (!element) throw new Error(`${name} is missing`)
      const box = element.getBoundingClientRect()
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      }
    }
    const shell = document.querySelector<HTMLElement>(".planner-shell")
    const nav = document.querySelector<HTMLElement>("nav.app-navigation")
    const buttons = Array.from(nav?.querySelectorAll<HTMLElement>("button") ?? []).map((button) => {
      const box = button.getBoundingClientRect()
      const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return {
        label: button.textContent?.trim(),
        rect: { top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
        centerIsReachable: center === button || button.contains(center),
      }
    })
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      shell: rect(shell, "planner shell"),
      shellMinHeight: shell ? getComputedStyle(shell).minHeight : "",
      nav: rect(nav, "app navigation"),
      navClientHeight: nav?.clientHeight ?? 0,
      navScrollHeight: nav?.scrollHeight ?? 0,
      brandDisplay: getComputedStyle(document.querySelector<HTMLElement>(".app-navigation-brand")!).display,
      buttons,
    }
  })

  expect(geometry.shellMinHeight, "short landscape must release the base shell floor").toBe("0px")
  expect(geometry.shell.top).toBeGreaterThanOrEqual(0)
  expect(geometry.shell.height).toBeGreaterThanOrEqual(geometry.viewport.height - 1)
  expect(geometry.shell.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1)
  expect(geometry.nav.top).toBeGreaterThanOrEqual(0)
  expect(geometry.nav.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1)
  expect(geometry.navScrollHeight).toBeLessThanOrEqual(geometry.navClientHeight + 1)
  expect(geometry.brandDisplay).toBe("none")
  expect(geometry.buttons.map(({ label }) => label)).toEqual(["Plan", "Rides", "Discover", "Settings", "Record"])
  for (const button of geometry.buttons) {
    expect(button.rect.width, `${button.label} width`).toBeGreaterThanOrEqual(44)
    expect(button.rect.height, `${button.label} height`).toBeGreaterThanOrEqual(44)
    expect(button.rect.top, `${button.label} top`).toBeGreaterThanOrEqual(0)
    expect(button.rect.bottom, `${button.label} bottom`).toBeLessThanOrEqual(geometry.viewport.height + 1)
    expect(button.centerIsReachable, `${button.label} center must be hit-testable`).toBe(true)
  }
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
  const usesSideDeck = testInfo.project.name === "webkit-standard-landscape"
  if (usesSideDeck) {
    await expectShortLandscapeShellAndNavigation(page)
    const navigation = page.locator("nav.app-navigation")
    for (const destination of ["Plan", "Rides", "Discover", "Settings"] as const) {
      const button = navigation.getByRole("button", { name: destination, exact: true })
      await button.tap()
      await expect(button).toHaveAttribute("aria-current", "page")
    }
    await navigation.getByRole("button", { name: "Record", exact: true }).tap()
    await expect(page.getByRole("heading", { name: "Record a ride" })).toBeVisible()
    await navigation.getByRole("button", { name: "Plan", exact: true }).tap()
    await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
  }
  const sheet = page.locator("#planner-sheet")
  await expect(sheet).toHaveAttribute("data-sheet-detent", "half")
  // The drag handle is a bottom-sheet affordance: it is display:none by
  // default and only enabled under max-width:760px (planner-deck.css:48,168).
  // Phone landscape (844x390) is routed to the fixed-height side deck instead
  // (design-system.css:275), where half and full render identically and the
  // header's Minimize/Expand pair is the state control. Assert whichever
  // affordance the layout actually ships rather than requiring the handle.
  if (!usesSideDeck) {
    await page.getByRole("button", { name: "Expand planner sheet" }).tap()
    await expect(sheet).toHaveAttribute("data-sheet-detent", "full")
  }
  if (testInfo.project.name === "webkit-standard-landscape" || testInfo.project.name === "webkit-small") {
    // V2 replaced the retired quick-intent row with the primary trip-shape
    // group. Measure the current rider choice at the point of interaction.
    const tripShape = page.getByRole("group", { name: "Trip shape" })
    await tripShape.scrollIntoViewIfNeeded()
    const quickIntentGeometry = await tripShape.evaluate((row) => {
      const rowBox = row.getBoundingClientRect()
      const buttons = Array.from(row.querySelectorAll<HTMLElement>("button"))
      return {
        viewportWidth: window.innerWidth,
        overflowX: getComputedStyle(row).overflowX,
        row: { left: rowBox.left, right: rowBox.right, top: rowBox.top, bottom: rowBox.bottom },
        buttons: buttons.map((button) => {
          const box = button.getBoundingClientRect()
          const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          const describe = (node: Element | null) => node === null
            ? "nothing"
            : `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).trim().split(/\s+/).join(".")}` : ""}`
          return {
            text: button.textContent?.trim(),
            width: box.width,
            height: box.height,
            centerIsReachable: center === button || button.contains(center),
            centerOccludedBy: describe(center),
          }
        }),
      }
    })
    expect(quickIntentGeometry.row.left).toBeGreaterThanOrEqual(0)
    expect(quickIntentGeometry.row.right).toBeLessThanOrEqual(quickIntentGeometry.viewportWidth)
    expect(quickIntentGeometry.buttons).toHaveLength(3)
    for (const button of quickIntentGeometry.buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44)
      expect(button.height).toBeGreaterThanOrEqual(44)
      if (testInfo.project.name === "webkit-standard-landscape") {
        expect(
          button.centerIsReachable,
          `${button.text} center should be reachable, but ${button.centerOccludedBy} is on top`
        ).toBe(true)
      }
    }
  }
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectFixedAndStickyContainment(page)
  await expectDockClearance(page)
  if (usesSideDeck) {
    await page.getByRole("button", { name: "Minimize planner", exact: true }).tap()
    await expect(sheet).toHaveAttribute("data-sheet-detent", "peek")
    await page.getByRole("button", { name: "Expand planner", exact: true }).tap()
  } else {
    await page.getByRole("button", { name: "Collapse planner sheet" }).tap()
  }
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

test("a saved ride survives navigation through the Rides destination", async ({ page, mobileQa }, testInfo) => {
  selectMatrix("rides", testInfo)
  await uxState.routeSelected(page)
  await page.getByRole("button", { name: "Show route details" }).first().tap()
  await page.getByRole("button", { name: "Save route" }).tap()
  await expect(page.getByText("Route saved on this device.")).toBeVisible()
  await page.getByRole("button", { name: "Rides", exact: true }).tap()
  const rides = page.getByRole("main", { name: "Rides destination" })
  await expect(rides).toBeVisible()
  await expect(page.getByText("Contract fixture route")).toBeVisible()
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expectNoHorizontalOverflow(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectFixedAndStickyContainment(page)
  await expectNavigationReachability(page)
  await expectRealScrollOwner(page, "[aria-label='Rides destination']")
  await expectNoNestedScrollTrap(page)
  await page.getByRole("button", { name: "Plan", exact: true }).tap()
  await expect(rides).toBeHidden()
  await page.getByRole("button", { name: "Rides", exact: true }).tap()
  await expect(page.getByText("Contract fixture route")).toBeVisible()
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
  await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
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
  // V2 primary destinations: exactly three, each announced with aria-current.
  for (const destination of ["Rides", "Discover", "Plan"] as const) {
    const target = navigation.locator(".app-navigation-primary button").filter({ hasText: destination }).first()
    await target.tap()
    await expect(target).toHaveAttribute("aria-current", "page")
    if (destination === "Rides") {
      // Rides is a destination now, not the retired drawer overlay: the tap
      // renders the surface in place and primary navigation stays current.
      await expect(page.getByRole("main", { name: "Rides destination" })).toBeVisible()
      await expect(target).toHaveAttribute("aria-current", "page")
    }
  }
  // Record is an activity control in the secondary cluster, never a
  // destination: it opens the preflight panel without claiming aria-current.
  const recordControl = navigation.locator(".app-navigation-secondary button").filter({ hasText: "Record" }).first()
  await recordControl.tap()
  await expect(page.getByRole("heading", { name: "Record a ride" })).toBeVisible()
  await expect(recordControl).not.toHaveAttribute("aria-current")
  await navigation.getByRole("button", { name: "Settings", exact: true }).tap()
  // Settings is a destination in V2, not the V1 "Profile and settings" sheet.
  await expect(page.getByRole("main", { name: "Settings destination" })).toBeVisible()
  await expectMobileRuntimeContract(page, testInfo.project.name)
  await expectNoHorizontalOverflow(page)
  await expectFixedAndStickyContainment(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectRealScrollOwner(page, "[aria-label='Settings destination']")
  // Account, sync and data now sits behind one advanced entry point. The
  // region downloads modal opens from in there and must still escape cleanly.
  await page.getByRole("button", { name: "Account, sync & data" }).tap()
  await expect(page.getByRole("region", { name: "Account, sync & rider data" })).toBeVisible()
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
  await page.getByRole("button", { name: "Rides", exact: true }).tap()
  await expect(page).toHaveURL(/tab=rides/)
  await expect(page.getByRole("heading", { name: "Rides", exact: true })).toBeVisible()
  await page.reload()
  await expectMobileAppReady(page, { tab: "rides", heading: "Rides" })
  const navigation = page.locator("nav.app-navigation")
  // The retired drawer was a modal that inerted primary navigation. A
  // destination must not: the rider can still leave Rides after a reload.
  await expect(navigation).toBeVisible()
  await expect(navigation).not.toHaveAttribute("aria-hidden", "true")
  await expect(navigation).toHaveJSProperty("inert", false)
  await expect(navigation.locator(".app-navigation-primary button[aria-current='page']")).toHaveText("Rides")
  await expect(page.getByRole("main", { name: "Rides destination" })).toBeVisible()
  await mobileQa.setNetwork("offline")
  await expect(page.getByText("Contract fixture route")).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await mobileQa.setNetwork("online")
  expectCleanRuntime(page, mobileQa.runtimeIssues)
})
