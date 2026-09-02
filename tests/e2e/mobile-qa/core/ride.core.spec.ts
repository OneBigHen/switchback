import { expect, test } from "../fixtures"
import {
  assertMobileRideSurface,
  captureRideState,
  emitRecordingSamples,
  installDeterministicGeolocation,
  installGuidedRoute,
  openRecordPanel,
  openOffRouteRecovery,
  openRouteLoading,
  startGuidedRide,
  startRecording,
  tapControlByTouch,
  waitForRecordingSamples
} from "../ride-mobile-states"
import { pinVisualClock, uxState } from "../../helpers/ux-state-fixtures"

test.describe("Level A mobile ride scenarios", () => {
  test("Free Ride idle remains actionable without a suggestion", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    await uxState.freeRideIdle(mobileQa.page)
    await assertMobileRideSurface(mobileQa.page, mobileQa.runtimeIssues)
    await expect(mobileQa.page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
    await expect(mobileQa.page.getByText(/No experimental road suggestion is ready/i)).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "free-ride-idle")
  })

  test("Free Ride suggestion is reachable by touch and can enter guidance", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    await installDeterministicGeolocation(mobileQa.page)
    await installGuidedRoute(mobileQa.page)
    await uxState.freeRideSuggestion(mobileQa.page)
    await assertMobileRideSurface(mobileQa.page, mobileQa.runtimeIssues)
    const accept = mobileQa.page.getByRole("button", { name: "Accept suggestion" })
    await expect(accept).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "free-ride-suggestion")
    await tapControlByTouch(mobileQa.page, accept)
    await expect(mobileQa.page.getByRole("region", { name: /Ride (mode|preview)/ })).toBeVisible({ timeout: 30_000 })
    await expect(mobileQa.page.getByText("Live guidance", { exact: true })).toBeVisible()
  })

  test("active guided navigation keeps guidance and exit controls reachable", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    await startGuidedRide(mobileQa.page)
    await assertMobileRideSurface(mobileQa.page, mobileQa.runtimeIssues)
    await expect(mobileQa.page.getByText(/Continue onto Fixture Road|GPS fix required/i).first()).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "guided-navigation")
    await mobileQa.setNetwork("offline")
    await expect.poll(() => mobileQa.page.evaluate(() => navigator.onLine)).toBe(false)
    await expect(mobileQa.page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeVisible()
    await mobileQa.setNetwork("online")
    await expect.poll(() => mobileQa.page.evaluate(() => navigator.onLine)).toBe(true)
    await mobileQa.page.getByRole("button", { name: "Exit ride mode" }).tap()
    // Exiting guidance tears down the ride surface and returns to the planner
    // with the ridden route still selected. On phones the deck replaces the
    // "Where do you want to ride?" omnibox with the route surface whenever a
    // route is selected, so assert the planner shell and the preserved route
    // context rather than that (now hidden) omnibox heading.
    await expect(mobileQa.page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeHidden()
    await expect(mobileQa.page.getByRole("button", { name: "Exit ride mode" })).toBeHidden()
    await expect(mobileQa.page.getByRole("complementary", { name: "Motorcycle route planner" })).toBeVisible()
    await expect(mobileQa.page.getByRole("region", { name: "Route choices" })).toBeVisible()
    // V2 retired the "Edit route" affordance. "Clear route" only renders for
    // an expanded deck with a selected route, so it carries the same proof the
    // ridden route survived the exit.
    await expect(mobileQa.page.getByRole("button", { name: "Clear route" })).toBeVisible()
  })

  test("off-route recovery presents a bounded rejoin action", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    const recovery = await openOffRouteRecovery(mobileQa.page)
    await assertMobileRideSurface(mobileQa.page, mobileQa.runtimeIssues)
    await expect(mobileQa.page.getByRole("group", { name: "Choose a route rejoin option" })).toBeVisible()
    const rejoin = mobileQa.page.getByRole("button", { name: /Nearest rejoin/i })
    await expect(rejoin).toBeVisible()
    await expect(rejoin).toBeEnabled()
    await rejoin.tap({ timeout: 15_000 })
    await expect(mobileQa.page.getByRole("heading", { name: "Finding a safe way back…" })).toBeVisible()
    await recovery.release()
    await expect(mobileQa.page.getByRole("region", { name: /Ride (mode|preview) for Recovery fixture route/ })).toBeVisible({ timeout: 30_000 })
    // The HUD remounts for the recovery line (it is keyed by route id); the
    // recenter control has to follow its replacement slot instead of vanishing.
    await expect(mobileQa.page.getByRole("button", { name: "Recenter map on current location" })).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "off-route-recovery")
  })

  test("route loading is visible without losing the planner surface", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    const held = await openRouteLoading(mobileQa.page)
    await assertMobileRideSurface(mobileQa.page, mobileQa.runtimeIssues)
    await expect(mobileQa.page.getByRole("button", { name: "Reading the roads…" })).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "route-loading")
    await held.release()
  })

  test("recording starts, updates with two bounded GPS samples, and stops", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    await openRecordPanel(mobileQa.page)
    await startRecording(mobileQa.page)
    await emitRecordingSamples(mobileQa.page)
    await waitForRecordingSamples(mobileQa.page, 2)
    await assertMobileRideSurface(mobileQa.page, mobileQa.runtimeIssues)
    await expect(mobileQa.page.getByText("Recording locally")).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "recording-updated")
    await mobileQa.page.getByRole("button", { name: "Finish recording" }).tap()
    await expect(mobileQa.page.locator(".recording-ride-hud")).toBeHidden({ timeout: 15_000 })
    await expect.poll(() => mobileQa.page.evaluate(() => localStorage.getItem("switchback:active-recording")), { timeout: 15_000 }).toBeNull()
  })

})

test.describe("Level A recording recovery", () => {
  test.use({ mobileQaStorage: "persisted" })

  test("interrupted recording reloads into a recoverable paused state", async ({ mobileQa }, testInfo) => {
    await pinVisualClock(mobileQa.page)
    await openRecordPanel(mobileQa.page)
    await startRecording(mobileQa.page)
    await emitRecordingSamples(mobileQa.page)
    await waitForRecordingSamples(mobileQa.page, 2)
    await mobileQa.page.reload()
    await expect(mobileQa.page.locator(".recording-ride-hud")).toBeVisible({ timeout: 15_000 })
    await expect(mobileQa.page.getByRole("button", { name: "Resume" })).toBeVisible({ timeout: 15_000 })
    await expect(mobileQa.page.getByText("Recording paused")).toBeVisible()
    await captureRideState(mobileQa.page, testInfo, "recording-recovered")
    await mobileQa.page.getByRole("button", { name: "Finish & save" }).tap()
  })
})
