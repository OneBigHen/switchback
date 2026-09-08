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
    await page.getByRole("button", { name: "Draw route", exact: true }).click()
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
    await page.getByRole("button", { name: "Draw route", exact: true }).click()
    const retryStroke = await drawUsableStroke(page)
    await page.getByRole("button", { name: "Finish drawing and plan route" }).click()
    const retryRegion = page.getByRole("region", { name: "Draw a rough route" })
    await expect(retryRegion).toContainText(/Map region ends here.*covered map area/i)
    await expect(retryRegion.locator("polyline")).toHaveAttribute("points", retryStroke!)
    await page.getByRole("button", { name: "Retry drawing route" }).click()

    const choices = page.getByRole("region", { name: "Route choices" })
    await expect(choices).toBeVisible({ timeout: 30_000 })
    // The drawn line became a selectable candidate. Scope the assertion to the
    // rack: the route name also appears in the ride summary above it.
    await expect(choices.getByRole("button", { name: "Select Recovered sketch route" })).toBeVisible()
    await expect(retryRegion).toHaveCount(0)
    expect(primaryRequests).toHaveLength(3)
    expect(primaryRequests[1]?.sketchCorridor).toBeTruthy()
    expect(primaryRequests[2]?.sketchCorridor).toEqual(primaryRequests[1]?.sketchCorridor)
  })
}

test("Cancel escapes a drawn route that is still planning, and its late answer paints nothing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installPlannerServices(page)
  const success = tripPlan([makeRoute("twisty", { id: "late-sketch", name: "Late sketch route" })])
  let releaseHeldPlan: () => void = () => undefined
  const heldPlan = new Promise<void>((resolve) => { releaseHeldPlan = resolve })
  let primaryAttempts = 0

  await page.route("**/api/routes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    if (request.candidateSet === "primary") {
      primaryAttempts += 1
      await heldPlan
    }
    // The client may already have aborted; a dead request is the point here.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success)
    }).catch(() => undefined)
  })

  await page.goto("/")
  await expandPhonePlanner(page)
  await page.getByRole("button", { name: "Draw route", exact: true }).click()
  await drawUsableStroke(page)
  await page.getByRole("button", { name: "Finish drawing and plan route" }).click()

  const region = page.getByRole("region", { name: "Draw a rough route" })
  await expect(region).toContainText(/Planning your drawn corridor/i)
  // The rider is never trapped behind a slow or hung provider.
  const cancel = page.getByRole("button", { name: "Cancel drawing" })
  await expect(cancel).toBeEnabled()
  await cancel.click()
  await expect(region).toHaveCount(0)

  releaseHeldPlan()
  await page.waitForTimeout(1_200)

  // Nothing from the abandoned attempt may land: no route, no success toast.
  await expect(page.getByText("Late sketch route", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Read your line as a corridor/i)).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Route choices" })).toHaveCount(0)

  // And the next Draw session starts clean, not inside the cancelled one's
  // error state.
  await expandPhonePlanner(page)
  await page.getByRole("button", { name: "Draw route", exact: true }).click()
  const fresh = page.getByRole("region", { name: "Draw a rough route" })
  await expect(fresh).toBeVisible()
  await expect(fresh.locator("polyline")).toHaveAttribute("points", "")
  await expect(page.getByRole("button", { name: "Finish drawing and plan route" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Retry drawing route" })).toHaveCount(0)
  expect(primaryAttempts).toBe(1)
})
