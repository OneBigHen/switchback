import { devices, expect, test, type Locator, type Page } from "@playwright/test"

/**
 * The approved OpenGravel mobile redesign, asserted at its target viewport.
 *
 * These are contract assertions, not screenshots: they say what each of the
 * four screens must expose and how much of the phone the map must keep. The
 * visual comparison against the approved references is a separate, human step.
 */

const PHONE = { width: 390, height: 844 }

test.use({
  ...devices["iPhone 14"],
  viewport: PHONE,
  isMobile: true,
  hasTouch: true
})

const PRIMARY_DESTINATIONS = ["Plan", "Explore", "Saved", "Record", "Settings"]

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, "the page must not scroll horizontally at 390px").toBeLessThanOrEqual(1)
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box, `${await locator.textContent()} must be laid out`).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)
}

test.describe("shared mobile navigation", () => {
  test("exposes Plan, Explore, Saved, Record and Settings in order, above the home indicator", async ({ page }) => {
    await page.goto("/")
    const primary = page.getByRole("group", { name: "Primary destinations" })
    await expect(primary).toBeVisible()

    const items = primary.getByRole("button")
    await expect(items).toHaveCount(PRIMARY_DESTINATIONS.length)
    for (const [index, label] of PRIMARY_DESTINATIONS.entries()) {
      await expect(items.nth(index)).toHaveText(label)
      await expectTouchTarget(items.nth(index))
    }

    // The selected destination has programmatic state, not just a colour.
    await expect(primary.getByRole("button", { name: "Plan", exact: true }))
      .toHaveAttribute("aria-current", "page")

    const navBox = await primary.boundingBox()
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(PHONE.height)
    await expectNoHorizontalOverflow(page)
  })

  test("moves between destinations and keeps Record an activity", async ({ page }) => {
    await page.goto("/")
    const primary = page.getByRole("group", { name: "Primary destinations" })

    await primary.getByRole("button", { name: "Saved" }).click()
    await expect(page).toHaveURL(/[?&]tab=saved(?:&|$)/)
    await expect(primary.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-current", "page")

    await primary.getByRole("button", { name: "Explore" }).click()
    await expect(page).toHaveURL(/[?&]tab=explore(?:&|$)/)

    // Record starts a task; it never claims to be a place.
    await expect(primary.getByRole("button", { name: "Record" })).not.toHaveAttribute("aria-current", "page")
  })
})

test.describe("planner", () => {
  test("keeps the map useful while showing the whole approved composition", async ({ page }) => {
    await page.goto("/")
    const sheet = page.locator("#planner-sheet")
    await expect(sheet).toBeVisible()

    // Normal planning must not become an opaque surface that removes the map.
    const sheetBox = await sheet.boundingBox()
    const mapShare = sheetBox!.y / PHONE.height
    expect(mapShare, "normal planning keeps roughly half the phone as map").toBeGreaterThanOrEqual(0.42)

    await expect(page.getByPlaceholder("Search a place or describe a ride")).toBeVisible()

    const tripShape = page.getByRole("group", { name: "Trip shape" })
    await expect(tripShape.getByRole("button", { name: "To", exact: true })).toBeVisible()
    await expect(tripShape.getByRole("button", { name: "Loop", exact: true })).toBeVisible()
    await expect(tripShape.getByRole("button", { name: "Free Ride" })).toBeVisible()
    // One mode family, not a segmented control plus a separate mode button.
    await expect(page.getByRole("button", { name: "Free Ride" })).toHaveCount(1)

    // One compact preferences row that reads the rider's state back.
    const preferences = page.getByRole("button", { name: /Ride options/ })
    await expect(preferences).toHaveCount(1)
    await expect(preferences).toContainText("·")

    await expect(page.getByRole("button", { name: /Create ride/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Draw manually/ })).toBeVisible()

    // Gravel Goblin is an invitation, not a reserved advisor card.
    const goblin = page.getByRole("region", { name: "Gravel Goblin ride builder" })
    if (await goblin.count()) {
      const goblinBox = await goblin.boundingBox()
      expect(goblinBox!.height).toBeLessThanOrEqual(96)
    }

    // Undo/redo are editing controls, not permanent planner furniture.
    await expect(page.getByRole("button", { name: "Undo ride change" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Redo ride change" })).toHaveCount(0)

    await expectNoHorizontalOverflow(page)
  })

  test("opens the detailed controls from the preferences row", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /Ride options/ }).click()
    await expect(page.getByRole("group", { name: "Ride character" })).toBeVisible()
  })
})

test.describe("explore", () => {
  test("is map-first discovery with a card rail synchronised to the map", async ({ page }) => {
    await page.goto("/?tab=explore")
    await expect(page.getByRole("heading", { name: "Explore routes" })).toBeVisible()

    const presentation = page.getByRole("group", { name: "Presentation" })
    await expect(presentation.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true")
    await expect(presentation.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "false")

    await expect(page.getByPlaceholder("Search routes, places, or regions")).toBeVisible()
    await expect(page.getByRole("group", { name: "Quick filters" })).toBeVisible()

    const rail = page.getByRole("list", { name: "Routes on the map" })
    await expect(rail).toBeVisible()

    const firstCard = rail.locator("[data-route-card]").first()
    const select = firstCard.getByRole("button", { name: /show on map/ })
    await select.click()
    await expect(select).toHaveAttribute("aria-pressed", "true")
    await expect(firstCard).toHaveAttribute("data-selected", "true")

    await expectNoHorizontalOverflow(page)
  })

  test("shares one query between Map and List", async ({ page }) => {
    await page.goto("/?tab=explore")
    await expect(page.getByRole("heading", { name: "Explore routes" })).toBeVisible()

    const rail = page.getByRole("list", { name: "Routes on the map" })
    await expect(rail.locator("[data-route-card]").first()).toBeVisible()
    const unfiltered = await rail.locator("[data-route-card]").count()

    await page.getByPlaceholder("Search routes, places, or regions").fill("bald")
    const filteredOnMap = await rail.locator("[data-route-card]").count()
    expect(filteredOnMap).toBeGreaterThan(0)
    expect(filteredOnMap).toBeLessThan(unfiltered)

    await page.getByRole("group", { name: "Presentation" }).getByRole("button", { name: "List" }).click()
    const list = page.getByRole("list", { name: "Routes" })
    await expect(list).toBeVisible()

    // The same query, the same answer: List is a presentation over the result
    // Map was already showing, not a second fetch with its own filtering.
    expect(await list.locator("[data-route-card]").count()).toBe(filteredOnMap)
    await expect(page.getByPlaceholder("Search routes, places, or regions")).toHaveValue("bald")
  })
})

test.describe("GPX Library", () => {
  test("lists routes with geography, not silhouettes, and does not lead with turn counts", async ({ page }) => {
    await page.goto("/gpx-library")
    await expect(page.getByRole("heading", { name: "Explore routes" })).toBeVisible()

    const presentation = page.getByRole("group", { name: "Presentation" })
    await expect(presentation.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true")

    await expect(page.getByPlaceholder("Search routes, locations, or keywords")).toBeVisible()

    const cards = page.locator("[data-route-card]")
    await expect(cards.first()).toBeVisible()
    const cardCount = await cards.count()
    for (let index = 0; index < Math.min(cardCount, 6); index += 1) {
      // Every visible card answers "where is this ride?".
      await expect(cards.nth(index).locator("[data-route-preview]")).toHaveCount(1)
    }

    await expect(page.locator("[data-route-card]").first()).not.toContainText(/\d+ turns/)

    // One shared renderer for previews, not one live map per card.
    const canvases = await page.locator("[data-route-card] canvas").count()
    expect(canvases, "route cards must not each mount a map").toBe(0)

    await expect(page.getByRole("group", { name: "Primary destinations" })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test("keeps the catalog's existing filtering available", async ({ page }) => {
    await page.goto("/gpx-library")
    await page.getByRole("button", { name: /Filters/ }).click()

    const filters = page.getByRole("region", { name: "All filters" })
    await expect(filters.getByRole("group", { name: "Duration" })).toBeVisible()
    await expect(filters.getByRole("group", { name: "Difficulty" })).toBeVisible()
    await expect(filters.getByRole("group", { name: "Sort" })).toBeVisible()
  })
})

test.describe("route detail", () => {
  test("opens on a real map of the real route, with the decision above the fold", async ({ page }) => {
    await page.goto("/gpx-library")
    await page.locator("[data-route-card] a").first().click()

    await expect(page.getByRole("heading", { name: "Route details" })).toBeVisible()

    // The hero is geography, not the retired dark-grid poster.
    const hero = page.locator("[data-detail-map]")
    await expect(hero).toHaveCount(1)
    await expect(page.locator(".atlas-poster")).toHaveCount(0)
    const heroBox = await hero.boundingBox()
    expect(heroBox!.height / PHONE.height).toBeGreaterThan(0.24)
    expect(heroBox!.height / PHONE.height).toBeLessThan(0.48)

    const summary = page.getByRole("region", { name: "Route summary" })
    await expect(summary).toBeVisible()
    await expect(summary.getByText("Distance")).toBeVisible()
    await expect(summary.getByText("Surface")).toBeVisible()
    await expect(summary.getByRole("link", { name: "Open in Planner" })).toBeVisible()

    // Diagnostics exist, but below the decision rather than inside it.
    const technical = page.getByRole("region", { name: "Route data and diagnostics" })
    await expect(technical).toBeVisible()
    const summaryBox = await summary.boundingBox()
    const technicalBox = await technical.boundingBox()
    expect(technicalBox!.y).toBeGreaterThan(summaryBox!.y)
    await expect(summary).not.toContainText(/turns/i)

    await expectNoHorizontalOverflow(page)
  })

  test("states surface confidence truthfully instead of filling the layout", async ({ page }) => {
    await page.goto("/gpx-library")
    await page.locator("[data-route-card] a").first().click()

    const surface = page.getByRole("region", { name: "Route summary" }).locator("[data-evidence]").last()
    const evidence = await surface.getAttribute("data-evidence")
    expect(["verified", "estimated", "unknown"]).toContain(evidence)
    if (evidence === "unknown") {
      // An unevaluated surface never gets a percentage.
      await expect(surface).not.toContainText("%")
    }
  })
})
