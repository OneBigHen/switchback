import { expect, type Page, type TestInfo } from "@playwright/test"
import type { RouteFixture } from "../helpers/planner-fixtures"
import { ensureMobileQaArtifactDirectory } from "./artifacts"
import { isExpectedProviderHealthAbort, type MobileQaRuntimeIssues } from "./assertions"

export interface SavedRouteSeed extends RouteFixture {
  readonly notes: string
  readonly folder: string
  readonly tags: string[]
  readonly visible: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export const ROUTE_LIBRARY_SEED_SCHEMA = {
  databaseVersion: 2,
  storeName: "routes",
  indexNames: ["name", "profile", "folder", "tags", "visible", "createdAt", "updatedAt"],
} as const

export const MOBILE_QA_SEED_PATH = "/__mobile-qa-seed"

export function savedRouteSeed(route: RouteFixture, name = route.name): SavedRouteSeed {
  const timestamp = "2026-01-01T00:00:00.000Z"
  return {
    ...route,
    name,
    notes: "",
    folder: "Unfiled",
    tags: [],
    visible: true,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export async function seedSavedRoute(page: Page, route: SavedRouteSeed): Promise<void> {
  const seedDocument = async (route: import("@playwright/test").Route): Promise<void> => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Mobile QA storage seed</title>",
    })
  }
  await page.route(`**${MOBILE_QA_SEED_PATH}`, seedDocument)
  try {
    await page.goto(MOBILE_QA_SEED_PATH, { waitUntil: "commit" })
    await page.evaluate(async (savedRoute) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("switchback", 2)
      request.onupgradeneeded = () => {
        const database = request.result
        const transaction = request.transaction
        if (transaction === null) {
          reject(new Error("Route library upgrade transaction is missing"))
          return
        }
        const store = database.objectStoreNames.contains("routes")
          ? transaction.objectStore("routes")
          : database.createObjectStore("routes", { keyPath: "id" })
        for (const [name, keyPath, multiEntry] of [
          ["name", "name", false],
          ["profile", "profile", false],
          ["folder", "folder", false],
          ["tags", "tags", true],
          ["visible", "visible", false],
          ["createdAt", "createdAt", false],
          ["updatedAt", "updatedAt", false],
        ] as const) {
          if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { multiEntry })
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("routes", "readwrite")
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error("Route library seed transaction aborted"))
      transaction.objectStore("routes").put(savedRoute)
    })
    database.close()
    }, route)
  } finally {
    await page.unroute(`**${MOBILE_QA_SEED_PATH}`, seedDocument)
  }
  const persistedName = await readSavedRouteName(page, route.id)
  if (persistedName !== route.name) {
    throw new Error(`Mobile QA saved route seed readback mismatch for ${route.id}`)
  }
}

export async function readSavedRouteName(page: Page, id: string): Promise<string | null> {
  return page.evaluate(async (routeId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("switchback")
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    const route = await new Promise<{ readonly name?: unknown } | undefined>((resolve, reject) => {
      const request = database.transaction("routes", "readonly").objectStore("routes").get(routeId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as { readonly name?: unknown } | undefined)
    })
    database.close()
    return typeof route?.name === "string" ? route.name : null
  }, id)
}

export async function captureMobileQaScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const destination = ensureMobileQaArtifactDirectory("screenshots", testInfo.project.name, name)
  await page.screenshot({ path: destination, fullPage: true, animations: "disabled" })
}

export interface ExpectedNetworkFailure {
  readonly host: string
  readonly pathname: string
  readonly status: number
}

export function expectOnlyDeliberateNetworkFailures(
  runtimeIssues: MobileQaRuntimeIssues,
  expected: ExpectedNetworkFailure,
): void {
  // Mount-time capability probes the app cancels itself are not failures the
  // deliberate-endpoint check is about, and they do not carry a status code, so
  // they would otherwise fall through the status match below as "unexpected".
  const failures = runtimeIssues.failedRequests.filter((failure) => !isExpectedProviderHealthAbort(failure))
  expect(failures.length, "the deliberate failure endpoint must be observed").toBeGreaterThan(0)
  const unexpected = failures.filter((failure) => {
    const match = /^(\d+) (https?:\/\/[^ ]+)/.exec(failure)
    if (!match) return true
    const url = new URL(match[2])
    return Number(match[1]) !== expected.status || url.host !== expected.host || url.pathname !== expected.pathname
  })
  expect(unexpected, "only the exact deliberate provider endpoint may fail").toEqual([])
}

export async function expectOfflineBrowserState(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
  // Match only rendered copy. Without the visible filter this binds to the
  // first DOM match, which can be a surface the rider has navigated away from
  // (it stays mounted but hidden) — a hidden node then fails the assertion
  // even though the offline messaging is on screen.
  await expect(page.getByText(/offline|local|device/i).filter({ visible: true }).first()).toBeVisible()
}

export async function expectFocusedControlInVisualViewport(page: Page, label: string): Promise<void> {
  // Narrow to the form control. A SettingRow wraps each control in a
  // role="group" carrying the same aria-label, so a bare getByLabel matches
  // both the group and the control and trips strict mode.
  const control = page.locator("input, select, textarea").and(page.getByLabel(label))
  await control.focus()
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const viewport = window.visualViewport ?? { width: window.innerWidth, height: window.innerHeight }
    return rect.top >= -1 && rect.left >= -1 && rect.bottom <= viewport.height + 1 && rect.right <= viewport.width + 1
  })).toBe(true)
}
