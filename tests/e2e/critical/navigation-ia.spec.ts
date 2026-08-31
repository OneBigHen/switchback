import { expect, test, type Page } from "@playwright/test"
import { installPlannerServices } from "../helpers/planner-fixtures"

// V2 information architecture: exactly three primary destinations
// (Plan | Rides | Discover), Settings/Record as secondary controls, and
// legacy V1 `?tab=` deep links that migrate into V2 state instead of
// breaking.
//
// URL semantics (PlannerShell.handleBack / applyDestination): a deep link
// keeps its `?tab=` value so a reload re-migrates to the same state, while a
// rider-selected destination rewrites the address bar to the V2 value.
//
// Rides is a primary destination, not a modal. Navigation therefore remains
// reachable while the rider searches, opens, imports, or filters their rides.

const activeDestination = (page: Page) =>
  page.locator(".app-navigation-primary button[aria-current='page']")

test.beforeEach(async ({ page }) => {
  await installPlannerServices(page)
})

test("primary navigation exposes exactly the three V2 destinations", async ({ page }) => {
  await page.goto("/")

  const primary = page.getByRole("group", { name: "Primary destinations" })
  await expect(primary.getByRole("button")).toHaveCount(3)
  await expect(primary.getByRole("button", { name: "Plan" })).toBeVisible()
  await expect(primary.getByRole("button", { name: "Rides" })).toBeVisible()
  await expect(primary.getByRole("button", { name: "Discover" })).toBeVisible()
  await expect(activeDestination(page)).toHaveText("Plan")
})

test("moving between destinations updates the URL and the visible surface", async ({ page }) => {
  await page.goto("/")
  const primary = page.getByRole("group", { name: "Primary destinations" })

  await primary.getByRole("button", { name: "Rides" }).click()
  await expect(page).toHaveURL(/[?&]tab=rides(?:&|$)/)
  await expect(page.getByRole("heading", { name: "Rides", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Rides" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /ride library/i })).toHaveCount(0)
  await expect(activeDestination(page)).toHaveText("Rides")

  await primary.getByRole("button", { name: "Discover" }).click()
  await expect(page).toHaveURL(/[?&]tab=discover(?:&|$)/)
  await expect(page.getByRole("heading", { name: "Find a better road." })).toBeVisible()
  await expect(activeDestination(page)).toHaveText("Discover")

  await primary.getByRole("button", { name: "Plan" }).click()
  await expect(page).not.toHaveURL(/[?&]tab=/)
  await expect(activeDestination(page)).toHaveText("Plan")
})

test("legacy ?tab=library deep link lands on the Rides destination", async ({ page }) => {
  await page.goto("/?tab=library")

  // The Rides destination is restored, the legacy value is preserved for
  // reload-stable migration, and the V2 nav marks Rides as active.
  await expect(page.getByRole("heading", { name: "Rides", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Rides" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /ride library/i })).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]tab=library(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Rides")
})

test("legacy ?tab=profile deep link opens Settings over Plan", async ({ page }) => {
  await page.goto("/?tab=profile")

  await expect(page.getByRole("heading", { name: "You and your bike" })).toBeVisible()
  await expect(page).toHaveURL(/[?&]tab=profile(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Plan")
})

test("legacy ?tab=record deep link lands on Plan without starting a recording", async ({ page }) => {
  await page.goto("/?tab=record")

  // Recording is an activity, not a destination: a deep link must never
  // auto-open its preflight overlay.
  await expect(page.getByRole("heading", { name: "Record a ride" })).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]tab=record(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Plan")
})
