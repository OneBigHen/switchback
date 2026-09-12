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
  await page.getByRole("group", { name: "Primary destinations" }).getByRole("button", { name: "Rides" }).click()
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

  // 2. Browsing the Route Library (filters, rail selection) never writes My Rides.
  await page.getByRole("link", { name: "Browse Route Library" }).click()
  await expect(page).toHaveURL(/\/gpx-library$/)
  await expect(page.getByRole("heading", { name: "Route Library", level: 1 })).toBeVisible()
  const deck = page.locator(".atlas-deck")
  await expect(deck.locator(".atlas-ride-card")).toHaveCount(2)
  await expect(deck).toContainText(CLEAN_NAME)
  await expect(deck).toContainText("Delaware Water Gap Run")
  await expect(deck).not.toContainText(/\b0 min\b/)
  await expect(deck).not.toContainText("ADVHub")
  await page.getByRole("combobox", { name: "Riding area" }).selectOption("Bald Eagle / Rothrock")
  await expect(deck.locator(".atlas-ride-card")).toHaveCount(1)
  await page.getByRole("combobox", { name: "Riding area" }).selectOption("")
  // Tablet-landscape and wider preview a ride in a rail; phones drill in.
  const railLayout = (page.viewportSize()?.width ?? 0) >= 900
  if (railLayout) {
    await deck.getByRole("button", { name: /Delaware Water Gap Run/ }).click()
    const rail = page.getByRole("complementary", { name: "Selected ride" })
    await expect(rail.getByRole("heading", { name: "Delaware Water Gap Run" })).toBeVisible()
    await expect(rail.getByRole("button", { name: "Save to My Rides" })).toBeEnabled()
    expect(await ownedRoutes(page)).toEqual([])

    // 3. Open in Planner loads the shared line and does not save it.
    await deck.getByRole("button", { name: new RegExp(CLEAN_NAME) }).click()
    await rail.getByRole("link", { name: "Open in Planner" }).click()
  } else {
    await expect(page.getByRole("complementary", { name: "Selected ride" })).toHaveCount(0)
    await deck.getByRole("link", { name: new RegExp(CLEAN_NAME) }).click()
    await expect(page).toHaveURL(new RegExp(`/gpx-library/${CATALOG_ID}$`))
    await expect(page.getByRole("button", { name: "Save to My Rides" })).toBeEnabled()
    expect(await ownedRoutes(page)).toEqual([])

    // 3. Open in Planner loads the shared line and does not save it.
    await page.getByRole("link", { name: "Open in Planner" }).click()
  }
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(`${CLEAN_NAME} opened from the Route Library. It is not in My Rides until you save it.`)).toBeVisible()
  expect(await ownedRoutes(page)).toEqual([])
  await openMyRides(page)
  await expect(page.getByText("No rides saved yet.")).toBeVisible()

  // 4. Save to My Rides creates exactly one owned copy with catalog provenance.
  await page.goto(`/gpx-library/${CATALOG_ID}`)
  await expect(page.getByRole("heading", { name: CLEAN_NAME, level: 1 })).toBeVisible()
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
  await expect(page.locator(".atlas-deck")).toContainText(CLEAN_NAME)
  await page.goto(`/gpx-library/${CATALOG_ID}`)
  await expect(page.getByRole("button", { name: "Save to My Rides" })).toBeEnabled()
})

test("Route Library scrolls as a document with the filters and preview rail kept in view", async ({ page, isMobile }) => {
  test.skip(isMobile, "wheel scrolling and the preview rail are wide-layout behaviours")
  // Short enough that even the two-ride fixture catalog overflows.
  await page.setViewportSize({ width: 1280, height: 560 })
  await page.goto("/gpx-library")
  const rail = page.getByRole("complementary", { name: "Selected ride" })
  await expect(rail).toBeVisible()

  await page.mouse.move(640, 420)
  await page.mouse.wheel(0, 700)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  // The sticky filter bar pins to the top, and the rail's sticky offset is the
  // bar's measured height so a stuck rail sits below it rather than under it.
  const controls = page.getByRole("group", { name: "Sort and filter the Route Library" })
  await expect.poll(async () => Math.round((await controls.boundingBox())?.y ?? -1)).toBe(0)
  const controlsHeight = await controls.evaluate((element) => (element as HTMLElement).offsetHeight)
  const railTop = await rail.evaluate((element) => getComputedStyle(element).top)
  expect(Number.parseFloat(railTop)).toBeGreaterThanOrEqual(controlsHeight)

  await page.goto(`/gpx-library/${CATALOG_ID}`)
  await page.mouse.move(640, 420)
  await page.mouse.wheel(0, 700)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})
