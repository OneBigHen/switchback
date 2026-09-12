import { expect, test, type Page } from "@playwright/test"
import { settleMapDelay, uxState } from "../helpers/ux-state-fixtures"
import {
  ensureFixtureStart,
  expectRouteOutcome,
  fillFixtureFinish,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  tripPlan
} from "../helpers/planner-fixtures"

const VIEWPORTS = [
  { width: 768, height: 1024, label: "768x1024 portrait" },
  { width: 820, height: 1180, label: "820x1180 portrait" },
  { width: 1024, height: 768, label: "1024x768 landscape" },
  { width: 1180, height: 820, label: "1180x820 landscape" }
] as const

const REGRESSION_VIEWPORTS = [
  { width: 390, height: 844, label: "390x844 phone portrait", mode: "compact" },
  { width: 667, height: 375, label: "667x375 short landscape", mode: "compact" },
  { width: 700, height: 900, label: "700x900 split-width fallback", mode: "compact" },
  { width: 1366, height: 1024, label: "1366x1024 constrained wide", mode: "wide" },
  { width: 1440, height: 900, label: "1440x900 desktop", mode: "wide" }
] as const

const STATES = ["search", "choose", "edit", "prepare"] as const
type WorkspaceState = (typeof STATES)[number]

async function drive(page: Page, state: WorkspaceState) {
  if (state === "search") return uxState.home(page)
  if (state === "choose") return uxState.routeAlternatives(page)
  if (state === "edit") return uxState.routeEdit(page)
  return uxState.routeSelected(page)
}

async function measure(page: Page) {
  return page.evaluate(() => {
    type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number }
    const rect = (selector: string): Rect | null => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return null
      return {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height
      }
    }
    const overlap = (a: Rect | null, b: Rect | null) => {
      if (!a || !b) return 0
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return width > 0 && height > 0 ? width * height : 0
    }

    const map = rect(".map-stage") ?? rect(".map-workspace")
    const deck = rect(".planner-deck")
    const nav = rect(".app-navigation")
    const attribution = rect(".maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib")
    const nativeControls = rect(".maplibregl-ctrl-group, .mapboxgl-ctrl-group")
    const viewportArea = innerWidth * innerHeight
    const mapArea = map ? map.width * map.height : 0
    const coveredByDeck = overlap(map, deck)
    const coveredByNav = overlap(map, nav)
    const deckNavOverlap = overlap(deck, nav)

    return {
      viewport: { width: innerWidth, height: innerHeight },
      map,
      deck,
      nav,
      attribution,
      nativeControls,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      deckNavOverlap,
      attributionNavOverlap: overlap(attribution, nav),
      nativeControlsDeckOverlap: overlap(nativeControls, deck),
      mapUnobstructedShare: viewportArea > 0
        ? Math.max(0, mapArea - coveredByDeck - coveredByNav + deckNavOverlap) / viewportArea
        : 0
    }
  })
}

const MEDIUM_ROUTE_IDS: Readonly<Record<string, string>> = {
  "Balanced medium route": "medium-balanced",
  "Twisty medium route": "medium-twisty",
  "Scenic medium route": "medium-scenic"
}

/** Route ids the real MapLibre route source currently renders as selected. */
async function selectedMapRouteIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const data = await window.__switchbackMapSourcesDebug?.getSourceData("switchback-routes") as
      | { features?: Array<{ properties?: { routeId?: string; selected?: boolean } }> }
      | null
      | undefined
    const ids = (data?.features ?? [])
      .filter((feature) => feature.properties?.selected === true)
      .map((feature) => String(feature.properties?.routeId))
    return [...new Set(ids)].sort()
  })
}

type OverlayRect = { left: number; top: number; right: number; bottom: number }

async function overlayOverlap(page: Page, first: string, second: string): Promise<{ first: OverlayRect | null; second: OverlayRect | null; area: number }> {
  return page.evaluate(([a, b]) => {
    const rect = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return box.width > 0 && box.height > 0 ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null
    }
    const one = rect(a)
    const two = rect(b)
    const width = one && two ? Math.min(one.right, two.right) - Math.max(one.left, two.left) : 0
    const height = one && two ? Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top) : 0
    return { first: one, second: two, area: width > 0 && height > 0 ? width * height : 0 }
  }, [first, second] as const)
}

async function attributionCorner(page: Page): Promise<string> {
  const attribution = page.locator(".maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib").first()
  await expect(attribution).toBeAttached()
  return attribution.evaluate((node) => node.parentElement?.className ?? "")
}

async function expectWorkspaceMode(page: Page, mode: "compact" | "medium" | "wide") {
  // PlannerComposition owns the canonical Compact/Medium/Wide topology. The
  // map workspace also has a data-workspace-mode attribute, but its vocabulary
  // is planning/ride and is a separate camera/presentation concern.
  await expect(page.locator(`div[data-workspace-mode="${mode}"]`).first()).toBeAttached()
}

test.describe("Medium adaptive planner workspace", () => {
  for (const viewport of VIEWPORTS) {
    for (const state of STATES) {
      test(`${viewport.label} keeps ${state} map-first and collision free`, async ({ page }) => {
        test.setTimeout(150_000)
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await drive(page, state)
        await settleMapDelay(page)
        await expectWorkspaceMode(page, "medium")

        const geometry = await measure(page)
        expect(geometry.map, "map must remain rendered").not.toBeNull()
        expect(geometry.deck, "planner must remain rendered").not.toBeNull()
        expect(geometry.nav, "primary navigation must remain reachable").not.toBeNull()
        expect(geometry.horizontalOverflow, "Medium must not create horizontal overflow").toBe(false)
        expect(geometry.deckNavOverlap, "planner and persistent navigation must not overlap").toBe(0)
        expect(geometry.attributionNavOverlap, "map attribution must clear persistent navigation").toBe(0)
        expect(geometry.nativeControlsDeckOverlap, "native map controls must clear the planner").toBe(0)
        expect(geometry.mapUnobstructedShare, "at least half the viewport must remain usable map").toBeGreaterThanOrEqual(0.5)

        const deck = geometry.deck!
        expect(deck.left).toBeGreaterThanOrEqual(0)
        expect(deck.right).toBeLessThanOrEqual(viewport.width)
        expect(deck.bottom).toBeLessThanOrEqual(viewport.height)
      })
    }
  }

  test("three-route comparison previews without committing, preserves details identity, and keeps Start Ride reachable", async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 820, height: 1180 })
    await installPlannerServices(page)
    const capture = await installRouteApi(page, tripPlan([
      makeRoute("balanced", {
        id: "medium-balanced",
        name: "Balanced medium route",
        routeScoreTotal: 70
      }),
      makeRoute("twisty", {
        id: "medium-twisty",
        name: "Twisty medium route",
        geometry: [[-76.8867, 40.2732], [-76.91, 40.3], [-76.84, 40.28]],
        distanceMiles: 9.7,
        durationMinutes: 20,
        twistiness: 94,
        routeScoreTotal: 92
      }),
      makeRoute("scenic", {
        id: "medium-scenic",
        name: "Scenic medium route",
        geometry: [[-76.8867, 40.2732], [-76.87, 40.32], [-76.84, 40.28]],
        distanceMiles: 10.4,
        durationMinutes: 23,
        twistiness: 76,
        routeScoreTotal: 84
      })
    ]))

    await page.goto("/")
    await openPlannerEditor(page)
    await ensureFixtureStart(page)
    await fillFixtureFinish(page)
    await page.getByRole("button", { name: "Plan route" }).click()
    await expectRouteOutcome(page, capture)
    await settleMapDelay(page)
    await expectWorkspaceMode(page, "medium")

    const choices = page.getByRole("region", { name: "Route choices" })
    const routeButtons = choices.getByRole("button", { name: /^Select / })
    await expect(routeButtons).toHaveCount(3)

    const selectedBefore = choices.locator('button[aria-label^="Select "][aria-pressed="true"]').first()
    const alternate = choices.locator('button[aria-label^="Select "][aria-pressed="false"]').first()
    await expect(selectedBefore).toBeVisible()
    await expect(alternate).toBeVisible()
    const selectedBeforeLabel = await selectedBefore.getAttribute("aria-label")
    const alternateLabel = await alternate.getAttribute("aria-label")
    expect(selectedBeforeLabel).toBeTruthy()
    expect(alternateLabel).toBeTruthy()

    // State-filtered Playwright locators are live. Capture stable accessible-name
    // locators before selection changes aria-pressed so the post-click assertion
    // follows the route the rider actually clicked instead of re-resolving to the
    // next unselected route.
    const selectedBeforeStable = choices.getByRole("button", { name: selectedBeforeLabel!, exact: true })
    const alternateStable = choices.getByRole("button", { name: alternateLabel!, exact: true })

    // Pointer/focus are preview-only contracts. They may change the map ribbon,
    // but canonical selection must remain untouched until the rider clicks.
    await alternateStable.hover()
    await expect(selectedBeforeStable).toHaveAttribute("aria-pressed", "true")
    await expect(alternateStable).toHaveAttribute("aria-pressed", "false")
    await alternateStable.focus()
    await expect(selectedBeforeStable).toHaveAttribute("aria-pressed", "true")
    await expect(alternateStable).toHaveAttribute("aria-pressed", "false")

    await alternateStable.click()
    await expect(alternateStable).toHaveAttribute("aria-pressed", "true")
    await expect(selectedBeforeStable).toHaveAttribute("aria-pressed", "false")
    const selectedRouteName = (alternateLabel ?? "").replace(/^Select /, "")
    expect(selectedRouteName).not.toBe("")
    // The rail is not the rendering authority: prove the live MapLibre route
    // source now marks exactly the clicked route as selected.
    const selectedRouteId = MEDIUM_ROUTE_IDS[selectedRouteName]
    expect(selectedRouteId, `fixture route id for ${selectedRouteName}`).toBeTruthy()
    await expect.poll(() => selectedMapRouteIds(page), { timeout: 10_000 }).toEqual([selectedRouteId])
    // Start Ride is scoped to the committed route, not a generic button.
    await expect(page.getByRole("button", { name: /^Start .* route$/i }).first()).toBeVisible()
    await expect(page.getByRole("region", { name: "Route choices" })
      .getByRole("button", { name: `Select ${selectedRouteName}`, exact: true })).toHaveAttribute("aria-pressed", "true")

    await page.getByRole("button", { name: `Details for ${selectedRouteName}`, exact: true }).click()
    await expect(page.getByRole("button", { name: "Back to route choices" })).toBeVisible()
    await expect(page.getByText("Selected route")).toBeVisible()
    await page.getByRole("button", { name: "Back to route choices" }).click()

    const restoredSelection = page.getByRole("button", { name: `Select ${selectedRouteName}`, exact: true })
    await expect(restoredSelection).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: /^Start .* route$/i }).first()).toBeVisible()
  })

  for (const viewport of [
    { width: 768, height: 1024, label: "768x1024 portrait" },
    { width: 1024, height: 768, label: "1024x768 landscape" }
  ] as const) {
    test(`${viewport.label} keeps the Curve status and long planner notices clear of every Medium surface`, async ({ page }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await installPlannerServices(page)
      // Hold curvature so the loading status stays on screen while it is measured.
      await page.route("**/api/curvature**", () => new Promise<void>(() => undefined))
      // A missing Open-saved-copy deep link raises a real planner notice.
      await page.goto("/?savedRoute=medium-missing-ride")
      await expectWorkspaceMode(page, "medium")

      const curve = page.locator(".map-layer-status", { hasText: "Loading curve overlay" })
      const notice = page.locator(".app-notice", { hasText: "no longer in My Rides" })
      await expect(page.locator(".map-layer-control").first()).toBeVisible()
      await expect(curve).toBeVisible({ timeout: 20_000 })
      await expect(notice).toBeVisible()
      await settleMapDelay(page)

      const curveOverlap = await overlayOverlap(page, ".map-layer-control", ".map-layer-status")
      expect(curveOverlap.first, "Layers control must render").not.toBeNull()
      expect(curveOverlap.second, "Curve status must render").not.toBeNull()
      expect(curveOverlap.area, "Curve status must not cover the Layers control").toBe(0)

      // Warnings vary in length (import and provider errors run long); stress the
      // live notice with long copy instead of relying on today's short message.
      await notice.locator("span").first().evaluate((node) => {
        node.textContent = "This route file could not be imported because its track segments were empty or malformed; export it again from the source app and retry."
      })
      for (const surface of [
        ".planner-deck",
        ".app-navigation",
        ".map-layer-control",
        ".map-layer-status",
        ".maplibregl-ctrl-group, .mapboxgl-ctrl-group",
        ".maplibregl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-left"
      ]) {
        const overlap = await overlayOverlap(page, surface, ".app-notice")
        expect(overlap.second, "planner notice must render").not.toBeNull()
        expect(overlap.area, `long planner notice must not cover ${surface}`).toBe(0)
      }
      const box = (await page.locator(".app-notice").first().boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    })
  }

  test("768x1024 offline pack stays viewport-contained with its Save action reachable", async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 768, height: 1024 })
    await uxState.routeSelected(page)
    await page.getByRole("button", { name: "Edit route", exact: true }).click()
    await expect(page.getByRole("button", { name: "Offline pack", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Offline pack", exact: true }).click()

    const dialog = page.getByRole("dialog", { name: /^Offline pack for / })
    const scrim = page.locator(".offline-pack-modal-scrim")
    const save = page.getByRole("button", { name: "Save offline pack", exact: true })
    await expect(dialog).toBeVisible()
    await expect(save).toBeVisible()

    const scrimBox = await scrim.boundingBox()
    const dialogBox = await dialog.boundingBox()
    const saveBox = await save.boundingBox()
    expect(scrimBox, "offline confirmation scrim must render").not.toBeNull()
    expect(dialogBox, "offline confirmation must render").not.toBeNull()
    expect(saveBox, "offline Save action must render").not.toBeNull()

    expect(scrimBox!.x).toBeLessThanOrEqual(1)
    expect(scrimBox!.y).toBeLessThanOrEqual(1)
    expect(scrimBox!.width).toBeGreaterThanOrEqual(766)
    expect(scrimBox!.height).toBeGreaterThanOrEqual(1022)
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(768)
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(1024)
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(1024)
  })

  test("timed loop reaches a route without leaving the Medium workspace", async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 1180, height: 820 })
    await installPlannerServices(page)
    const capture = await installRouteApi(page, tripPlan([
      makeRoute("twisty", {
        id: "medium-two-hour-loop",
        name: "Medium two-hour loop",
        geometry: [
          [-76.8867, 40.2732],
          [-76.84, 40.31],
          [-76.8, 40.27],
          [-76.8867, 40.2732]
        ],
        distanceMiles: 42.1,
        durationMinutes: 120
      })
    ]))

    await page.goto("/")
    await openPlannerEditor(page)
    await ensureFixtureStart(page)
    await page.getByRole("button", { name: "Loop" }).click()
    await page.getByRole("button", { name: "Plan a 2-hour loop" }).click()
    await expectRouteOutcome(page, capture)
    await settleMapDelay(page)
    await expectWorkspaceMode(page, "medium")

    expect(capture.requests[0]).toMatchObject({
      roundTrip: { targetMinutes: 120 },
      points: [{ lat: 40.2732, lon: -76.8867 }]
    })
    const geometry = await measure(page)
    expect(geometry.horizontalOverflow).toBe(false)
    expect(geometry.map).not.toBeNull()
    expect(geometry.deck).not.toBeNull()
    expect(geometry.mapUnobstructedShare).toBeGreaterThanOrEqual(0.5)
    await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible()
  })

  test("resize across compact/medium preserves the selected route and live map while moving attribution", async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 760, height: 844 })
    await uxState.routeSelected(page)
    await settleMapDelay(page)
    await expectWorkspaceMode(page, "compact")

    const selectedRoute = page.getByRole("button", { name: /^Select / }).first()
    const startRide = page.getByRole("button", { name: /^Start .* route$/i }).first()
    await expect(selectedRoute).toHaveAttribute("aria-pressed", "true")
    await expect(startRide).toBeVisible()
    expect(await attributionCorner(page)).toMatch(/(?:maplibregl|mapboxgl)-ctrl-bottom-left/)

    const mapCanvas = page.locator(".maplibregl-canvas, .mapboxgl-canvas").first()
    await expect(mapCanvas).toBeAttached()
    await mapCanvas.evaluate((node) => node.setAttribute("data-resize-sentinel", "same-map-canvas"))

    await page.setViewportSize({ width: 768, height: 1024 })
    await settleMapDelay(page)
    await expectWorkspaceMode(page, "medium")

    expect(await attributionCorner(page)).toMatch(/(?:maplibregl|mapboxgl)-ctrl-bottom-right/)
    await expect(page.locator('[data-resize-sentinel="same-map-canvas"]')).toBeAttached()
    await expect(page.getByRole("button", { name: /^Select / }).first()).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: /^Start .* route$/i }).first()).toBeVisible()
  })
})

test.describe("Adaptive workspace boundary regressions", () => {
  for (const viewport of REGRESSION_VIEWPORTS) {
    test(`${viewport.label} preserves the canonical ${viewport.mode} topology with a selected route`, async ({ page }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await uxState.routeSelected(page)
      await settleMapDelay(page)
      await expectWorkspaceMode(page, viewport.mode)

      const geometry = await measure(page)
      expect(geometry.map, `${viewport.label}: map must remain rendered`).not.toBeNull()
      expect(geometry.deck, `${viewport.label}: planner must remain rendered`).not.toBeNull()
      expect(geometry.horizontalOverflow, `${viewport.label}: no horizontal document overflow`).toBe(false)
      expect(geometry.mapUnobstructedShare, `${viewport.label}: some live map must remain materially visible`).toBeGreaterThan(0.15)
      await expect(page.getByRole("button", { name: /^Start .* route$/i }).first()).toBeVisible()

      const deck = geometry.deck!
      expect(deck.left).toBeGreaterThanOrEqual(-1)
      expect(deck.right).toBeLessThanOrEqual(viewport.width + 1)
      expect(deck.bottom).toBeLessThanOrEqual(viewport.height + 1)
    })
  }
})
