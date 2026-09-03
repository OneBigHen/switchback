import { expect, type Page, type TestInfo } from "@playwright/test"
import {
  expectFixedAndStickyContainment,
  expectInteractiveElementsUnclipped,
  expectMinimumTouchTargetSize,
  expectNavigationReachability,
  expectNoConsoleErrors,
  expectNoHorizontalOverflow,
  expectNoUnexpectedNetworkFailures,
  expectRealScrollOwner,
  expectSheetsAndModalsInsideVisualViewport,
  expectViewportFitAndSafeAreaContainment,
  scrollOwnerToEnd,
} from "./assertions"
import {
  expandPhonePlanner,
  ensureFixtureStart,
  fillFixtureFinish,
  FIXTURE_START,
  expectRouteOutcome,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  tripPlan,
} from "./fixtures"
import type { RouteCapture } from "../helpers/planner-fixtures"
import { settleMapDelay } from "../helpers/ux-state-fixtures"
import { ensureMobileQaArtifactDirectory } from "./artifacts"

export const PREPARE_VIEWPORTS = {
  "375-collapsed": { width: 375, height: 812 },
  "375-expanded": { width: 375, height: 812 },
  "390-collapsed": { width: 390, height: 844 },
  "390-expanded": { width: 390, height: 844 },
  "390-selected-peek": { width: 390, height: 844 },
  "768-prepare": { width: 768, height: 1024 },
  "1280-prepare": { width: 1280, height: 800 },
} as const

export type PrepareViewportState = keyof typeof PREPARE_VIEWPORTS

export function readableRouteSet() {
  return [
    readableRoute("twisty", "Twisty prepare route", 8.2, 17),
    readableRoute("scenic", "Scenic prepare route", 9.6, 21),
    readableRoute("quick", "Quick prepare route", 7.4, 14),
  ]
}

function readableRoute(profile: Parameters<typeof makeRoute>[0], name: string, distanceMiles: number, durationMinutes: number) {
  const route = makeRoute(profile, { name, distanceMiles, durationMinutes })
  return {
    ...route,
    instructions: route.instructions.map((instruction, index) => ({
      ...instruction,
      distanceMeters: index === 0 ? 24_140 : 31_000,
    })),
  }
}

export async function planFixtureRoute(page: Page, routes = readableRouteSet()): Promise<RouteCapture> {
  await installPlannerServices(page)
  const capture = await installRouteApi(page, tripPlan(routes))
  await page.goto("/")
  await settleMapDelay(page)
  await expandPhonePlanner(page)
  await openPlannerEditor(page)
  await submitFixturePlan(page)
  await expectRouteOutcome(page, capture)
  return capture
}

export function expectFixtureRequestStart(capture: RouteCapture): void {
  const request = capture.requests.at(-1)
  const points = request?.points
  const firstPoint = Array.isArray(points) ? points[0] : undefined
  expect(firstPoint).toMatchObject({ lat: FIXTURE_START.lat, lon: FIXTURE_START.lon })
}

export async function submitFixturePlan(page: Page): Promise<void> {
  await ensureFixtureStart(page)
  await fillFixtureFinish(page)
  await page.getByRole("button", { name: "Plan route" }).tap()
}

export { ensureFixtureStart, fillFixtureFinish, tapAutocompleteOption } from "./fixtures"

export async function capturePlannerState(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const destination = ensureMobileQaArtifactDirectory("screenshots", testInfo.project.name, `${testInfo.title}-${name}`)
  await page.screenshot({ path: destination, fullPage: true, animations: "disabled" })
}

export async function expectMobilePlannerContracts(page: Page): Promise<void> {
  await expectNoHorizontalOverflow(page)
  await expectInteractiveElementsUnclipped(page)
  await expectMinimumTouchTargetSize(page)
  await expectFixedAndStickyContainment(page)
  await expectSheetsAndModalsInsideVisualViewport(page)
  await expectNavigationReachability(page)
  const plannerScroll = page.locator(".planner-scroll").first()
  if (await plannerScroll.isVisible().catch(() => false)) await expectRealScrollOwner(page, ".planner-scroll")
  await expectViewportFitAndSafeAreaContainment(page)
}


export async function expectPrepareContracts(page: Page): Promise<void> {
  // PR #50 scrolls the nested planner-scroll owner so the rider lands on the
  // selected-route identity whenever a Prepare disclosure changes layout.
  // Assert that landing first — before the shared contracts below scroll the
  // container around to prove other invariants. Forcing scrollTop = 0 and
  // demanding full containment there measured a pre-effect frame the rider
  // never sees, with the composer and route rack (~350px) stacked above it.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const landing = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(".planner-scroll")
    const identity = document.querySelector<HTMLElement>(".route-selection-identity")
    if (!scroll || !identity) throw new Error("Prepare identity nodes are missing")
    const scrollBox = scroll.getBoundingClientRect()
    const identityBox = identity.getBoundingClientRect()
    return { identityTop: identityBox.top, scrollTop: scrollBox.top, scrollBottom: scrollBox.bottom }
  })
  expect(
    landing.identityTop >= landing.scrollTop - 1 && landing.identityTop <= landing.scrollBottom - 8,
    "PR #50 must land the rider on the selected-route identity inside the planner scroll",
  ).toBe(true)

  await expectMobilePlannerContracts(page)
  await page.locator(".planner-scroll").evaluate((element) => {
    element.scrollTop = 0
  })
  const metrics = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".planner-deck")
    const scroll = document.querySelector<HTMLElement>(".planner-scroll")
    const dock = document.querySelector<HTMLElement>(".planner-action-dock")
    const identity = document.querySelector<HTMLElement>(".route-selection-identity")
    const heading = identity?.closest<HTMLElement>(".section-heading")
    const rack = document.querySelector<HTMLElement>(".route-rack")
    const preparation = document.querySelector<HTMLElement>(".route-preparation")
    if (!sheet || !scroll || !dock || !identity || !heading || !rack || !preparation) {
      throw new Error("Prepare contract nodes are missing")
    }
    const scrollBox = scroll.getBoundingClientRect()
    const dockBox = dock.getBoundingClientRect()
    const attribution = document.querySelector<HTMLElement>(".planner-full-attribution")
    const directionSizes = Array.from(document.querySelectorAll<HTMLElement>(".directions-distance"))
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    const metadataSizes = Array.from(document.querySelectorAll<HTMLElement>(
      ".route-slip-name small,.route-character > span,.route-slip-metric strong,.route-details-toggle,.route-details-toggle small",
    )).map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    return {
      sheetDisplay: getComputedStyle(sheet).display,
      sheetDirection: getComputedStyle(sheet).flexDirection,
      scrollOverflowY: getComputedStyle(scroll).overflowY,
      dockPosition: getComputedStyle(dock).position,
      dockInSheet: dock.parentElement === sheet,
      viewportWidth: window.innerWidth,
      dockTop: dockBox.top,
      scrollBottom: scrollBox.bottom,
      scrollHasOverflow: scroll.scrollHeight > scroll.clientHeight + 1,
      documentHasOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
      attributionClearance: attribution ? dockBox.top - attribution.getBoundingClientRect().bottom : null,
      headingPosition: getComputedStyle(heading).position,
      directionSizes,
      metadataSizes,
      rackVisible: getComputedStyle(rack).display !== "none",
    }
  })
  expect(["auto", "scroll"]).toContain(metrics.scrollOverflowY)
  expect(metrics.dockInSheet).toBe(true)
  // The dock is kept clear of the scroll region by two deliberate mechanisms,
  // so the layout primitive is asserted per side rather than globally. Phones
  // stack a flex column and let the dock sit statically after the scroll;
  // >=761px pins the dock absolutely to the deck and caps the scroll height
  // instead (planner-action-dock.css `@media (min-width: 761px)`), which leaves
  // the deck a plain block. Either way the scroll must not run under the dock.
  if (metrics.viewportWidth <= 760) {
    expect(metrics.sheetDisplay).toBe("flex")
    expect(metrics.sheetDirection).toBe("column")
    expect(metrics.dockPosition).toBe("static")
    expect(metrics.dockTop).toBeGreaterThanOrEqual(metrics.scrollBottom - 1)
  } else {
    expect(metrics.dockPosition).toBe("absolute")
    expect(metrics.scrollBottom).toBeLessThanOrEqual(metrics.dockTop + 1)
  }
  expect(metrics.scrollHasOverflow).toBe(true)
  expect(metrics.documentHasOverflow).toBe(false)
  if (metrics.attributionClearance !== null) expect(metrics.attributionClearance).toBeGreaterThanOrEqual(0)
  expect(metrics.headingPosition).toBe("static")
  expect(metrics.rackVisible).toBe(true)
  expect(metrics.directionSizes.length).toBeGreaterThan(0)
  expect(Math.min(...metrics.directionSizes)).toBeGreaterThanOrEqual(15)
  expect(metrics.metadataSizes.length).toBeGreaterThan(0)
  expect(Math.min(...metrics.metadataSizes)).toBeGreaterThanOrEqual(14)

  // The shared contracts above scrolled the owner to its extent; the identity
  // stays reachable from anywhere in the scroll, which is the loosened contract.
  await page.locator(".route-selection-identity").scrollIntoViewIfNeeded()
  await expect(page.locator(".route-selection-identity")).toBeInViewport()
  await scrollOwnerToEnd(page, ".planner-scroll")
  const clearance = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(".planner-scroll")
    const dock = document.querySelector<HTMLElement>(".planner-action-dock")
    const preparation = document.querySelector<HTMLElement>(".route-preparation")
    if (!scroll || !dock || !preparation) throw new Error("Prepare clearance nodes are missing")
    const dockBox = dock.getBoundingClientRect()
    const preparationBox = preparation.getBoundingClientRect()
    return {
      bottomClearance: dockBox.top - preparationBox.bottom,
      preparationInsideScroll: preparation.closest(".planner-scroll") === scroll,
    }
  })
  expect(clearance.bottomClearance).toBeGreaterThanOrEqual(16)
  expect(clearance.preparationInsideScroll).toBe(true)
}

export function expectCleanRuntime(page: Page): void {
  expectNoConsoleErrors(page)
  expectNoUnexpectedNetworkFailures(page)
}
