import { expect, test } from "@playwright/test"
import {
  expectRouteOutcome,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  tripPlan
} from "../helpers/planner-fixtures"
import { CANONICAL_HEALTH_RESPONSE } from "../helpers/health-fixtures"

async function expectPlannerReady(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByRole("textbox", { name: "Ride request" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Ride options", exact: true })).toBeVisible()
}

async function establishServiceWorker(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/")
  await expectPlannerReady(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // The first visit registers the worker. Reload once so the worker owns the
  // document before the test takes the network away.
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload()
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  // clients.claim() takes effect after the navigation that activated the
  // worker; this second online navigation is the first fully controlled load.
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await expect.poll(
    () => page.evaluate(async () => {
      const cache = await caches.open("switchback-build-v3")
      const keys = await cache.keys()
      return keys.filter((request) => new URL(request.url).pathname.startsWith("/_next/static/")).length
    }),
    { timeout: 15_000 }
  ).toBeGreaterThan(0)
}

async function planAndSaveRoute(
  page: import("@playwright/test").Page,
  capture: Awaited<ReturnType<typeof installRouteApi>>
): Promise<void> {
  await openPlannerEditor(page)
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  if ((await start.inputValue()).length === 0) {
    await page.getByRole("button", { name: /current location/i }).click()
  }
  await expect(start).toHaveValue(/Current location|Fixture start/)

  const finish = page.getByRole("combobox", { name: "Finish", exact: true })
  await finish.fill("Fixture finish")
  await expect(page.getByRole("option", { name: /Fixture finish/i })).toBeVisible()
  await page.getByRole("option", { name: /Fixture finish/i }).click()
  await expect(finish).toHaveValue(/Fixture finish/i)
  await page.getByRole("button", { name: "Plan route" }).click()
  await expectRouteOutcome(page, capture)
  await page.getByRole("button", { name: /Details for .*/i }).click()
  await page.getByRole("button", { name: /Show route details/i }).click()
  await page.getByRole("button", { name: "Save route" }).click()
  await expect(page.getByText("Route saved on this device.")).toBeVisible()
}

test("production shell survives offline reload and API requests are not cached as success", async ({ page }) => {
  await installPlannerServices(page)
  await establishServiceWorker(page)

  // Remove the test-only health response before going offline. The service
  // worker explicitly excludes /api/, so this must reject rather than become
  // a misleading cached 200.
  await page.unroute("**/api/health")
  await page.context().setOffline(true)
  const apiProbe = await page.evaluate(async () => {
    try {
      const response = await fetch(`/api/health?offline-probe=${Date.now()}`)
      return { ok: true, status: response.status }
    } catch {
      return { ok: false, status: null }
    }
  })
  expect(apiProbe).toEqual({ ok: false, status: null })

  await page.reload({ waitUntil: "domcontentloaded" })
  await expectPlannerReady(page)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await page.context().setOffline(false)
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(CANONICAL_HEALTH_RESPONSE)
  }))
  await page.reload()
  await expectPlannerReady(page)
})

test("saved route remains available from IndexedDB after an offline reload", async ({ page }) => {
  await installPlannerServices(page)
  const routeCapture = await installRouteApi(page, tripPlan([makeRoute("twisty", { name: "Offline saved route" })]))
  await establishServiceWorker(page)
  await planAndSaveRoute(page, routeCapture)
  expect(routeCapture.requests.length).toBeGreaterThan(0)

  await page.context().setOffline(true)
  await page.reload({ waitUntil: "domcontentloaded" })
  await expectPlannerReady(page)
  await page.getByRole("button", { name: "Rides", exact: true }).click()
  await expect(page.getByRole("region", { name: "Rides" })).toBeVisible()
  await expect(page.getByText("Offline saved route")).toBeVisible()

  const storedRoute = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("switchback")
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    const route = await new Promise<{ name?: string } | undefined>((resolve, reject) => {
      const request = database.transaction("routes", "readonly").objectStore("routes").get("twisty-critical-fixture")
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as { name?: string } | undefined)
    })
    database.close()
    return route?.name ?? null
  })
  expect(storedRoute).toBe("Offline saved route")
})
