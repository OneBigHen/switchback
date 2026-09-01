import { expect, test } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { installPlannerServices } from "../e2e/helpers/planner-fixtures"

const VIEWPORTS = [
  { id: "320", width: 320, height: 568, touch: true },
  { id: "390x844", width: 390, height: 844, touch: true },
  { id: "landscape", width: 844, height: 390, touch: true },
  { id: "tablet", width: 768, height: 1024, touch: true },
  { id: "1440x900", width: 1440, height: 900, touch: false },
] as const

const OUT = "artifacts/audit"

/** Collect every defect class the release handoff names, in one pass. */
async function audit(page: import("@playwright/test").Page, surface: string, vp: string, touch: boolean) {
  return await page.evaluate(({ surface, vp, touch }) => {
    const problems: string[] = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    const name = (el: Element) =>
      el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 32) || el.tagName.toLowerCase()

    // horizontal overflow of the document
    const de = document.documentElement
    if (de.scrollWidth > vw + 1) problems.push(`document scrolls horizontally (${de.scrollWidth} > ${vw})`)

    // interactive controls: size + containment
    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex='-1'])")
    )
    for (const el of interactive) {
      const s = getComputedStyle(el)
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      // fully offscreen elements are not this pass's concern
      if (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh) continue
      const tag = el.tagName.toLowerCase()
      const isTextInput = tag === "input" || tag === "select" || tag === "textarea"
      if (!isTextInput && (r.width < 44 || r.height < 44)) {
        problems.push(`TOUCH  ${name(el)} is ${Math.round(r.width)}x${Math.round(r.height)} (<44px)`)
      }
      // A control inside a deliberate horizontal scroller (filter chip rows)
      // is reachable by scrolling, so crossing the viewport edge is by design.
      const inHorizontalScroller = (() => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const as = getComputedStyle(a)
          if (/(auto|scroll|overlay)/.test(as.overflowX) && a.scrollWidth > a.clientWidth + 1) return true
        }
        return false
      })()
      if (!inHorizontalScroller && (r.left < -1 || r.right > vw + 1)) {
        problems.push(`BOUNDS ${name(el)} crosses the viewport horizontally`)
      }
      // iOS zooms any focused control under 16px — only on touch devices.
      if (touch && isTextInput && parseFloat(s.fontSize) < 16) {
        problems.push(`ZOOM   ${name(el)} font-size ${s.fontSize} (<16px triggers iOS zoom)`)
      }
    }

    // fixed/sticky chrome must stay inside the viewport
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const s = getComputedStyle(el)
      if (s.position !== "fixed" && s.position !== "sticky") continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        problems.push(`FIXED  ${s.position} ${name(el)} leaves the viewport`)
      }
    }

    // only one modal may be active at a time
    const modals = Array.from(document.querySelectorAll("[aria-modal='true']")).filter((el) => {
      const s = getComputedStyle(el as HTMLElement)
      return s.display !== "none" && s.visibility !== "hidden"
    })
    if (modals.length > 1) problems.push(`MODAL  ${modals.length} aria-modal dialogs visible at once`)

    // Legibility floor from design/DESIGN-CONTRACT.md: micro-eyebrows are
    // Oswald 10-11px, so 10px is in-contract and anything under it is not.
    // Decorative nodes carry no text for a rider to read.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("p, li, small, span, strong"))) {
      const s = getComputedStyle(el)
      if (s.display === "none" || s.visibility === "hidden") continue
      if (el.closest("[aria-hidden='true']")) continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      if (parseFloat(s.fontSize) < 10) {
        problems.push(`TEXT   ${name(el)} font-size ${s.fontSize} (<10px contract floor)`)
      }
    }

    return { surface, vp, problems: Array.from(new Set(problems)) }
  }, { surface, vp, touch })
}

async function report(page: import("@playwright/test").Page, surface: string, vp: string, touch: boolean) {
  const result = await audit(page, surface, vp, touch)
  mkdirSync(path.join(OUT, "screenshots"), { recursive: true })
  await page.screenshot({ path: path.join(OUT, "screenshots", `${vp}-${surface}.png`), fullPage: false })
  const line = `\n### ${surface} @ ${vp}\n` + (result.problems.length === 0 ? "  clean\n" : result.problems.map((p) => `  ${p}`).join("\n") + "\n")
  writeFileSync(path.join(OUT, "findings.md"), line, { flag: "a" })
  console.log(line)
}

for (const vp of VIEWPORTS) {
  test(`responsive audit @ ${vp.id}`, async ({ browser }) => {
    test.setTimeout(120_000)
    // hasTouch drives pointer: coarse, which is the real condition under which
    // iOS Safari zooms an under-16px control. Auditing without it would report
    // desktop font sizes for phone and tablet.
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      geolocation: { latitude: 40.2732, longitude: -76.8867 },
      permissions: ["geolocation"],
      timezoneId: "America/New_York",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    })
    const page = await context.newPage()
    await installPlannerServices(page)

    await page.goto("/")
    await page.waitForTimeout(1200)
    await report(page, "plan-idle", vp.id, vp.touch)

    for (const [label, dest] of [["rides", "Rides"], ["settings", "Settings"], ["discover", "Discover"], ["plan", "Plan"]] as const) {
      const button = page.getByRole("button", { name: dest, exact: true }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 5000 }).catch(() => undefined)
        await page.waitForTimeout(700)
        await report(page, label, vp.id, vp.touch)
      }
    }

    const layers = page.getByRole("button", { name: /Open map layers|Layers/i }).first()
    if (await layers.isVisible().catch(() => false)) {
      await layers.click({ timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(600)
      await report(page, "layers", vp.id, vp.touch)
    }
    expect(true).toBe(true)
    await context.close()
  })
}
