import { expect, test } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import {
  ensureFixtureStart,
  fillFixtureFinish,
  installPlannerServices,
  installRouteApi,
  openPlannerEditor
} from "./helpers/planner-fixtures"

interface BrowserMemorySample {
  cycle: number
  usedJSHeapSize: number | null
  totalJSHeapSize: number | null
  mapInstances: number
}

async function sampleBrowserMemory(page: import("@playwright/test").Page, cycle: number): Promise<BrowserMemorySample> {
  return page.evaluate((sampleCycle) => {
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number }
    }).memory
    return {
      cycle: sampleCycle,
      usedJSHeapSize: typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null,
      totalJSHeapSize: typeof memory?.totalJSHeapSize === "number" ? memory.totalJSHeapSize : null,
      mapInstances: document.querySelectorAll(".maplibregl-map").length
    }
  }, cycle)
}

test("10 planner cycles keep measurable browser resources bounded", async ({ page }) => {
  test.setTimeout(300_000)
  await installPlannerServices(page)
  await installRouteApi(page)
  await page.goto("/")

  const samples: BrowserMemorySample[] = []
  const cycleCount = Number(process.env.SWITCHBACK_MEMORY_SOAK_CYCLES ?? 10)
  for (let cycle = 1; cycle <= cycleCount; cycle += 1) {
    console.log(`memory-soak cycle ${cycle}/${cycleCount}: open V2 route editor`)
    await openPlannerEditor(page)
    await ensureFixtureStart(page)
    await fillFixtureFinish(page)

    console.log(`memory-soak cycle ${cycle}/${cycleCount}: plan`)
    const planRoute = page.getByRole("button", { name: "Plan route" })
    await expect(planRoute).toBeEnabled()
    await planRoute.click()

    console.log(`memory-soak cycle ${cycle}/${cycleCount}: wait result`)
    await expect(page.getByRole("region", { name: "Route choices" })).toBeVisible({ timeout: 30_000 })
    samples.push(await sampleBrowserMemory(page, cycle))

    console.log(`memory-soak cycle ${cycle}/${cycleCount}: clear`)
    const clearRoute = page.getByRole("button", { name: "Clear route" })
    await expect(clearRoute).toBeVisible({ timeout: 15_000 })
    await clearRoute.click()
    await expect(page.getByRole("region", { name: "Route choices" })).toBeHidden({ timeout: 15_000 })
  }

  const measured = samples.filter((sample): sample is BrowserMemorySample & { usedJSHeapSize: number } => sample.usedJSHeapSize != null)
  if (measured.length >= 2) {
    const baseline = measured[0]!.usedJSHeapSize
    const settled = measured.at(-1)!.usedJSHeapSize
    expect(settled).toBeLessThanOrEqual(Math.max(baseline * 1.2, baseline + 10 * 1024 * 1024))
  }
  if (samples.length > 0) expect(new Set(samples.map((sample) => sample.mapInstances))).toEqual(new Set([1]))

  await writeFile("artifacts/quality/memory-soak.json", `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    scenario: "planner-cycle-v2",
    cycles: samples
  }, null, 2)}\n`)
})
