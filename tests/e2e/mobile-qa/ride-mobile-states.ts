import { expect, type Locator, type Page, type TestInfo } from "@playwright/test"
import {
  installPlannerServices,
  installRouteApi,
  makeRoute,
  tripPlan
} from "../helpers/planner-fixtures"
import {
  expectFixedAndStickyContainment,
  expectNavigationReachability,
  expectNoConsoleErrors,
  expectNoHorizontalOverflow,
  expectSheetsAndModalsInsideVisualViewport,
  expectViewportFitAndSafeAreaContainment,
  isExpectedProviderHealthAbort,
  isExpectedRouteWeatherAbort,
  type MobileQaRuntimeIssues
} from "./assertions"
import { ensureMobileQaArtifactDirectory } from "./artifacts"
import { uxState } from "../helpers/ux-state-fixtures"

const RECORDING_KEY = "switchback:active-recording"

interface RecordingSample {
  readonly latitude: number
  readonly longitude: number
  readonly accuracy: number
}

declare global {
  interface Window {
    __switchbackEmitPosition?: (sample: RecordingSample) => void
  }
}

export async function installDeterministicGeolocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const native = navigator.geolocation
    const watchers = new Map<number, PositionCallback>()
    let nextId = 1
    const makePosition = (sample: RecordingSample): GeolocationPosition => ({
      coords: {
        latitude: sample.latitude,
        longitude: sample.longitude,
        accuracy: sample.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({})
      },
      timestamp: Date.now(),
      toJSON: () => ({})
    } satisfies GeolocationPosition)
    const emit = (sample: RecordingSample): void => {
      const position = makePosition(sample)
      for (const watcher of watchers.values()) watcher(position)
    }
    const getCurrentPosition = (success: PositionCallback): void => {
      queueMicrotask(() => success(makePosition({ latitude: 40.2732, longitude: -76.8867, accuracy: 8 })))
    }
    const watchPosition = (success: PositionCallback): number => {
      const id = nextId
      nextId += 1
      watchers.set(id, success)
      queueMicrotask(() => {
        if (watchers.has(id)) emit({ latitude: 40.2732, longitude: -76.8867, accuracy: 8 })
      })
      return id
    }
    const clearWatch = (id: number): void => { watchers.delete(id) }
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { ...native, getCurrentPosition, watchPosition, clearWatch }
    })
    window.__switchbackEmitPosition = emit
  })
}

export async function emitNavigationFix(page: Page, sample: RecordingSample): Promise<void> {
  await page.evaluate((nextSample) => window.__switchbackEmitPosition?.(nextSample), sample)
}

export async function tapControlByTouch(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible()
  await expect(control).toBeEnabled()

  const box = await control.boundingBox()
  expect(box, "touch control must have a visible bounding box").not.toBeNull()
  if (box === null) return

  const viewport = page.viewportSize()
  expect(viewport, "touch control requires a known viewport").not.toBeNull()
  if (viewport === null) return

  expect(box.x, "touch control must stay inside the viewport").toBeGreaterThanOrEqual(0)
  expect(box.y, "touch control must stay inside the viewport").toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, "touch control must stay inside the viewport").toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height, "touch control must stay inside the viewport").toBeLessThanOrEqual(viewport.height)
  expect(box.width, "touch control must be at least 44px wide").toBeGreaterThanOrEqual(44)
  expect(box.height, "touch control must be at least 44px tall").toBeGreaterThanOrEqual(44)

  const centers = await control.evaluate(async (element) => {
    interface Center { readonly x: number; readonly y: number }
    const nextAnimationFrame = (): Promise<void> => new Promise((resolve, reject) => {
      const frameId = window.requestAnimationFrame(() => {
        window.clearTimeout(timeoutId)
        resolve()
      })
      const timeoutId = window.setTimeout(() => {
        window.cancelAnimationFrame(frameId)
        reject(new Error("touch control did not reach an animation frame"))
      }, 1000)
    })
    const readCenter = (): Center => {
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }

    await nextAnimationFrame()
    const first = readCenter()
    await nextAnimationFrame()
    const second = readCenter()
    const hit = document.elementFromPoint(second.x, second.y)
    return { first, second, centerHitsControl: hit === element || element.contains(hit) }
  })

  for (const center of [centers.first, centers.second]) {
    expect(center.x, "touch center must stay inside the viewport").toBeGreaterThanOrEqual(0)
    expect(center.y, "touch center must stay inside the viewport").toBeGreaterThanOrEqual(0)
    expect(center.x, "touch center must stay inside the viewport").toBeLessThanOrEqual(viewport.width)
    expect(center.y, "touch center must stay inside the viewport").toBeLessThanOrEqual(viewport.height)
  }
  expect(Math.abs(centers.second.x - centers.first.x), "touch center must remain stable").toBeLessThanOrEqual(1)
  expect(Math.abs(centers.second.y - centers.first.y), "touch center must remain stable").toBeLessThanOrEqual(1)
  expect(centers.centerHitsControl, "touch center must target the control").toBe(true)

  await page.touchscreen.tap(centers.second.x, centers.second.y)
}

export async function openOffRouteRecovery(page: Page): Promise<{ readonly release: () => Promise<void> }> {
  await installDeterministicGeolocation(page)
  await uxState.ride(page)

  const samples: readonly RecordingSample[] = [
    { latitude: 40.3232, longitude: -76.9367, accuracy: 10 },
    { latitude: 40.3234, longitude: -76.9369, accuracy: 10 },
    { latitude: 40.3236, longitude: -76.9371, accuracy: 10 }
  ]
  for (const [index, sample] of samples.entries()) {
    await page.context().setGeolocation({
      latitude: sample.latitude,
      longitude: sample.longitude,
      accuracy: sample.accuracy
    })
    await emitNavigationFix(page, sample)
    await expect.poll(async () => page.locator(".ride-hud").evaluate((element) => ({
      deviating: element.classList.contains("is-deviating"),
      offRoute: element.classList.contains("is-off-route")
    })), { timeout: 15_000 }).toMatchObject(
      index === samples.length - 1 ? { offRoute: true } : { deviating: true }
    )
  }
  await expect(page.locator(".ride-hud.is-off-route")).toBeVisible({ timeout: 15_000 })

  let releaseHeld!: () => void
  const held = new Promise<void>((resolve) => { releaseHeld = resolve })
  let released = false
  await page.route("**/api/routes", async (route) => {
    if (!released) await held
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tripPlan([makeRoute("twisty", {
        id: "recovery-fixture-route",
        name: "Recovery fixture route"
      })]))
    })
  })
  return {
    release: async () => {
      released = true
      releaseHeld()
    }
  }
}

export async function captureRideState(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  const destination = ensureMobileQaArtifactDirectory("screenshots", testInfo.project.name, `${testInfo.title}-${state}`)
  await page.screenshot({
    path: destination,
    fullPage: false,
    animations: "disabled",
  })
}

export async function assertMobileRideSurface(page: Page, runtimeIssues: MobileQaRuntimeIssues): Promise<void> {
  await expectNoHorizontalOverflow(page)
  await expectPrimaryControlsReachable(page)
  await expectFixedAndStickyContainment(page)
  await expectDynamicViewportGeometry(page)
  await expectViewportFitAndSafeAreaContainment(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectNavigationReachability(page)
  expectNoConsoleErrors(page, runtimeIssues)
  const unexpectedFailures = runtimeIssues.failedRequests.filter((failure) => !isExpectedRouteWeatherAbort(failure) && !isExpectedProviderHealthAbort(failure))
  expect(unexpectedFailures, "unexpected failed network requests").toEqual([])
}

export { isExpectedRouteWeatherAbort } from "./assertions"

async function expectDynamicViewportGeometry(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualWidth: window.visualViewport?.width ?? window.innerWidth,
    visualHeight: window.visualViewport?.height ?? window.innerHeight
  }))
  expect(viewport.visualWidth, "visual viewport width must match the layout viewport").toBe(viewport.innerWidth)
  expect(viewport.visualHeight, "visual viewport height must match the layout viewport").toBe(viewport.innerHeight)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expectFixedAndStickyContainment(page)
}

async function expectPrimaryControlsReachable(page: Page): Promise<void> {
  const rideButtons = page.locator(
    ".ride-hud .ride-exit:visible, .ride-hud .ride-record-toggle:visible, .ride-hud .recording-controls button:visible, .ride-hud .reroute-option:visible, .ride-hud .free-ride-accept:visible"
  )
  const buttonCount = await rideButtons.count()
  if (buttonCount > 0) {
    for (let index = 0; index < buttonCount; index += 1) {
      const button = rideButtons.nth(index)
      const box = await button.boundingBox()
      expect(box).not.toBeNull()
      if (box === null) continue
      const viewport = page.viewportSize()
      expect(viewport).not.toBeNull()
      if (viewport === null) continue
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      expect(box.width, "ride controls must be at least 44px wide").toBeGreaterThanOrEqual(44)
      expect(box.height, "ride controls must be at least 44px tall").toBeGreaterThanOrEqual(44)
      const obscured = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return center === null || (center !== element && !element.contains(center))
      })
      expect(obscured, "ride primary controls must not be obscured at their center").toBe(false)
    }
    await expectNoNestedRideScrollOwners(page)
    return
  }

  const loading = page.getByRole("button", { name: "Reading the roads…" })
  await expect(loading).toBeVisible()
  const box = await loading.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (viewport === null) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  expect(box.width, "loading action must be at least 44px wide").toBeGreaterThanOrEqual(44)
  expect(box.height, "loading action must be at least 44px tall").toBeGreaterThanOrEqual(44)
}

async function expectNoNestedRideScrollOwners(page: Page): Promise<void> {
  const nested = await page.evaluate(() => {
    const owners = Array.from(document.querySelectorAll<HTMLElement>(".ride-hud *"))
      .filter((element) => {
        const style = getComputedStyle(element)
        return element.scrollHeight > element.clientHeight + 1 && /(auto|scroll)/.test(style.overflowY)
      })
    return owners.flatMap((owner) => owners
      .filter((candidate) => candidate !== owner && owner.contains(candidate))
      .map((candidate) => `${owner.tagName}.${String(owner.className)} contains ${candidate.tagName}.${String(candidate.className)}`))
  })
  expect(nested, "ride surfaces must not nest competing scroll owners").toEqual([])
}

export async function startGuidedRide(page: Page): Promise<void> {
  await uxState.ride(page)
}

export async function openRouteLoading(page: Page): Promise<{ readonly release: () => Promise<void> }> {
  const held = await uxState.routeLoading(page)
  return { release: held.release }
}

export async function openRecordPanel(page: Page): Promise<void> {
  await installPlannerServices(page)
  await installDeterministicGeolocation(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Record", exact: true }).tap()
  await expect(page.getByRole("heading", { name: "Record a ride" })).toBeVisible()
}

export async function startRecording(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start recording" }).tap()
  await expect(page.locator(".recording-ride-hud")).toBeVisible()
  await expect(page.getByText("Recording locally")).toBeVisible()
}

export async function emitRecordingSamples(page: Page): Promise<void> {
  const samples: readonly RecordingSample[] = [
    { latitude: 40.2732, longitude: -76.8867, accuracy: 8 },
    { latitude: 40.2746, longitude: -76.8848, accuracy: 8 },
    { latitude: 40.2761, longitude: -76.8827, accuracy: 8 }
  ]
  for (const [index, sample] of samples.entries()) {
    await page.evaluate((nextSample) => window.__switchbackEmitPosition?.(nextSample), sample)
    await expect.poll(() => page.evaluate((key) => {
      const raw = localStorage.getItem(key)
      if (raw === null) return 0
      try {
        const value: unknown = JSON.parse(raw)
        if (typeof value !== "object" || value === null || !("points" in value)) return 0
        const points = value.points
        return Array.isArray(points) ? points.length : 0
      } catch {
        return 0
      }
    }, RECORDING_KEY), { timeout: 10_000 }).toBeGreaterThanOrEqual(index + 1)
  }
}

export async function waitForRecordingSamples(page: Page, minimum: number): Promise<void> {
  await expect.poll(async () => page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (raw === null) return 0
    try {
      const value: unknown = JSON.parse(raw)
      if (typeof value !== "object" || value === null || !("points" in value)) return 0
      const points = value.points
      return Array.isArray(points) ? points.length : 0
    } catch {
      return 0
    }
  }, RECORDING_KEY), { timeout: 10_000 }).toBeGreaterThanOrEqual(minimum)
}

export async function installGuidedRoute(page: Page): Promise<void> {
  await installRouteApi(page, tripPlan([makeRoute("twisty", { name: "Mobile guided fixture route" })]))
}
