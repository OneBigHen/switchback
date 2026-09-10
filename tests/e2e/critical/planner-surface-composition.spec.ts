import { expect, test } from "@playwright/test"
import { pinVisualClock, settleMapDelay, uxState } from "../helpers/ux-state-fixtures"
import { ensureFixtureStart, fillFixtureFinish, installPlannerServices, openPlannerEditor } from "../helpers/planner-fixtures"

/**
 * The action dock and the planner scroll have collided in both directions:
 * the dock has covered the last control, and the scroll has reserved a whole
 * dock height on top of an in-flow dock and left a blank band under the last
 * control. Assert the composition instead of the CSS text, so either failure
 * is caught wherever the layout rules end up living.
 */
const VIEWPORTS = [
  { name: "320x568 narrow phone", width: 320, height: 568 },
  { name: "390x844 phone", width: 390, height: 844 },
  { name: "430x932 phone", width: 430, height: 932 },
  { name: "667x375 short landscape", width: 667, height: 375 },
  { name: "568x320 short landscape", width: 568, height: 320 }
] as const

for (const viewport of VIEWPORTS) {
  test(`prepare dock and planner scroll share the sheet cleanly at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await pinVisualClock(page)
    await uxState.routeSelected(page)
    await settleMapDelay(page)

    const geometry = await page.evaluate(async () => {
      const scroll = document.querySelector<HTMLElement>(".planner-scroll")
      const dock = document.querySelector<HTMLElement>(".planner-action-dock")
      if (!scroll || !dock) return null
      scroll.scrollTop = scroll.scrollHeight
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const lastChild = [...scroll.children]
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .filter((child) => child.getBoundingClientRect().height > 0)
        .pop()
      if (!lastChild) return null
      const scrollBox = scroll.getBoundingClientRect()
      const dockBox = dock.getBoundingClientRect()
      const lastBox = lastChild.getBoundingClientRect()
      return {
        reachedEnd: scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 1,
        lastContentBottom: Math.round(lastBox.bottom),
        scrollBottom: Math.round(scrollBox.bottom),
        dockTop: Math.round(dockBox.top),
        dockBottom: Math.round(dockBox.bottom),
        viewportHeight: window.innerHeight
      }
    })

    expect(geometry, "planner scroll and action dock are both present").not.toBeNull()
    const { reachedEnd, lastContentBottom, scrollBottom, dockTop, dockBottom, viewportHeight } = geometry!

    expect(reachedEnd, "the planner scroll reaches its own end").toBe(true)
    expect(lastContentBottom, "the last control is not cut off by the scroll edge").toBeLessThanOrEqual(scrollBottom + 1)
    expect(scrollBottom, "the dock does not overlap the scroll owner").toBeLessThanOrEqual(dockTop + 1)
    expect(dockBottom, "the primary action stays on screen").toBeLessThanOrEqual(viewportHeight + 1)
    expect(
      scrollBottom - lastContentBottom,
      "no dock-sized blank band is reserved under the last control"
    ).toBeLessThan(48)

    const start = page.getByRole("button", { name: /^Start .* route$/i }).first()
    await expect(start).toBeVisible()
    const startBox = await start.boundingBox()
    expect(startBox, "the Start CTA has a box").not.toBeNull()
    expect(startBox!.height, "the Start CTA keeps a touch-sized target").toBeGreaterThanOrEqual(44)
    expect(startBox!.y + startBox!.height, "the Start CTA is fully on screen").toBeLessThanOrEqual(viewportHeight + 1)
  })
}

test("short landscape route selection keeps the ride card and actions reachable at 667x375", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await pinVisualClock(page)
  await uxState.routeSelected(page)
  await settleMapDelay(page)

  const geometry = await page.evaluate(async () => {
    const scroll = document.querySelector<HTMLElement>(".planner-scroll")
    const sheet = document.querySelector<HTMLElement>("#planner-sheet")
    const dock = document.querySelector<HTMLElement>(".planner-action-dock")
    const routeChoices = document.querySelector<HTMLElement>("[aria-label='Route choices']")
    const rideSummary = document.querySelector<HTMLElement>("[aria-label='Your ride']")
    if (!scroll || !sheet || !dock || !routeChoices || !rideSummary) return null
    const measureControl = (button: HTMLElement) => {
      const box = button.getBoundingClientRect()
      const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return {
        label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
        top: box.top,
        bottom: box.bottom,
        reachable: center === button || button.contains(center),
      }
    }
    const initialScroll = scroll.scrollTop
    const initialScrollBox = scroll.getBoundingClientRect()
    const selection = routeChoices.querySelector<HTMLElement>("button[aria-label^='Select ']")
    if (!selection) return null
    const initialSelection = measureControl(selection)

    scroll.scrollTop = scroll.scrollHeight
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const sheetBox = sheet.getBoundingClientRect()
    const scrollBox = scroll.getBoundingClientRect()
    const dockBox = dock.getBoundingClientRect()
    const summaryBox = rideSummary.getBoundingClientRect()
    const finalControls = [
      ...rideSummary.querySelectorAll<HTMLElement>("button"),
      ...dock.querySelectorAll<HTMLElement>("button"),
    ]
      .filter((button) => getComputedStyle(button).display !== "none")
      .map(measureControl)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sheet: { top: sheetBox.top, bottom: sheetBox.bottom },
      initial: { scrollTop: initialScroll, scrollTopEdge: initialScrollBox.top, selection: initialSelection },
      scroll: { top: scrollBox.top, bottom: scrollBox.bottom, scrollTop: scroll.scrollTop, max: scroll.scrollHeight - scroll.clientHeight },
      dock: { top: dockBox.top, bottom: dockBox.bottom },
      summary: { top: summaryBox.top, bottom: summaryBox.bottom },
      finalControls,
    }
  })

  expect(geometry, "short-landscape planner geometry exists").not.toBeNull()
  expect(geometry!.initial.selection.top, "route selection must start inside the scroll viewport").toBeGreaterThanOrEqual(geometry!.initial.scrollTopEdge - 1)
  expect(geometry!.initial.selection.reachable, "route selection must not be occluded").toBe(true)
  expect(geometry!.scroll.scrollTop).toBeGreaterThan(geometry!.initial.scrollTop)
  expect(geometry!.scroll.scrollTop).toBeGreaterThanOrEqual(geometry!.scroll.max - 1)
  expect(geometry!.summary.bottom).toBeLessThanOrEqual(geometry!.scroll.bottom + 1)
  expect(geometry!.dock.bottom).toBeLessThanOrEqual(geometry!.viewport.height + 1)
  expect(geometry!.finalControls.length).toBeGreaterThan(0)
  for (const control of geometry!.finalControls) {
    expect(control.top, `${control.label} must be within the scroll viewport`).toBeGreaterThanOrEqual(geometry!.scroll.top - 1)
    expect(control.bottom, `${control.label} must be within the scroll viewport`).toBeLessThanOrEqual(geometry!.scroll.bottom + 1)
    expect(control.reachable, `${control.label} must not be occluded`).toBe(true)
  }
})

/**
 * Map layer banners used to position themselves individually, so two at once
 * landed on identical coordinates and rendered on top of each other; the
 * phone placement also sat directly on the Layers button, and the desktop
 * placement was centred on the viewport rather than on the map, so the deck
 * painted over the start of every message. Assert the composed result.
 */
const BANNER_VIEWPORTS = [
  { name: "320x568 narrow phone", width: 320, height: 568 },
  { name: "390x844 phone", width: 390, height: 844 },
  { name: "568x320 short landscape", width: 568, height: 320 },
  { name: "1440x900 desktop", width: 1440, height: 900 }
] as const

for (const viewport of BANNER_VIEWPORTS) {
  test(`map layer banners queue clear of every other surface at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await pinVisualClock(page)
    await uxState.home(page)
    await settleMapDelay(page)

    const result = await page.evaluate(() => {
      const stack = document.querySelector<HTMLElement>(".map-layer-status-stack")
      if (!stack) return null
      // Append only; never clear. React owns this container's children and
      // removing them makes reconciliation throw on the next render.
      const probes = ["Loading curve overlay…", "Loading PA DEP/PASDA — Unpaved Roads 2009_07 survey…"].map((text) => {
        const banner = document.createElement("div")
        banner.className = "map-layer-status"
        banner.textContent = text
        stack.append(banner)
        return banner
      })
      const banners = probes.map((el) => el.getBoundingClientRect())
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const others = [".map-layer-control", ".mapboxgl-ctrl-top-right", ".maplibregl-ctrl-top-right", ".sb-bottom-sheet", ".planner-deck"]
        .map((selector) => ({ selector, element: document.querySelector<HTMLElement>(selector) }))
        .filter((entry): entry is { selector: string; element: HTMLElement } => entry.element !== null)
      const measured = {
        stacked: banners.length === 2 && !overlaps(banners[0], banners[1]),
        withinViewport: banners.every((box) => box.left >= -1 && box.right <= window.innerWidth + 1),
        collisions: others
          .filter((entry) => banners.some((box) => overlaps(box, entry.element.getBoundingClientRect())))
          .map((entry) => entry.selector)
      }
      for (const probe of probes) probe.remove()
      return measured
    })

    expect(result, "the map layer banner stack exists").not.toBeNull()
    expect(result!.stacked, "simultaneous banners queue instead of overlapping").toBe(true)
    expect(result!.withinViewport, "banners stay inside the viewport").toBe(true)
    expect(result!.collisions, "banners clear the map controls, layer control and planner surfaces").toEqual([])
  })
}

/**
 * A failed route request renders its explanation below the expanded Ride
 * options panel. Without help that lands roughly a thousand pixels under the
 * fold, so tapping Plan route and having it fail looked like nothing happened.
 */
test("a failed route plan shows the rider why, without hunting for it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await pinVisualClock(page)
  await installPlannerServices(page)
  await page.goto("/")
  await openPlannerEditor(page)
  await ensureFixtureStart(page)
  await fillFixtureFinish(page)
  await page.route("**/api/routes", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Routing provider unavailable" })
    })
  })
  await page.getByRole("button", { name: "Plan route" }).click()

  const alert = page.getByRole("alert").filter({ hasText: "Route unavailable" })
  await expect(alert).toBeVisible()
  await expect(alert).toBeInViewport()

  // The deck settles into place (the sheet carries a 220ms transition, and the
  // planner scrolls its result surface into view on a rAF), so a single
  // instantaneous measurement can sample a layout that is still moving — this
  // read flaked exactly that way under WebKit. Poll the same geometry instead
  // of asserting a lone sample: the contract is unchanged, it just has to hold
  // once the surface has come to rest.
  await expect.poll(() => alert.evaluate((node) => {
    const scroll = node.closest<HTMLElement>(".planner-scroll")
    if (!scroll) return false
    const box = node.getBoundingClientRect()
    const scrollBox = scroll.getBoundingClientRect()
    return box.top >= scrollBox.top - 1 && box.bottom <= scrollBox.bottom + 1
  }), "the failure explanation is inside the planner scroll viewport").toBe(true)
})

/**
 * Draw mode has no sheet, so the sketch toolbar, the instruction banner, the
 * layer control, the native map controls and the credit/scale stack all share
 * one empty map. Keeping the command labels below 360px costs the toolbar an
 * extra row, and every one of those neighbours has to move out of its way.
 */
const DRAW_VIEWPORTS = [
  { name: "320x568 narrow phone", width: 320, height: 568 },
  { name: "390x844 phone", width: 390, height: 844 },
  { name: "430x932 phone", width: 430, height: 932 }
] as const

for (const viewport of DRAW_VIEWPORTS) {
  test(`draw controls stay labelled and clear of the map furniture at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await pinVisualClock(page)
    await uxState.home(page)
    await page.getByRole("button", { name: "Draw route" }).click()
    await expect(page.getByRole("toolbar", { name: "Draw route controls" })).toBeVisible()
    await settleMapDelay(page)

    const result = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".map-sketch-toolbar")
      if (!toolbar) return null
      const box = toolbar.getBoundingClientRect()
      const overlaps = (other: DOMRect) =>
        box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom
      const collisions = [
        ".map-sketch-instructions",
        ".map-layer-control",
        ".maplibregl-ctrl-bottom-left",
        ".mapboxgl-ctrl-bottom-left",
        ".maplibregl-ctrl-bottom-right",
        ".mapboxgl-ctrl-bottom-right"
      ]
        .map((selector) => ({ selector, element: document.querySelector<HTMLElement>(selector) }))
        .filter((entry): entry is { selector: string; element: HTMLElement } =>
          entry.element !== null && entry.element.getBoundingClientRect().height > 0)
        .filter((entry) => overlaps(entry.element.getBoundingClientRect()))
        .map((entry) => entry.selector)
      const unlabelled = [...toolbar.querySelectorAll("button")]
        .filter((button) => {
          const span = button.querySelector("span")
          if (!span) return true
          const style = getComputedStyle(span)
          return style.position === "absolute" || style.width === "1px"
        })
        .map((button) => button.getAttribute("aria-label") ?? "")
      return {
        onScreen: box.top >= 0 && box.bottom <= window.innerHeight + 1,
        collisions,
        unlabelled
      }
    })

    expect(result, "the sketch toolbar is present").not.toBeNull()
    expect(result!.onScreen, "the whole sketch toolbar is on screen").toBe(true)
    expect(result!.collisions, "the sketch toolbar clears the banner, layer control and map controls").toEqual([])
    expect(result!.unlabelled, "every draw command keeps a visible label").toEqual([])
  })
}
