import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  captureEvidence,
  pinVisualClock,
  settleMapDelay,
  uxState
} from "../helpers/ux-state-fixtures"

// CINCO Phase 0 screen-state contract evidence (docs/cinco/UX_STATE_CONTRACT.md).
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
    })

    test("off-route recovery", async ({ page }) => {
      await pinVisualClock(page)
      await uxState.offRouteRecovery(page)
      await settleMapDelay(page)
      await captureEvidence(page, evidenceName("off-route-recovery"))
      await expect(page).toHaveScreenshot(`${evidenceName("off-route-recovery")}.png`, screenshotOptions(page))
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
