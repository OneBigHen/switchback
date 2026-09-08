import { expect, test } from "@playwright/test"
import { pinVisualClock, settleMapDelay, uxState } from "../helpers/ux-state-fixtures"

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
