import { expect, test } from "@playwright/test"
import {
  ensureFixtureStart,
  fillFixtureFinish,
  installPlannerServices,
  makeRoute,
  openPlannerEditor,
  tripPlan
} from "../helpers/planner-fixtures"

test("opening and closing Route Details preserves the selected route and Start action", async ({ page }) => {
  await installPlannerServices(page)
  const primary = makeRoute("balanced", { id: "details-primary", name: "Primary detail route" })
  const twisty = makeRoute("twisty", { id: "details-twisty", name: "Twisty detail route", distanceMiles: 9.1 })
  const requests: Array<Record<string, unknown>> = []
  await page.route("**/api/routes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    requests.push(request)
    const response = request.candidateSet === "alternatives" ? tripPlan([twisty]) : tripPlan([primary])
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) })
  })

  await page.goto("/")
  await openPlannerEditor(page)
  await ensureFixtureStart(page)
  await fillFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).click()
  const choices = page.getByRole("region", { name: "Route choices" })
  await expect(choices.getByText("Twisty detail route", { exact: true })).toBeVisible({ timeout: 30_000 })
  await choices.getByRole("button", { name: "Select Twisty detail route" }).click()
  const selected = choices.getByRole("article", { name: /Twisty detail route route option/i })
  await expect(selected).toHaveAttribute("data-selected", "true")
  const start = page.getByRole("button", { name: "Start Twisty route" })
  await expect(start).toBeEnabled()
  const requestCountBeforeDetails = requests.length

  await choices.getByRole("button", { name: "Details for Twisty detail route" }).click()
  const details = page.getByRole("region", { name: "Route details workspace" })
  await expect(details.getByText("Twisty detail route", { exact: true })).toBeVisible()
  await expect(start).toBeEnabled()
  expect(requests).toHaveLength(requestCountBeforeDetails)
  await expect(page.getByText("Route cleared", { exact: false })).toHaveCount(0)

  await details.getByRole("button", { name: "Back to route choices" }).click()
  await expect(choices.getByRole("article", { name: /Twisty detail route route option/i })).toHaveAttribute("data-selected", "true")
  await expect(start).toBeEnabled()
  expect(requests).toHaveLength(requestCountBeforeDetails)
})
