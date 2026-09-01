import { expect, test } from "../fixtures"
import type { Page, TestInfo } from "@playwright/test"
import { ensureMobileQaArtifactDirectory } from "../artifacts"
import { MOBILE_QA_DEVICES } from "../devices"
import { pinVisualClock, settleMapDelay, uxState } from "../../helpers/ux-state-fixtures"

type VisualState = "plan" | "prepare" | "rides" | "free-ride" | "ride" | "settings"
type VisualScheme = "light" | "dark"

const ALL_PROJECTS = new Set(MOBILE_QA_DEVICES.map((device) => device.id))
const FAST_PROJECTS = new Set(["webkit-standard", "chromium-standard"])
const PORTRAIT_PROJECTS = new Set(MOBILE_QA_DEVICES.filter((device) => device.orientation === "portrait").map((device) => device.id))
const STATE_PROJECTS: Record<VisualState, ReadonlySet<string>> = {
  plan: ALL_PROJECTS,
  prepare: new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  rides: new Set([...FAST_PROJECTS, "webkit-small", "webkit-large", "webkit-standard-landscape"]),
  "free-ride": new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  ride: new Set([...PORTRAIT_PROJECTS, "webkit-standard-landscape"]),
  settings: new Set([...PORTRAIT_PROJECTS]),
}

function selectMatrix(state: VisualState, testInfo: TestInfo): void {
  testInfo.annotations.push({ type: "mobile-visual-matrix", description: `${state}:${testInfo.project.name}` })
  test.skip(!STATE_PROJECTS[state].has(testInfo.project.name), `selective visual matrix excludes ${state} on ${testInfo.project.name}`)
}

async function captureState(page: Page, projectName: string, scheme: VisualScheme, state: VisualState): Promise<void> {
  const destination = ensureMobileQaArtifactDirectory("screenshots", projectName, `${scheme}-${state}`)
  await page.screenshot({
    path: destination,
    fullPage: false,
    animations: "disabled",
    mask: [page.locator(".nextjs-toast")],
  })
}

test.beforeEach(async ({ page }) => {
  await pinVisualClock(page)
})

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} deterministic mobile captures`, () => {
    test.use({ mobileQaColorScheme: scheme })

    test("Plan home", async ({ page, mobileQa }, testInfo) => {
      selectMatrix("plan", testInfo)
      await uxState.home(page)
      await settleMapDelay(page)
      await expect(page.locator("#planner-sheet")).toBeVisible()
      await captureState(page, mobileQa.projectName, scheme, "plan")
    })

    test("Prepare route", async ({ page, mobileQa }, testInfo) => {
      selectMatrix("prepare", testInfo)
      await uxState.routeDetail(page)
      await settleMapDelay(page)
      await expect(page.locator("#route-preparation")).toBeVisible()
      await captureState(page, mobileQa.projectName, scheme, "prepare")
    })

    test("saved ride in Rides", async ({ page, mobileQa }, testInfo) => {
      selectMatrix("rides", testInfo)
      await uxState.routeSelected(page)
      await page.getByRole("button", { name: "Show route details" }).first().tap()
      await page.getByRole("button", { name: "Save route" }).tap()
      await expect(page.getByText("Route saved on this device.")).toBeVisible()
      // Saved rides live on the Rides destination; the modal drawer this used
      // to capture is retired. See mobile.layout.spec.ts.
      await page.getByRole("button", { name: "Rides", exact: true }).tap()
      await expect(page.getByRole("main", { name: "Rides destination" })).toBeVisible()
      await captureState(page, mobileQa.projectName, scheme, "rides")
    })

    test("Free Ride", async ({ page, mobileQa }, testInfo) => {
      selectMatrix("free-ride", testInfo)
      await uxState.freeRideIdle(page)
      await settleMapDelay(page)
      await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
      await captureState(page, mobileQa.projectName, scheme, "free-ride")
    })

    test("active navigation", async ({ page, mobileQa }, testInfo) => {
      selectMatrix("ride", testInfo)
      await uxState.ride(page)
      await settleMapDelay(page)
      await expect(page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeVisible()
      await captureState(page, mobileQa.projectName, scheme, "ride")
    })

    test("settings and sheet", async ({ page, mobileQa }, testInfo) => {
      selectMatrix("settings", testInfo)
      await uxState.home(page)
      await page.getByRole("button", { name: "Settings", exact: true }).tap()
      // Settings is a V2 destination, not the retired "Profile and settings" sheet.
      await expect(page.getByRole("main", { name: "Settings destination" })).toBeVisible()
      await captureState(page, mobileQa.projectName, scheme, "settings")
    })
  })
}
