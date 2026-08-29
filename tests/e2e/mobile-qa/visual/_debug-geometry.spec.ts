import { test as mobileQaTest, expect } from "../fixtures"
import { expandPhonePlanner } from "../fixtures"
import { uxState } from "../../helpers/ux-state-fixtures"
import { planFixtureRoute } from "../planner-mobile-states"

async function dump(page: import("@playwright/test").Page, label: string): Promise<void> {
  const metrics = await page.evaluate((label) => {
    const visible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element)
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
    }
    const box = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null
      const r = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { tag: element.tagName, cls: element.className, text: element.textContent?.trim().slice(0, 60), x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, position: style.position, overflow: style.overflow, z: style.zIndex }
    }
    const selectors = [".planner-deck", ".planner-scroll", ".planner-action-dock", ".app-navigation", ".route-rack", ".route-preparation", ".route-selection-identity", ".edit-route-button", ".profile-switch", ".ride-omnibox-section", ".library-drawer"]
    const controls = Array.from(document.querySelectorAll<HTMLElement>("button,input,select,a"))
      .filter(visible)
      .map((element) => {
        const r = element.getBoundingClientRect()
        const center = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        let clip: ReturnType<typeof box> = null
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (/(hidden|clip|scroll|auto)/.test(getComputedStyle(parent).overflow)) { clip = box(parent); if (r.top < (parent.getBoundingClientRect().top - 1) || r.bottom > (parent.getBoundingClientRect().bottom + 1) || r.left < (parent.getBoundingClientRect().left - 1) || r.right > (parent.getBoundingClientRect().right + 1)) break }
        }
        return { label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 60), box: box(element), centerHit: center ? { tag: center.tagName, cls: center.className, same: center === element || element.contains(center) || center.contains(element) } : null, clip }
      })
    return {
      label,
      viewport: { innerWidth: innerWidth, innerHeight: innerHeight, visualWidth: visualViewport?.width, visualHeight: visualViewport?.height, visualTop: visualViewport?.offsetTop, visualLeft: visualViewport?.offsetLeft },
      nodes: Object.fromEntries(selectors.map((selector) => [selector, box(document.querySelector(selector))])),
      controls,
      scrolls: Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => { const style = getComputedStyle(element); return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1 }).map((element) => ({ box: box(element), scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }))
    }
  }, label)
  console.log(JSON.stringify(metrics, null, 2))
  expect(metrics.viewport.innerWidth).toBeGreaterThan(0)
}

mobileQaTest.describe.configure({ mode: "serial" })

mobileQaTest("debug 390 home and prepare geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await uxState.home(page)
  await expandPhonePlanner(page)
  await dump(page, "home-expanded-390")
  await uxState.routeDetail(page)
  await dump(page, "prepare-detail-390")
  await planFixtureRoute(page)
  await page.getByRole("button", { name: "Show route details" }).tap()
  await dump(page, "prepare-planned-390")
})

mobileQaTest("debug 375 home geometry", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await uxState.home(page)
  await expandPhonePlanner(page)
  await dump(page, "home-expanded-375")
})
