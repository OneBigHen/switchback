import { expect, test, type Page } from "@playwright/test"
import { installPlannerServices, makeRoute, tripPlan, expandPhonePlanner } from "../helpers/planner-fixtures"

async function drawUsableStroke(page: Page) {
  const region = page.getByRole("region", { name: "Draw a rough route" })
  await expect(region).toBeVisible()
  const box = await region.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + Math.min(90, box!.width * 0.2)
  const startY = box!.y + Math.min(120, box!.height * 0.28)
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let index = 1; index <= 8; index += 1) {
    await page.mouse.move(
      startX + Math.min(box!.width * 0.55, 28 * index),
      startY + Math.sin(index / 2) * Math.min(45, box!.height * 0.12),
      { steps: 2 }
    )
  }
  await page.mouse.up()
  const polyline = region.locator("polyline")
  await expect(polyline).toHaveAttribute("points", /,/) 
  return await polyline.getAttribute("points")
}

for (const viewport of [
  { name: "phone portrait", width: 390, height: 844 },
  { name: "short landscape", width: 844, height: 390 }
]) {
  test(`drawn route survives provider failure, Cancel discards it, and Retry reuses it on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await installPlannerServices(page)
    const primaryRequests: Array<Record<string, unknown>> = []
    const success = tripPlan([makeRoute("twisty", { id: `sketch-${viewport.name}`, name: "Recovered sketch route" })])
    await page.route("**/api/routes", async (route) => {
      const request = route.request().postDataJSON() as Record<string, unknown>
      if (request.candidateSet === "primary") primaryRequests.push(request)
      const primaryAttempt = primaryRequests.length
      if (request.candidateSet === "primary" && primaryAttempt <= 2) {
        await route.fulfill({
status: 422,
contentType: "application/json",
body: JSON.stringify({ error: { code: "OUT_OF_COVERAGE", message: "That ride leaves the covered map area." } })
        })
        return
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success) })
    })

    await page.goto("/")
    await expandPhonePlanner(page)
    await page.getByRole("button", { name: "Draw", exact: true }).click()
    const firstStroke = await drawUsableStroke(page)
    await page.getByRole("button", { name: "Finish drawing and plan route" }).click()
    const region = page.getByRole("region", { name: "Draw a rough route" })
    await expect(region).toContainText(/Map region ends here.*covered map area/i)
    await expect(region.locator("polyline")).toHaveAttribute("points", firstStroke!)
    await expect(page.getByRole("button", { name: "Retry drawing route" })).toBeVisible()

    await page.getByRole("button", { name: "Cancel drawing" }).click()
    await expect(region).toHaveCount(0)
    await expect(page.getByText("Route unavailable", { exact: true })).toHaveCount(0)

    await expandPhonePlanner(page)
    await page.getByRole("button", { name: "Draw", exact: true }).click()
    const retryStroke = await drawUsableStroke(page)
    await page.getByRole("button", { name: "Finish drawing and plan route" }).click()
    const retryRegion = page.getByRole("region", { name: "Draw a rough route" })
    await expect(retryRegion).toContainText(/Map region ends here.*covered map area/i)
    await expect(retryRegion.locator("polyline")).toHaveAttribute("points", retryStroke!)
    await page.getByRole("button", { name: "Retry drawing route" }).click()

    await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Recovered sketch route", { exact: true })).toBeVisible()
    await expect(retryRegion).toHaveCount(0)
    expect(primaryRequests).toHaveLength(3)
    expect(primaryRequests[1]?.sketchCorridor).toBeTruthy()
    expect(primaryRequests[2]?.sketchCorridor).toEqual(primaryRequests[1]?.sketchCorridor)
  })
}
