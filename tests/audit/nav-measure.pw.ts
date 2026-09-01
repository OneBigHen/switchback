import { test, expect } from "@playwright/test"
import { installPlannerServices } from "../e2e/helpers/planner-fixtures"

const LANDSCAPES = [
  { id: "844x390", width: 844, height: 390 },
  { id: "740x360", width: 740, height: 360 },
  { id: "932x430", width: 932, height: 430 },
]

for (const vp of LANDSCAPES) {
  test(`nav geometry @ ${vp.id}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" })
    const page = await context.newPage()
    await installPlannerServices(page)
    await page.goto("/")
    await page.waitForTimeout(1200)
    const data = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>("nav.app-navigation")
      const brand = document.querySelector<HTMLElement>(".app-navigation-brand")
      const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) } }
      const buttons = Array.from(document.querySelectorAll<HTMLElement>(".app-navigation button")).map((b) => {
        const box = b.getBoundingClientRect()
        const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return {
          label: b.textContent?.trim().slice(0, 12) || b.getAttribute("aria-label"),
          ...r(b)!,
          overflows: box.right > window.innerWidth + 1 || box.left < -1 || box.bottom > window.innerHeight + 1 || box.top < -1,
          centerIsReachable: center === b || b.contains(center),
        }
      })
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        shell: r(document.querySelector<HTMLElement>(".planner-shell")),
        shellMinHeight: document.querySelector<HTMLElement>(".planner-shell")
          ? getComputedStyle(document.querySelector<HTMLElement>(".planner-shell")!).minHeight
          : null,
        nav: r(nav),
        navScrollH: nav?.scrollHeight,
        navClientH: nav?.clientHeight,
        brandVisible: brand ? getComputedStyle(brand).display !== "none" : null,
        brand: r(brand),
        buttons,
      }
    })
    console.log(`NAVGEO ${vp.id} ` + JSON.stringify(data, null, 2))

    expect(data.shell).not.toBeNull()
    expect(data.shellMinHeight).toBe("0px")
    expect(data.shell?.top).toBeGreaterThanOrEqual(0)
    expect(data.shell?.bottom).toBeLessThanOrEqual(vp.height + 1)
    expect(data.shell?.h).toBeGreaterThanOrEqual(vp.height - 1)
    expect(data.nav).not.toBeNull()
    expect(data.nav?.top).toBeGreaterThanOrEqual(0)
    expect(data.nav?.bottom).toBeLessThanOrEqual(vp.height + 1)
    expect(data.navScrollH).toBeLessThanOrEqual((data.navClientH ?? 0) + 1)
    expect(data.brandVisible).toBe(false)
    expect(data.buttons.map(({ label }) => label)).toEqual(["Plan", "Rides", "Discover", "Settings", "Record"])
    for (const button of data.buttons) {
      expect(button.w, `${button.label} width`).toBeGreaterThanOrEqual(44)
      expect(button.h, `${button.label} height`).toBeGreaterThanOrEqual(44)
      expect(button.overflows, `${button.label} must remain in the viewport`).toBe(false)
      expect(button.centerIsReachable, `${button.label} center must be hit-testable`).toBe(true)
    }
    await context.close()
  })
}
