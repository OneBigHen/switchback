import { expect, test, type Page } from "@playwright/test"
import {
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  tripPlan
} from "./helpers/planner-fixtures"

/**
 * Wave 1: a rider's evolving ride is one recoverable object.
 *
 * These are the browser-level halves of the Wave 1 contract that unit tests
 * cannot prove: real IndexedDB, a real reload, and the rider's own controls.
 */

const appUrl = process.env.SWITCHBACK_E2E_URL ?? "/"

/**
 * With a route chosen the composer collapses behind "Edit route", so opening
 * the editor is two different gestures depending on where the rider is.
 */
async function openRideEditor(page: Page): Promise<void> {
  // Undo and redo re-ask for the route, so the deck can be mid-transition
  // between the collapsed route context and the composer. Retry the whole
  // gesture rather than racing whichever affordance renders first.
  await expect(async () => {
    const editRoute = page.getByRole("button", { name: "Edit route", exact: true })
    if (await editRoute.isVisible().catch(() => false)) await editRoute.click()
    const options = page.getByRole("button", { name: "Ride options", exact: true })
    await expect(options).toBeVisible({ timeout: 2_000 })
    if (await options.getAttribute("aria-expanded") !== "true") await options.click()
    await expect(page.getByRole("combobox", { name: "Start", exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
}

async function planFromCurrentLocation(page: Page): Promise<void> {
  await page.goto(appUrl)
  await openPlannerEditor(page)
  await expect(page.getByRole("combobox", { name: "Start", exact: true })).toHaveValue("Current location")
}

async function openRideOptions(page: Page): Promise<void> {
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  await expect(options).toBeVisible({ timeout: 15_000 })
  if (await options.getAttribute("aria-expanded") !== "true") await options.click()
  await expect(options).toHaveAttribute("aria-expanded", "true")
}

/**
 * Read the ride intent the app has actually committed to IndexedDB.
 *
 * Checkpoint writes are deliberately coalesced (a burst of edits becomes one
 * write) and then land asynchronously, so reloading the instant the summary
 * updates races the write instead of testing recovery. This reads the durable
 * record the reload is about to depend on, so the test waits for the real
 * contract rather than for a fixed number of milliseconds.
 */
async function persistedRideIntent(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases()
    if (!databases.some((entry) => entry.name === "switchback-ride-intent")) return null
    const opened = await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open("switchback-ride-intent")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
    if (!opened) return null
    if (!opened.objectStoreNames.contains("checkpoints")) {
      opened.close()
      return null
    }
    const record = await new Promise<{ intent?: Record<string, unknown> } | null>((resolve) => {
      const request = opened.transaction("checkpoints", "readonly").objectStore("checkpoints").get("active")
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
    opened.close()
    return record?.intent ?? null
  })
}

/** The ride summary is the planner's resting surface; the editor covers it. */
async function closeRideEditor(page: Page): Promise<void> {
  const options = page.getByRole("button", { name: "Ride options", exact: true })
  if (await options.getAttribute("aria-expanded") === "true") await options.click()
  await expect(page.getByRole("region", { name: "Your ride" })).toBeVisible()
}

test("a preference edit survives a reload and comes back as the same ride", async ({ page }) => {
  await installPlannerServices(page)
  await installRouteApi(page, tripPlan([makeRoute("twisty")]))

  await planFromCurrentLocation(page)
  await openRideOptions(page)
  const avoidHighways = page.getByRole("checkbox", { name: /avoid highways/i })
  await avoidHighways.check()
  await expect(avoidHighways).toBeChecked()

  // The checkpoint is written asynchronously; reloading is the whole point. On
  // screen the edit is already applied, but that only proves the in-memory
  // ride — so wait for it to reach the store before reloading, which also
  // makes "the edit was durably checkpointed" an assertion in its own right.
  await closeRideEditor(page)
  await expect(page.getByRole("region", { name: "Your ride" })).toContainText("No highways")
  await expect.poll(() => persistedRideIntent(page), { timeout: 15_000 })
    .toMatchObject({ avoidHighways: true })
  await page.reload()

  await expect(page.getByRole("region", { name: "Your ride" })).toContainText("Ride restored")
  await expect(page.getByRole("region", { name: "Your ride" })).toContainText("No highways")
  await openRideEditor(page)
  await expect(page.getByRole("checkbox", { name: /avoid highways/i })).toBeChecked()
})

test("undo reverses a whole ride change and redo puts it back", async ({ page }) => {
  await installPlannerServices(page)
  await installRouteApi(page, tripPlan([makeRoute("twisty")]))

  await planFromCurrentLocation(page)
  await openRideOptions(page)

  // One tap on a duration preset is one ride change, even though it sets both
  // the target and time shaping.
  await page.getByRole("button", { name: "Loop", exact: true }).click()
  await page.getByLabel("Loop duration").getByRole("button", { name: "90 min", exact: true }).click()
  await expect(page.getByRole("button", { name: "90 min" })).toHaveAttribute("aria-pressed", "true")

  // Undo lives with the Ride options controls while the editor is open.
  const undo = page.getByRole("button", { name: "Undo ride change" })
  await expect(undo).toBeEnabled()
  await undo.click()
  await openRideEditor(page)
  await expect(page.getByRole("button", { name: "90 min" })).not.toHaveAttribute("aria-pressed", "true")

  const redo = page.getByRole("button", { name: "Redo ride change" })
  await expect(redo).toBeEnabled()
  await redo.click()
  await openRideEditor(page)
  await expect(page.getByRole("button", { name: "90 min" })).toHaveAttribute("aria-pressed", "true")
})

test("a failed update keeps the last usable route and the rider's attempt", async ({ page }) => {
  await installPlannerServices(page)
  let failNextRoute = false
  await page.route("**/api/routes", async (route) => {
    if (failNextRoute) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Routing is unavailable." })
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan([makeRoute("twisty")]))
    })
  })

  await planFromCurrentLocation(page)
  await page.getByRole("combobox", { name: "Finish" }).fill("Fixture finish")
  await page.getByRole("option", { name: /Fixture finish/ }).first().click()
  await page.locator(".planner-action-dock .plan-button").click()
  await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()

  // Now edit the ride into a request the provider cannot answer.
  failNextRoute = true
  await openRideEditor(page)
  await page.getByRole("checkbox", { name: /avoid highways/i }).check()
  await closeRideEditor(page)

  const summary = page.getByRole("region", { name: "Your ride" })
  // The rider's attempt is still their ride, the previous route is still there
  // to fall back to, and both exits are offered.
  await expect(summary).toContainText("No highways")
  await expect(summary).toContainText(/Couldn’t update this ride/)
  await expect(summary.getByRole("button", { name: "Try this change again" })).toBeVisible()

  await summary.getByRole("button", { name: "Cancel ride change" }).click()
  await expect(summary).not.toContainText(/Couldn’t update this ride/)
  await expect(summary).not.toContainText("No highways")
  await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()
})
