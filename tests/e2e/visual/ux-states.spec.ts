import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  captureEvidence,
  pinVisualClock,
  settleMapDelay,
  uxState
} from "../helpers/ux-state-fixtures"

// Screen-state contract evidence (docs/quality/UX-STATE-CONTRACT.md).
// Each test constructs one contract state through the shared deterministic
// fixtures, asserts its marker (inside the fixture), then captures:
//   1. a review copy under artifacts/cinco/phase-0/, and
//   2. a pixel baseline asserted here.
// Baselines are created locally on first run and never regenerated to make a
// gate pass (QA-002).

const STATE_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
] as const

function screenshotOptions(page: Page): { maxDiffPixelRatio: number; mask: Locator[] } {
  // Same dev-indicator masking rationale as screens.spec.ts TASK-2.3.
  return { maxDiffPixelRatio: 0.02, mask: [page.locator(".nextjs-toast")] }
}

/**
 * Phase 1 gate containment guard: the ride telemetry rail must fit entirely
 * inside the viewport. A pixel snapshot alone cannot catch off-canvas
 * clipping — the baseline would contain the same defect — so the geometry
 * is asserted directly against the live viewport.
 */
async function expectTelemetryContained(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  const rail = page.locator(".ride-telemetry")
  await expect(rail).toBeVisible()
  const box = await rail.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
}

for (const viewport of STATE_VIEWPORTS) {
  test.describe(`ux state contract — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    const evidenceName = (state: string) => `${state}--${viewport.name}`

    test("home", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.home(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("home"))
      await expect(page).toHaveScreenshot(`${evidenceName("home")}.png`, screenshotOptions(page))
    })

    test("route loading", async ({ page }) => {
      await pinVisualClock(page)
      const held = await uxState.routeLoading(page)
      await captureEvidence(page, evidenceName("route-loading"))
      await expect(page).toHaveScreenshot(`${evidenceName("route-loading")}.png`, screenshotOptions(page))
      await held.release()
    })

    test("route selected", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.routeSelected(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("route-selected"))
      await expect(page).toHaveScreenshot(`${evidenceName("route-selected")}.png`, screenshotOptions(page))
    })

    test("alternatives", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.routeAlternatives(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("alternatives"))
      await expect(page).toHaveScreenshot(`${evidenceName("alternatives")}.png`, screenshotOptions(page))
    })

    test("route detail", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.routeDetail(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("route-detail"))
      await expect(page).toHaveScreenshot(`${evidenceName("route-detail")}.png`, screenshotOptions(page))
    })

    /**
     * The preparation surface, framed as itself rather than as a slice of the
     * page.
     *
     * `route detail` above already opens this surface, but it screenshots the
     * whole viewport at `maxDiffPixelRatio: 0.02`. On desktop that is a 25,920
     * pixel budget against a 1440x900 frame, and the preparation column is a
     * small part of it — so a change inside the column can be plainly visible
     * and still pass. That is not hypothetical: adding the weather disclosure
     * control changed 18,673 pixels and the gate did not notice.
     *
     * Framing the shot on the scroll owner that holds the surface makes the
     * same change roughly 6% of the image instead of 1.4%.
     *
     * The budget is absolute rather than a ratio, because a ratio means
     * different things on the 418x702 desktop column and the 372x226 mobile
     * one. 120 pixels was chosen against measurement: shortening one label in
     * this surface moves 184 pixels, so the budget catches that while leaving
     * room for font antialiasing. Nothing existing is rebaselined by holding a
     * new baseline to a real standard.
     *
     * Pixels only cover what is on screen, and the surface is far taller than
     * the viewport. The panel assertions below therefore carry the part a
     * screenshot cannot: that each panel is still rendered at all. A panel
     * silently dropped below the fold is the regression that would otherwise
     * go unseen.
     */
    test("route preparation surface", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.routeDetail(page)
      await settleMapDelay(page)

      const preparation = page.locator("#route-preparation")
      await expect(preparation).toBeVisible()

      for (const panel of [
        ".route-data-quality-panel",
        ".route-weather",
        ".route-evidence",
        ".trip-stage-panel",
        ".route-rating",
        ".route-share-panel",
        ".route-actions"
      ]) {
        await expect(preparation.locator(panel).first()).toBeAttached()
      }

      // The weather alert stays primary and the hourly detail stays contextual
      // (PREPARE-RIDE-AUDIT.md, Hazard 1). Asserted here so the hierarchy
      // cannot be inverted without a test saying so.
      await expect(preparation.locator(".weather-detail-toggle")).toHaveAttribute("aria-expanded", "false")

      await expect(page.locator(".planner-scroll")).toHaveScreenshot(
        `${evidenceName("route-preparation")}.png`,
        { maxDiffPixels: 120, mask: [page.locator(".nextjs-toast")] }
      )
    })

    test("route edit", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.routeEdit(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("route-edit"))
      await expect(page).toHaveScreenshot(`${evidenceName("route-edit")}.png`, screenshotOptions(page))
    })

    test("ride", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.ride(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("ride"))
      await expect(page).toHaveScreenshot(`${evidenceName("ride")}.png`, screenshotOptions(page))
      await expectTelemetryContained(page)
    })

    test("off-route recovery", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.offRouteRecovery(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("off-route-recovery"))
      await expect(page).toHaveScreenshot(`${evidenceName("off-route-recovery")}.png`, screenshotOptions(page))
      await expectTelemetryContained(page)
    })

    test("free ride idle", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.freeRideIdle(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("free-ride-idle"))
      await expect(page).toHaveScreenshot(`${evidenceName("free-ride-idle")}.png`, screenshotOptions(page))
    })

    test("free ride suggestion", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.freeRideSuggestion(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("free-ride-suggestion"))
      await expect(page).toHaveScreenshot(`${evidenceName("free-ride-suggestion")}.png`, screenshotOptions(page))
    })

    test("map provider failure", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.mapProviderFailure(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("map-provider-failure"))
      await expect(page).toHaveScreenshot(`${evidenceName("map-provider-failure")}.png`, screenshotOptions(page))
    })
  })
}
