import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import {
  isExpectedRouteWeatherAbort,
  expectNoConsoleErrors,
} from "../assertions"
import type { MobileQaRuntimeIssues } from "../assertions"
import { MOBILE_QA_DEVICES } from "../devices"

export async function expectMobileRuntimeContract(page: Page, projectName: string): Promise<void> {
  const device = MOBILE_QA_DEVICES.find((candidate) => candidate.id === projectName)
  expect(device, `unknown mobile QA project: ${projectName}`).toBeDefined()
  const viewport = page.viewportSize()
  expect(viewport).toEqual(device?.viewport)
  const runtime = await page.evaluate(() => {
    const visual = window.visualViewport
    const dynamicProbe = document.createElement("div")
    dynamicProbe.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:100dvh;pointer-events:none"
    document.body.append(dynamicProbe)
    const dynamicHeight = dynamicProbe.getBoundingClientRect().height
    dynamicProbe.remove()
    const safeTopProbe = document.createElement("div")
    safeTopProbe.style.cssText = "position:fixed;inset-block-start:env(safe-area-inset-top);left:0;width:1px;height:1px;pointer-events:none"
    const safeBottomProbe = document.createElement("div")
    safeBottomProbe.style.cssText = "position:fixed;inset-block-end:env(safe-area-inset-bottom);left:0;width:1px;height:1px;pointer-events:none"
    document.body.append(safeTopProbe, safeBottomProbe)
    const safeTopBox = safeTopProbe.getBoundingClientRect()
    const safeBottomBox = safeBottomProbe.getBoundingClientRect()
    safeTopProbe.remove()
    safeBottomProbe.remove()
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: visual?.width ?? null,
      visualHeight: visual?.height ?? null,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      maxTouchPoints: navigator.maxTouchPoints,
      hasTouchEvent: "ontouchstart" in window,
      orientationType: window.screen.orientation?.type ?? "",
      orientationAngle: window.screen.orientation?.angle ?? null,
      dynamicHeight,
      safeTop: safeTopBox.top,
      safeBottom: window.innerHeight - safeBottomBox.bottom,
    }
  })
  expect(typeof runtime.maxTouchPoints, "maxTouchPoints must be exposed by the browser").toBe("number")
  expect(runtime.hasTouchEvent || runtime.maxTouchPoints > 0, "runtime touch event capability").toBe(true)
  expect(runtime.visualWidth).toBe(runtime.innerWidth)
  expect(runtime.visualHeight).toBe(runtime.innerHeight)
  expect(runtime.screenWidth).toBe(runtime.innerWidth)
  expect(runtime.screenHeight).toBe(runtime.innerHeight)
  expect(Math.abs(runtime.dynamicHeight - runtime.innerHeight)).toBeLessThanOrEqual(1)
  expect(runtime.safeTop).toBeGreaterThanOrEqual(0)
  expect(runtime.safeBottom).toBeGreaterThanOrEqual(0)
  expect(runtime.orientationType).toContain(device?.orientation ?? "portrait")
  if (runtime.orientationAngle !== null) expect([0, 90, 180, 270]).toContain(runtime.orientationAngle)
}

export async function expectDockClearance(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".planner-action-dock")
    if (!dock) return { present: false, issues: [] as string[] }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const dockBox = dock.getBoundingClientRect()
    const issues: string[] = []
    if (dockBox.left < -1 || dockBox.right > viewport.width + 1 || dockBox.bottom > viewport.height + 1) issues.push("planner action dock leaves viewport")
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("button,a,input,select,textarea,[role=button]"))) {
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue
      const box = element.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0 || box.bottom < dockBox.top || box.top > dockBox.bottom) continue
      const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      if (center && !element.contains(center) && !center.contains(element)) issues.push(`${element.tagName.toLowerCase()} is occluded by dock`)
    }
    return { present: true, issues }
  })
  if (result.present) expect(result.issues, "planner dock must not occlude controls").toEqual([])
}

export async function expectNoNestedScrollTrap(page: Page): Promise<void> {
  const traps = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
    const style = getComputedStyle(element)
    if (!/(auto|scroll|overlay)/.test(style.overflowY) || element.scrollHeight <= element.clientHeight + 1) return false
    const maximum = element.scrollHeight - element.clientHeight
    element.scrollTop = maximum
    return element.scrollTop < maximum - 1
  }).map((element) => element.className || element.tagName))
  expect(traps, "nested scroll regions must reach their extent").toEqual([])
}

export function expectCleanRuntime(page: Page, runtimeIssues: MobileQaRuntimeIssues): void {
  expectNoConsoleErrors(page, runtimeIssues)
  const unexpectedFailures = runtimeIssues.failedRequests.filter((failure) => !isExpectedRouteWeatherAbort(failure))
  expect(unexpectedFailures, "unexpected failed network requests").toEqual([])
}
