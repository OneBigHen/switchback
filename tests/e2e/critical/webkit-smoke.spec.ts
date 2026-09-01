import { expect, test } from "@playwright/test"
import {
  ensureFixtureStart,
  expectRouteOutcome,
  fillFixtureFinish,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  tripPlan
} from "../helpers/planner-fixtures"

test("WebKit can use the V2 destinations without horizontal overflow", async ({ page }) => {
  await installPlannerServices(page)
  await page.goto("/")

  const nav = page.getByRole("navigation", { name: /primary/i })
  await expect(nav.getByRole("button", { name: "Plan", exact: true })).toBeVisible()
  await expect(nav.getByRole("button", { name: "Rides", exact: true })).toBeVisible()
  await expect(nav.getByRole("button", { name: "Discover", exact: true })).toBeVisible()
  await expect(nav.getByRole("button", { name: "Settings", exact: true })).toBeVisible()

  await nav.getByRole("button", { name: "Rides", exact: true }).click()
  await expect(page.getByRole("main", { name: "Rides destination" })).toBeVisible()

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1)
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1)
})

test("WebKit can plan one destination route", async ({ page }) => {
  await installPlannerServices(page)
  const capture = await installRouteApi(page, tripPlan([
    makeRoute("twisty", { name: "WebKit smoke route" })
  ]))

  await page.goto("/")
  await openPlannerEditor(page)
  await ensureFixtureStart(page)
  await fillFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).click()

  await expectRouteOutcome(page, capture)
  await expect(page.getByRole("region", { name: "Route choices" }).getByText("WebKit smoke route", { exact: true })).toBeVisible()
})
