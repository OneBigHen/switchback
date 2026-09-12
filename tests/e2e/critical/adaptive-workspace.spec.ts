import { expect, test, type Page } from "@playwright/test"
import { settleMapDelay, uxState } from "../helpers/ux-state-fixtures"

const VIEWPORTS = [
  { width: 768, height: 1024, label: "768x1024 portrait" },
  { width: 820, height: 1180, label: "820x1180 portrait" },
  { width: 1024, height: 768, label: "1024x768 landscape" },
  { width: 1180, height: 820, label: "1180x820 landscape" }
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

async function attributionCorner(page: Page): Promise<string> {
  const attribution = page.locator(".maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib").first()
  await expect(attribution).toBeVisible()
  return attribution.evaluate((node) => node.parentElement?.className ?? "")
}

test.describe("Medium adaptive planner workspace", () => {
  for (const viewport of VIEWPORTS) {
    for (const state of STATES) {
      test(`${viewport.label} keeps ${state} map-first and collision free`, async ({ page }) => {
        test.setTimeout(150_000)
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await drive(page, state)
        await settleMapDelay(page)

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

  test("attribution follows the live compact/medium boundary after resize", async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 760, height: 844 })
    await uxState.home(page)
    await settleMapDelay(page)
    expect(await attributionCorner(page)).toMatch(/(?:maplibregl|mapboxgl)-ctrl-bottom-left/)

    await page.setViewportSize({ width: 768, height: 1024 })
    await settleMapDelay(page)
    expect(await attributionCorner(page)).toMatch(/(?:maplibregl|mapboxgl)-ctrl-bottom-right/)
  })
})
