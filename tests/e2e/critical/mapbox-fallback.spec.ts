import { expect, test, type Page } from "@playwright/test"
import { EMPTY_MAP_STYLE, installPlannerServices } from "../helpers/planner-fixtures"

type MapboxRequestMode = "success" | "style-failure"

async function installMapboxFixtures(page: Page, mode: MapboxRequestMode): Promise<{
  requests: string[]
  failedRequests: string[]
}> {
  const requests: string[] = []
  const failedRequests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("api.mapbox.com") || request.url().includes("events.mapbox.com")) {
      requests.push(request.url())
    }
  })
  page.on("requestfailed", (request) => {
    if (request.url().includes("api.mapbox.com") || request.url().includes("events.mapbox.com")) {
      failedRequests.push(request.url())
    }
  })

  await page.route("https://api.mapbox.com/**", (route) => {
    if (route.request().url().includes("/styles/v1/")) {
      if (mode === "style-failure") return route.abort()
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...EMPTY_MAP_STYLE, name: "OpenGravel Mapbox fixture" })
      })
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  })
  await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }))
  return { requests, failedRequests }
}

async function openQuickLayers(page: Page) {
  await page.getByRole("button", { name: "Open map layers" }).click()
  return page.getByRole("region", { name: "Quick map layers" })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.clear())
  await installPlannerServices(page)
})

test("mounts the Mapbox renderer with premium map choices and no paid requests", async ({ page }) => {
  const mapbox = await installMapboxFixtures(page, "success")
  await page.goto("/")

  await expect(page.locator("canvas.mapboxgl-canvas")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0)
  const quick = await openQuickLayers(page)
  await expect(quick.getByRole("radio", { name: "Terrain" })).toBeVisible()
  await expect(quick.getByRole("radio", { name: "Satellite" })).toBeVisible()
  expect(mapbox.requests.some((url) => url.includes("/styles/v1/"))).toBe(true)
  expect(mapbox.failedRequests).toEqual([])
})

test("falls back to MapLibre when the initial Mapbox style fails", async ({ page }) => {
  const mapbox = await installMapboxFixtures(page, "style-failure")
  await page.goto("/")

  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("canvas.mapboxgl-canvas")).toHaveCount(0)
  const quick = await openQuickLayers(page)
  await expect(quick.getByRole("radio", { name: "Outdoors" })).toBeVisible()
  await expect(quick.getByRole("radio", { name: "Satellite" })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem("switchback.mapbox-fallback"))).toBe("1")
  expect(mapbox.requests.some((url) => url.includes("/styles/v1/"))).toBe(true)
  expect(mapbox.failedRequests.some((url) => url.includes("/styles/v1/"))).toBe(true)
})
