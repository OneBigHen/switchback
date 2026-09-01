import { test } from "@playwright/test"
import { installPlannerServices } from "../helpers/planner-fixtures"
import { pinVisualClock } from "../helpers/ux-state-fixtures"

async function capture(page: import("@playwright/test").Page, name: string): Promise<void> {
  await pinVisualClock(page)
  await installPlannerServices(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("main", { name: "Settings destination" }).waitFor({ state: "visible" })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `test-results/probe-${name}.png` })
}

test.describe("probe-plain", () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test("plain", async ({ page }) => { await capture(page, "plain") })
})

test.describe("probe-flagged", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    launchOptions: { args: ["--font-render-hinting=none", "--disable-font-subpixel-positioning", "--disable-lcd-text"] }
  })
  test("flagged", async ({ page }) => { await capture(page, "flagged") })
})
