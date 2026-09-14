import { expect, test, type Page } from "@playwright/test"

// Recon critical coverage: Explorer opens on the one map, a Route Library
// preview flies without inventing time, and a recorded ride (seeded into this
// browser's ride journal from real fixture road geometry) replays, opens
// X-Ray, and enters and leaves Cinematic — with no console errors.

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(String(error)))
  return errors
}

/** Terrain and basemap tiles are third-party; their failures are not app errors. */
function appErrors(errors: string[]): string[] {
  return errors.filter((text) => !/tiles\.(openfreemap|mapterhorn)\.|Failed to load resource|ERR_(NAME|INTERNET|CONNECTION)|AJAXError/i.test(text))
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

async function firstCatalogRoute(page: Page): Promise<{ id: string; name: string; geometry: [number, number][] }> {
  const list = await page.request.get("/api/gpx-library")
  expect(list.status()).toBe(200)
  const { routes } = (await list.json()) as { routes: { id: string; name: string }[] }
  const detail = await page.request.get(`/api/gpx-library?id=${encodeURIComponent(routes[0]!.id)}`)
  expect(detail.status()).toBe(200)
  const body = (await detail.json()) as { route?: { geometry: [number, number][] }; geometry?: [number, number][] }
  return { id: routes[0]!.id, name: routes[0]!.name, geometry: body.route?.geometry ?? body.geometry ?? [] }
}

test("explorer opens with the map, the ride panel and a preview card", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/labs/recon")
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("heading", { name: "Recon" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Your rides" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Route previews" })).toBeVisible()
  await expect(page.getByRole("link", { name: "▶ Preview flyover" })).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => window.__reconMapDebug?.getPitch() ?? 0), { timeout: 30_000 }).toBeGreaterThanOrEqual(45)
  await expectNoOverflow(page)
  expect(appErrors(errors)).toEqual([])
})

test("a route preview plays as a flyover with no recorded time", async ({ page }) => {
  const errors = watchErrors(page)
  const route = await firstCatalogRoute(page)
  await page.goto(`/labs/recon/replay/${encodeURIComponent(`catalog:${route.id}`)}`)
  await expect(page.getByRole("heading", { name: route.name })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("Route preview · no recorded time")).toBeVisible()
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("Elapsed", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Play" }).click()
  await expect.poll(() => page.evaluate(() => window.__reconReplayDebug?.progress() ?? 0), { timeout: 20_000 }).toBeGreaterThan(0)
  await expectNoOverflow(page)
  expect(appErrors(errors)).toEqual([])
})

test("a recorded ride replays, opens X-Ray and runs Cinematic", async ({ page }) => {
  const errors = watchErrors(page)
  const route = await firstCatalogRoute(page)
  expect(route.geometry.length).toBeGreaterThanOrEqual(2)

  // Seed the Dexie ride journal (IndexedDB "switchback-ride-journal", Dexie v1 = IDB v10).
  await page.goto("/labs/recon")
  const rideId = "e2e-recorded-ride"
  await page.evaluate(
    async ({ id, geometry, name, routeId }) => {
      const start = Date.UTC(2026, 7, 30, 14, 0, 0)
      // Densify the route line into ~1 fix per vertex step, as a phone would record it.
      const fixes: [number, number][] = []
      for (let index = 1; index < geometry.length; index += 1) {
        const [a, b] = [geometry[index - 1]!, geometry[index]!]
        for (let step = 0; step < 25; step += 1) fixes.push([a[0] + ((b[0] - a[0]) * step) / 25, a[1] + ((b[1] - a[1]) * step) / 25])
      }
      fixes.push(geometry[geometry.length - 1]!)
      const points = fixes.map((coordinate, index) => ({
        coordinate,
        recordedAt: new Date(start + index * 4_000).toISOString(),
        speedMph: 28 + (index % 7),
        altitudeMeters: 300 + Math.sin(index / 12) * 40
      }))
      const ride = {
        id,
        routeId,
        routeName: name,
        route: { id: routeId, name, geometry },
        points,
        notes: "Seeded by the Recon critical spec",
        photos: [{ id: "overlook", caption: "Overlook", takenAt: points[Math.floor(points.length / 2)]!.recordedAt }],
        startedAt: points[0]!.recordedAt,
        endedAt: points[points.length - 1]!.recordedAt,
        createdAt: points[0]!.recordedAt,
        updatedAt: points[0]!.recordedAt
      }
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("switchback-ride-journal", 10)
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("rides", { keyPath: "id" })
          for (const index of ["routeId", "startedAt", "endedAt", "updatedAt"]) store.createIndex(index, index)
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const tx = request.result.transaction("rides", "readwrite")
          tx.objectStore("rides").put(ride)
          tx.oncomplete = () => {
            request.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    { id: rideId, geometry: route.geometry, name: route.name, routeId: route.id }
  )

  await page.goto(`/labs/recon/replay/${rideId}`)
  await expect(page.getByRole("heading", { name: route.name })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("Elapsed", { exact: true })).toBeVisible({ timeout: 60_000 })

  await page.getByRole("button", { name: "Play" }).click()
  await expect.poll(() => page.evaluate(() => window.__reconReplayDebug?.progress() ?? 0), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.getByRole("button", { name: "Pause" }).click()

  await page.getByRole("button", { name: "X-Ray" }).click()
  const xray = page.getByRole("complementary", { name: "X-Ray ride breakdown" })
  await expect(xray).toBeVisible()
  await expect(xray.getByText("No earlier rides on record — all new to you")).toBeVisible()
  await expect(xray.getByRole("button", { name: /Overlook/ })).toBeVisible()

  await page.getByRole("button", { name: "Cinematic" }).click()
  await expect(page.getByRole("button", { name: /Exit film/ })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__reconReplayDebug?.cinematic() ?? false)).toBe(true)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible()

  await expectNoOverflow(page)
  expect(appErrors(errors)).toEqual([])
})
