import { expect, test, type Page } from "@playwright/test"
import { installPlannerServices } from "../helpers/planner-fixtures"

/**
 * Route Library ownership contract, end to end against the real catalog API
 * and the real browser IndexedDB. The web server serves the committed fixture
 * catalog in `tests/fixtures/route-library` (see playwright.config.ts).
 *
 * The shared catalog is read-only. A route becomes rider-owned only through an
 * explicit Save to My Rides, exactly once, and deleting that copy never
 * touches the shared entry.
 */

const CATALOG_ID = "fixture-bald-eagle"
const COPY_ID = `catalog-copy--${CATALOG_ID}`
const CLEAN_NAME = "Bald Eagle Dual Sport"

interface OwnedRouteRow {
  id: string
  name: string
  libraryProvenance?: { kind: string; sourceCatalogRouteId?: string }
}

/** Rider-owned routes in this browser's My Rides database, read without creating it. */
async function ownedRoutes(page: Page): Promise<OwnedRouteRow[]> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases()
    if (!databases.some((database) => database.name === "switchback")) return []
    return new Promise<OwnedRouteRow[]>((resolve, reject) => {
      const request = indexedDB.open("switchback")
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (!database.objectStoreNames.contains("routes")) {
          database.close()
          resolve([])
          return
        }
        const read = database.transaction("routes", "readonly").objectStore("routes").getAll()
        read.onerror = () => reject(read.error)
        read.onsuccess = () => {
          database.close()
          resolve((read.result as OwnedRouteRow[]).map(({ id, name, libraryProvenance }) => ({ id, name, libraryProvenance })))
        }
      }
    })
  })
}

async function installServicesWithRealCatalog(page: Page): Promise<void> {
  await installPlannerServices(page)
  // The generic planner fixture stubs the catalog as empty; this journey is
  // about the real catalog contract, so let it reach the server.
  await page.unroute("**/api/gpx-library**")
}

async function openMyRides(page: Page): Promise<void> {
  await page.getByRole("group", { name: "Primary destinations" }).getByRole("button", { name: "Saved" }).click()
  await expect(page.getByRole("region", { name: "My Rides" })).toBeVisible()
}

test("Route Library stays shared while My Rides holds only explicit, duplicate-safe copies", async ({ page, request }) => {
  await installServicesWithRealCatalog(page)

  // 1. Populated shared catalog + empty personal database => My Rides is empty.
  const listing = await request.get("/api/gpx-library")
  expect(listing.status()).toBe(200)
  const catalog = await listing.json() as { routes: Array<{ id: string; name: string; durationMinutes: number | null }> }
  expect(catalog.routes.map((route) => route.id)).toContain(CATALOG_ID)
  expect(catalog.routes.find((route) => route.id === CATALOG_ID)).toMatchObject({ name: CLEAN_NAME, durationMinutes: null })

  await page.goto("/")
  await openMyRides(page)
  await expect(page.getByText("No rides saved yet.")).toBeVisible()
  expect(await ownedRoutes(page)).toEqual([])

  // 2. Browsing the Route Library (filters, map selection) never writes My Rides.
  await page.getByRole("link", { name: "Browse Route Library" }).click()
  await expect(page).toHaveURL(/\/gpx-library$/)
  await expect(page.getByRole("heading", { name: "GPX Library", level: 1 })).toBeVisible()
  const list = page.getByRole("list", { name: "Routes" })
  const cards = list.locator("[data-route-card]")
  await expect(cards).toHaveCount(2)
  await expect(list).toContainText(CLEAN_NAME)
  await expect(list).toContainText("Delaware Water Gap Run")
  await expect(list).not.toContainText(/\b0 min\b/)
  await expect(list).not.toContainText("ADVHub")
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  const filters = page.getByRole("region", { name: "All filters" })
  await expect(filters).toBeVisible()
  await filters.getByRole("combobox", { name: "Riding area" }).selectOption("Bald Eagle / Rothrock")
  await expect(cards).toHaveCount(1)
  await filters.getByRole("combobox", { name: "Riding area" }).selectOption("")
  // The GPX Library and Explore share one query and two presentations. Switch
  // to the map presentation to exercise selection without adding a second
  // preview/ownership authority to the page.
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await page.getByRole("button", { name: "Map", exact: true }).click()
  await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true")
  const mapList = page.getByRole("list", { name: "Routes on the map" })
  const mapCards = mapList.locator("[data-route-card]")
  await expect(mapCards).toHaveCount(2)
  const secondRoute = mapCards.filter({ hasText: "Delaware Water Gap Run" })
  await secondRoute.getByRole("button", { name: /show on map/ }).click()
  await expect(secondRoute.getByRole("button", { name: /show on map/ })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("status").filter({ hasText: "Delaware Water Gap Run is selected" })).toBeVisible()
  expect(await ownedRoutes(page)).toEqual([])

  // 3. Opening a shared route loads the detail surface, and Open in Planner
  // remains a navigation-only action.
  await mapCards.filter({ hasText: CLEAN_NAME }).getByRole("link", { name: "View route" }).click()
  await expect(page).toHaveURL(new RegExp(`/gpx-library/${CATALOG_ID}$`))
  await expect(page.getByRole("button", { name: "Save to My Rides" })).toBeEnabled()
  expect(await ownedRoutes(page)).toEqual([])
  await page.getByRole("link", { name: "Open in Planner" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(`${CLEAN_NAME} opened from the Route Library. It is not in My Rides until you save it.`)).toBeVisible()
  expect(await ownedRoutes(page)).toEqual([])
  await openMyRides(page)
  await expect(page.getByText("No rides saved yet.")).toBeVisible()

  // 4. Save to My Rides creates exactly one owned copy with catalog provenance.
  await page.goto(`/gpx-library/${CATALOG_ID}`)
  await expect(page.getByRole("heading", { name: "Route details", level: 1 })).toBeVisible()
  await expect(page.getByRole("heading", { name: CLEAN_NAME, level: 2 })).toBeVisible()
  await page.getByRole("button", { name: "Save to My Rides" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Saved to My Rides" })).toBeVisible()
  await expect.poll(() => ownedRoutes(page)).toEqual([
    { id: COPY_ID, name: CLEAN_NAME, libraryProvenance: { kind: "catalog-copy", sourceCatalogRouteId: CATALOG_ID } }
  ])

  // 5. Refresh keeps exactly one copy and recognises it instead of re-offering Save.
  await page.reload()
  await expect(page.getByRole("status").filter({ hasText: "Already in My Rides" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Save to My Rides" })).toHaveCount(0)
  expect(await ownedRoutes(page)).toHaveLength(1)

  await page.getByRole("link", { name: "Open saved copy" }).click()
  await expect(page).toHaveURL(/\/$/)
  await openMyRides(page)
  const myRides = page.getByRole("region", { name: "My Rides" })
  await expect(myRides.getByRole("button", { name: `Open ${CLEAN_NAME}` })).toHaveCount(1)
  expect(await ownedRoutes(page)).toHaveLength(1)

  // 6. Deleting the personal copy leaves the shared catalog entry untouched.
  await myRides.getByRole("button", { name: `Manage ${CLEAN_NAME}` }).click()
  await myRides.getByRole("button", { name: "Delete route" }).click()
  await myRides.getByRole("button", { name: "Confirm delete route" }).click()
  await expect(myRides.getByText("No rides saved yet.")).toBeVisible()
  await expect.poll(() => ownedRoutes(page)).toEqual([])

  const detail = await request.get(`/api/gpx-library?id=${CATALOG_ID}`)
  expect(detail.status()).toBe(200)
  expect((await detail.json() as { id: string }).id).toBe(CATALOG_ID)
  await page.goto("/gpx-library")
  await expect(page.getByRole("list", { name: "Routes" })).toContainText(CLEAN_NAME)
  await page.goto(`/gpx-library/${CATALOG_ID}`)
  await expect(page.getByRole("button", { name: "Save to My Rides" })).toBeEnabled()
})

test("Route Library keeps its list and map presentations contained and synchronized", async ({ page, isMobile }) => {
  test.skip(isMobile, "this viewport-containment contract is exercised in the desktop project")
  // The discovery surface owns its list/map viewport rather than creating a
  // second document scroll owner underneath the app navigation.
  await page.setViewportSize({ width: 1280, height: 560 })
  await page.goto("/gpx-library")
  await expect(page.getByRole("heading", { name: "GPX Library", level: 1 })).toBeVisible()
  const list = page.getByRole("list", { name: "Routes" })
  await expect(list).toBeVisible()
  await expect(list.locator("[data-route-card]")).toHaveCount(2)
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true")

  const viewport = await page.evaluate(() => ({
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }))
  expect(viewport.htmlOverflow).toBe("hidden")
  expect(viewport.bodyOverflow).toBe("hidden")
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth)

  await page.getByRole("button", { name: "Map", exact: true }).click()
  await expect(page.getByRole("list", { name: "Routes on the map" })).toBeVisible()
  await expect(page.getByRole("list", { name: "Routes on the map" }).locator("[data-route-card]")).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true")
})
