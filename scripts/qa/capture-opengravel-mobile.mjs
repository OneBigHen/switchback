#!/usr/bin/env node
/**
 * Capture the four approved OpenGravel mobile states at their target viewport.
 *
 * This is acceptance evidence, not a gate: it drives a running instance and
 * writes PNGs for side-by-side review against the approved references in
 * `docs/design/opengravel-mobile/reference/`.
 *
 *   npx next dev --port 3210 &
 *   node scripts/qa/capture-opengravel-mobile.mjs
 *
 * Environment:
 *   SHOT_BASE    base URL (default http://127.0.0.1:3210)
 *   SHOT_OUT     output directory (default artifacts/opengravel-mobile)
 *   SHOT_W/SHOT_H  viewport (default 390x844, the approved phone target)
 *   SHOT_SUFFIX  filename suffix, for capturing a second viewport
 */
import { chromium, devices } from "@playwright/test"
import { mkdir } from "node:fs/promises"

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3210"
const OUT = process.env.SHOT_OUT ?? "artifacts/opengravel-mobile"
const VIEWPORT = {
  width: Number(process.env.SHOT_W ?? 390),
  height: Number(process.env.SHOT_H ?? 844)
}
const SUFFIX = process.env.SHOT_SUFFIX ?? ""

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  ...devices["iPhone 14"],
  viewport: VIEWPORT,
  screen: VIEWPORT,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  locale: "en-US",
  timezoneId: "America/New_York",
  geolocation: { latitude: 40.2732, longitude: -76.8867 },
  permissions: ["geolocation"],
  serviceWorkers: "block"
})

const page = await context.newPage()
const errors = []
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`[console] ${message.text()}`)
})
page.on("pageerror", (error) => errors.push(`[pageerror] ${error.message}`))

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}${SUFFIX}.png` })
  console.log(`captured ${name}${SUFFIX}`)
}

// Route previews are rendered one at a time by a single shared map, so these
// waits are deliberately generous: the screenshots are meant to show the
// finished state, not the loading one.
const settle = (ms) => page.waitForTimeout(ms)

// 1 — Planner, normal "To" planning state.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
await page.getByRole("button", { name: "Plan", exact: true }).first().waitFor({ timeout: 30_000 })
await settle(6_000)
await shot("01-planner")

const sheetBox = await page.locator("#planner-sheet").boundingBox()
console.log("planner sheet:", JSON.stringify(sheetBox))
console.log("map visible:", sheetBox
  ? `${Math.round(sheetBox.y)}px (${Math.round((sheetBox.y / VIEWPORT.height) * 100)}% of viewport)`
  : "n/a")

// 2 — Explore, map mode with a selected route and the card rail.
await page.goto(`${BASE}/?tab=explore`, { waitUntil: "domcontentloaded" })
await page.getByRole("heading", { name: "Explore routes" }).waitFor({ timeout: 30_000 })
await settle(20_000)
const firstCard = page.locator("[data-route-card] button").first()
if (await firstCard.count()) {
  await firstCard.click()
  await settle(4_000)
}
await shot("02-explore-map")

// 3 — GPX Library, list mode.
await page.goto(`${BASE}/gpx-library`, { waitUntil: "domcontentloaded" })
await page.getByRole("heading", { name: "GPX Library" }).waitFor({ timeout: 30_000 })

// Previews are rendered one at a time by a single shared map, so wait for the
// cards that are actually on screen to finish rather than guessing a duration.
// The state is reported either way: a capture full of fallback plates is
// evidence about the renderer, not about the design.
const previewStates = async () => page.evaluate(() =>
  [...document.querySelectorAll("[data-route-preview]")]
    .slice(0, 4)
    .map((node) => node.getAttribute("data-route-preview")))
const deadline = Date.now() + 45_000
let states = await previewStates()
while (Date.now() < deadline && states.some((state) => state === "pending")) {
  await settle(1_000)
  states = await previewStates()
}
console.log("first four preview states:", states.join(", "))
await settle(1_500)
await shot("03-gpx-library-list")

// 4 — Route details.
const detailHref = await page.locator("a[href^='/gpx-library/']").first().getAttribute("href")
await page.goto(`${BASE}${detailHref ?? "/gpx-library"}`, { waitUntil: "domcontentloaded" })
await page.getByRole("heading", { name: "Route details" }).waitFor({ timeout: 30_000 })
await settle(12_000)
await shot("04-route-details")

console.log(errors.length === 0 ? "NO CONSOLE ERRORS" : `CONSOLE ERRORS (${errors.length}):`)
for (const error of [...new Set(errors)].slice(0, 25)) console.log("  " + error)

await browser.close()
