import { expect, test, type Page } from "@playwright/test"
import { installPlannerServices } from "../helpers/planner-fixtures"

// The approved information architecture: `Plan · Explore · Saved · Record ·
// Settings`. Four of those are destinations; Record starts a task and never
// claims to be a place. Superseded `?tab=` values migrate into current state
// instead of breaking.
//
// URL semantics (PlannerShell.handleBack / applyDestination): a deep link
// keeps its `?tab=` value so a reload re-migrates to the same state, while a
// rider-selected destination rewrites the address bar to the current value.
//
// Saved and Settings are destinations, not modals. Navigation therefore
// remains reachable while the rider works in either surface.

const activeDestination = (page: Page) =>
  page.locator(".app-navigation-primary button[aria-current='page']")

test.beforeEach(async ({ page }) => {
  await installPlannerServices(page)
})

test("primary navigation exposes the approved mobile model in order", async ({ page }) => {
  await page.goto("/")

  const primary = page.getByRole("group", { name: "Primary destinations" })
  const items = primary.getByRole("button")
  await expect(items).toHaveCount(5)
  for (const [index, label] of ["Plan", "Explore", "Saved", "Record", "Settings"].entries()) {
    await expect(items.nth(index)).toHaveText(label)
  }
  await expect(activeDestination(page)).toHaveText("Plan")
})

test("moving between destinations updates the URL and the visible surface", async ({ page }) => {
  await page.goto("/")
  const primary = page.getByRole("group", { name: "Primary destinations" })

  await primary.getByRole("button", { name: "Saved" }).click()
  await expect(page).toHaveURL(/[?&]tab=saved(?:&|$)/)
  await expect(page.getByRole("heading", { name: "My Rides", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "My Rides" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /ride library/i })).toHaveCount(0)
  await expect(activeDestination(page)).toHaveText("Saved")

  await primary.getByRole("button", { name: "Explore" }).click()
  await expect(page).toHaveURL(/[?&]tab=explore(?:&|$)/)
  await expect(page.getByRole("region", { name: "Explore" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Explore routes" })).toBeVisible()
  await expect(page.getByPlaceholder("Search routes, places, or regions")).toBeVisible()
  // Rider-published routes keep their own home; Explore links to it rather
  // than swallowing or quietly dropping a surface that already worked.
  await expect(page.getByRole("link", { name: "Community Atlas" })).toHaveAttribute("href", "/routes")
  await expect(activeDestination(page)).toHaveText("Explore")

  await primary.getByRole("button", { name: "Settings" }).click()
  await expect(page).toHaveURL(/[?&]tab=settings(?:&|$)/)
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible()
  await expect(activeDestination(page)).toHaveText("Settings")

  await primary.getByRole("button", { name: "Plan" }).click()
  await expect(page).not.toHaveURL(/[?&]tab=/)
  await expect(activeDestination(page)).toHaveText("Plan")
})

test("superseded ?tab= deep links migrate onto the current destinations", async ({ page }) => {
  await page.goto("/?tab=library")

  await expect(page.getByRole("heading", { name: "My Rides", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "My Rides" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /ride library/i })).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]tab=library(?:&|$)/)
  await expect(activeDestination(page)).toHaveText("Saved")

  await page.goto("/?tab=rides")
  await expect(activeDestination(page)).toHaveText("Saved")

  await page.goto("/?tab=discover")
  await expect(activeDestination(page)).toHaveText("Explore")
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

test("?open=record shows the Record surface without starting a recording", async ({ page }) => {
  // Pages outside the app shell (the GPX Library) hand the rider back to
  // Record this way. Showing the panel still starts nothing.
  await page.goto("/?open=record")

  await expect(page.getByRole("heading", { name: "Record a ride" })).toBeVisible()
  await expect(activeDestination(page)).toHaveText("Plan")
})
