import { expect, test, type Page } from "@playwright/test"
import { installPlannerServices } from "../helpers/planner-fixtures"

// V2 information architecture: four persistent destinations
// (Plan | Rides | Discover | Settings), Record as a secondary activity, and
// legacy V1 `?tab=` deep links that migrate into V2 state instead of
// breaking.
//
// URL semantics (PlannerShell.handleBack / applyDestination): a deep link
// keeps its `?tab=` value so a reload re-migrates to the same state, while a
// rider-selected destination rewrites the address bar to the V2 value.
//
// Rides and Settings are destinations, not modals. Navigation therefore
// remains reachable while the rider works in either surface.

const activeDestination = (page: Page) =>
  page.locator(".app-navigation-primary button[aria-current='page']")

test.beforeEach(async ({ page }) => {
  await installPlannerServices(page)
})

test("primary navigation exposes exactly the four V2 destinations", async ({ page }) => {
  await page.goto("/")

  const primary = page.getByRole("group", { name: "Primary destinations" })
  await expect(primary.getByRole("button")).toHaveCount(4)
  await expect(primary.getByRole("button", { name: "Plan" })).toBeVisible()
  await expect(primary.getByRole("button", { name: "Rides" })).toBeVisible()
  await expect(primary.getByRole("button", { name: "Discover" })).toBeVisible()
  await expect(primary.getByRole("button", { name: "Settings" })).toBeVisible()
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

  await primary.getByRole("button", { name: "Settings" }).click()
  await expect(page).toHaveURL(/[?&]tab=settings(?:&|$)/)
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible()
  await expect(activeDestination(page)).toHaveText("Settings")

  await primary.getByRole("button", { name: "Plan" }).click()
  await expect(page).not.toHaveURL(/[?&]tab=/)
  await expect(activeDestination(page)).toHaveText("Plan")
})

test("legacy ?tab=library deep link lands on the Rides destination", async ({ page }) => {
  await page.goto("/?tab=library")

  await expect(page.getByRole("heading", { name: "Rides", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Rides" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /ride library/i })).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]tab=library(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Rides")
})

test("legacy ?tab=profile deep link lands on the Settings destination", async ({ page }) => {
  await page.goto("/?tab=profile")

  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /account, sync & rider data/i })).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]tab=profile(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Settings")
})

test("legacy ?tab=record deep link lands on Plan without starting a recording", async ({ page }) => {
  await page.goto("/?tab=record")

  // Recording is an activity, not a destination: a deep link must never
  // auto-open its preflight overlay.
  await expect(page.getByRole("heading", { name: "Record a ride" })).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]tab=record(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Plan")
})
