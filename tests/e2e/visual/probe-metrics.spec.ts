import { test } from "@playwright/test"
import { installPlannerServices } from "../helpers/planner-fixtures"
import { pinVisualClock } from "../helpers/ux-state-fixtures"

test.describe("probe-mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test("metrics", async ({ page }) => { await run(page) })
})
test.describe("probe-phone-landscape", () => {
  test.use({ viewport: { width: 844, height: 390 } })
  test("metrics", async ({ page }) => { await run(page) })
})

async function run(page: import("@playwright/test").Page): Promise<void> {
  await pinVisualClock(page)
  await installPlannerServices(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("main", { name: "Settings destination" }).waitFor({ state: "visible" })
  await page.waitForTimeout(250)
  const metrics = await page.evaluate(() => {
    const pick = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, lh: cs.lineHeight, ff: cs.fontFamily.slice(0, 60) }
    }
    const fontsLoaded = document.fonts ? document.fonts.status : "unavailable"
    return {
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: devicePixelRatio,
      ua: navigator.userAgent.slice(0, 80),
      fontsLoaded,
      heading: pick("main h1"),
      para: pick("main p"),
      h2: pick("main h2")
    }
  })
  console.log("METRICS " + JSON.stringify(metrics))
}
