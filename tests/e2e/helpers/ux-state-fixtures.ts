import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  FIXTURE_START,
  expectRouteOutcome,
  expandPhonePlanner,
  ensureFixtureStart,
  fillFixtureFinish,
  installPlannerServices,
  makeRoute,
  openPlannerEditor,
  tripPlan,
  type RouteCapture
} from "./planner-fixtures"

// CINCO Phase 0 screen-state contract (docs/cinco/UX_STATE_CONTRACT.md).
// Every required UX state must be constructible deterministically, without
// live external services, so later phases can prove presentation changes
// against stable state seams. These constructors own that seam; they assert
// each state's UI marker before returning, so a screenshot taken afterwards
// documents the state rather than a transition into it.

/**
 * Midday pin for wall-clock-dependent rendering: the shell resolves its theme
 * from the local hour (< 6 or >= 19 goes dark, PlannerShell), auto night
 * style follows sun calculations (day-phase), and Free Ride suggestion
 * freshness compares against Date.now.
 *
 * The literal carries an explicit `-04:00` (EDT) offset rather than a
 * bare "2026-06-15T12:00:00" — without one, `new Date(...)` parses as local
 * time of whatever machine runs the suite, so the *wall-clock hour* read
 * back via `getHours()` self-corrects (still noon) but the *absolute
 * instant* underneath it does not. day-phase.ts's SunCalc-based
 * isNightTime() operates on that absolute instant against fixed
 * coordinates, so a bare literal made the resolved theme flip between light
 * and dark purely from the host's timezone: verified false (day) on a
 * UTC or America/New_York host, but true (night) on Asia/Tokyo or
 * Pacific/Auckland, for this exact literal and PA fixture coordinates.
 * Pinning `playwright.config.ts`'s `timezoneId` to America/New_York keeps
 * `page.clock.install`'s browser-local readback (getHours, toString, etc.)
 * consistent with this offset regardless of the host's own timezone.
 *
 * Note `install()` pins the browser clock baseline but does not pause timers;
 * real time still elapses while the test runs. That's intentional here:
 * MapLibre's camera easeTo/flyTo transitions run on requestAnimationFrame,
 * which a paused clock would freeze mid-animation, and MAP_SETTLE_MS below
 * waits on real time for those transitions to finish. Free Ride states wait
 * for their visible suggestion marker instead of advancing the clock manually.
 */
export const PINNED_CLOCK = new Date("2026-06-15T12:00:00-04:00")

/** Longest map camera transition in MapStage runs 650 ms (`easeTo`/
 *  `flyTo` duration). Screenshots wait this much longer than that so camera
 *  animation never straddles a capture. */
export const MAP_SETTLE_MS = 900

const EVIDENCE_DIR = path.join(process.cwd(), "artifacts", "cinco", "phase-0")

/** Far-future expiry so fixture suggestions never expire under any clock. */
const SUGGESTION_NEVER_EXPIRES = new Date("2099-01-01T00:00:00Z").toISOString()

export async function pinVisualClock(page: Page): Promise<void> {
  await page.clock.install({ time: PINNED_CLOCK })
}

async function driveFreeRidePoll(
  page: Page,
  marker: Locator,
  attempts = 8
): Promise<void> {
  await expect(marker, "Free Ride suggestion did not become interactive after its deferred poll")
    .toBeVisible({ timeout: attempts * 2_000 })
}

/** Export a review copy of the current viewport to the phase evidence dir. */
export async function captureEvidence(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const file = path.join(EVIDENCE_DIR, `${name}.png`)
  const buffer = await page.screenshot()
  writeFileSync(file, buffer)
}

/** Wait past the longest map camera animation so captures never straddle a
 *  transition (MAP_SETTLE_MS, documented in UX_STATE_CONTRACT.md). */
export async function settleMapDelay(page: Page): Promise<void> {
  await page.waitForTimeout(MAP_SETTLE_MS)
}

async function expectPlannerHomeReady(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: /Where do you want to ride/i })
  const expand = page.getByRole("button", { name: "Expand planner" })
  await expect.poll(async () => (
    await heading.isVisible().catch(() => false)
    || await expand.isVisible().catch(() => false)
  ), { timeout: 10_000 }).toBe(true)
}

interface HeldRouteResponse {
  capture: RouteCapture
  /** Resolve the held `/api/routes` response so the planning flow completes. */
  release(): Promise<void>
}

/** Intercept `/api/routes` without answering, keeping the app in its loading
 *  state until `release()` is called. */
export async function holdRouteResponse(
  page: Page,
  response: ReturnType<typeof tripPlan>
): Promise<HeldRouteResponse> {
  const capture: RouteCapture = { requests: [], responses: [] }
  let openRouteRequest!: (value: void) => void
  const held = new Promise<void>((resolve) => { openRouteRequest = resolve })
  let released = false
  await page.route("**/api/routes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    capture.requests.push(request)
    if (!released) await held
    capture.responses.push({ request, body: response })
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response)
    })
  })
  return {
    capture,
    release: async () => {
      released = true
      openRouteRequest()
    }
  }
}

async function driveToRouteResult(page: Page): Promise<RouteCapture> {
  await openPlannerEditor(page)
  await ensureFixtureStart(page)
  await fillFixtureFinish(page)
  const held = await holdRouteResponse(page, tripPlan([
    makeRoute("twisty", { name: "Contract fixture route" })
  ]))
  await page.getByRole("button", { name: "Plan route" }).click()
  await held.release()
  await expectRouteOutcome(page, held.capture)
  return held.capture
}

function suggestionFixture() {
  const geometry: [number, number][] = [
    [FIXTURE_START.lon, FIXTURE_START.lat],
    [-76.85, 40.29],
    [-76.82, 40.31]
  ]
  return {
    id: "contract-suggestion",
    kind: "fun-road",
    title: "Fun road ahead — Follow this road in 0.8 mi — +4 min",
    actionLabel: "Take it",
    origin: [FIXTURE_START.lon, FIXTURE_START.lat],
    destination: [-76.82, 40.31],
    routeFragment: geometry,
    triggerDistanceMeters: 1_200,
    addedDurationSeconds: 240,
    score: {
      total: 84, fun: 92, twistiness: 94, scenic: 77, elevation: 58, gravel: 0,
      traffic: 89, simplicity: 83, safety: 96, novelty: 74, confidence: 90,
      preferenceFit: 84, etaPenalty: 0,
      explanations: ["Strong curvature."], explanation: ["Strong curvature."]
    },
    reasons: ["Strong curvature and sustained bends (94/100)."],
    confidence: 0.9,
    expiresAt: SUGGESTION_NEVER_EXPIRES
  }
}

export const uxState = {
  /** State 1 — home. */
  async home(page: Page): Promise<void> {
    await installPlannerServices(page)
    await page.goto("/")
    await expectPlannerHomeReady(page)
  },

  /** State 2 — route loading. Caller must invoke `release()` before test end. */
  async routeLoading(page: Page): Promise<HeldRouteResponse> {
    await installPlannerServices(page)
    await page.goto("/")
    await expectPlannerHomeReady(page)
    await openPlannerEditor(page)
    await ensureFixtureStart(page)
    await fillFixtureFinish(page)
    const held = await holdRouteResponse(page, tripPlan([
      makeRoute("twisty", { name: "Contract fixture route" })
    ]))
    await page.getByRole("button", { name: "Plan route" }).click()
    await expect(page.getByRole("button", { name: "Reading the roads…" })).toBeVisible()
    return held
  },

  /** State 3 — route selected (explicit user selection). */
  async routeSelected(page: Page): Promise<RouteCapture> {
    await installPlannerServices(page)
    await page.goto("/")
    const capture = await driveToRouteResult(page)
    // The planner auto-selects its primary candidate; an explicit tap makes
    // this a user selection (SB-005 semantics). Selected = pressed route slip
    // plus the expanded ride dock offering to start it.
    const slip = page.getByRole("button", { name: /^Select / }).first()
    await slip.click()
    await expect(slip).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: /^Start .* route$/i }).first()).toBeVisible()
    return capture
  },

  /** State 4 — alternatives rack. */
  async routeAlternatives(page: Page): Promise<RouteCapture> {
    await installPlannerServices(page)
    await page.goto("/")
    await openPlannerEditor(page)
    await ensureFixtureStart(page)
    await fillFixtureFinish(page)
    const held = await holdRouteResponse(page, tripPlan([
      makeRoute("twisty", { name: "Twisty contract route" }),
      makeRoute("scenic", { name: "Scenic contract route" })
    ]))
    await page.getByRole("button", { name: "Plan route" }).click()
    await held.release()
    await expectRouteOutcome(page, held.capture)
    await expect(page.getByRole("button", { name: /^Select / })).toHaveCount(2)
    return held.capture
  },

  /** State 5 — route detail expansion. */
  async routeDetail(page: Page): Promise<void> {
    await installPlannerServices(page)
    await page.goto("/")
    await driveToRouteResult(page)
    await page.getByRole("button", { name: "Show route details" }).first().click()
    await expect(page.getByRole("button", { name: "Hide route details" }).first()).toBeVisible()
  },

  /** State 6 — route editor. */
  async routeEdit(page: Page): Promise<void> {
    await installPlannerServices(page)
    await page.goto("/")
    await openPlannerEditor(page)
    await expect(page.getByRole("combobox", { name: "Start", exact: true })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Finish", exact: true })).toBeVisible()
  },

  /** State 7 — active ride HUD. */
  async ride(page: Page): Promise<void> {
    await uxState.routeSelected(page)
    await page.getByRole("button", { name: /^Start .* route$/i }).first().click()
    await expect(page.locator(".ride-hud")).toBeVisible()
    await expect(page.getByRole("region", { name: /Ride (mode|preview) for/ })).toBeVisible()
  },

  /** State 8 — off-route recovery (immediate surface, pre auto-reroute). */
  async offRouteRecovery(page: Page): Promise<void> {
    await uxState.ride(page)
    // Jump the virtual rider far off the fixture corridor. The navigation
    // engine requires OFF_ROUTE_FIXES_REQUIRED (3) consecutive fixes beyond
    // MIN_OFF_ROUTE_METERS (35 m) before declaring off-route. Emitting those
    // back to back sets the emulated position faster than watchPosition
    // delivers callbacks, so the burst can land as fewer fixes than the engine
    // counts; keep feeding distinct paced fixes — as real GPS would — until it
    // declares off-route.
    let fix = 0
    const offRouteHud = page.locator(".ride-hud.is-off-route")
    await expect.poll(async () => {
      await page.context().setGeolocation({
        latitude: FIXTURE_START.lat + 0.05 + fix * 0.0002,
        longitude: FIXTURE_START.lon - 0.05 - fix * 0.0002,
        accuracy: 10
      })
      fix += 1
      return await offRouteHud.isVisible().catch(() => false)
    }, { timeout: 15_000, intervals: [250] }).toBe(true)
    await expect(offRouteHud).toBeVisible()
  },

  /** State 9 — Free Ride idle (no suggestion ready). */
  async freeRideIdle(page: Page): Promise<void> {
    await installPlannerServices(page)
    await page.route("**/api/free-ride/suggestions", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "fixture",
        suggestion: null,
        suppressed: true,
        suppressionReason: "no-safe-candidate"
      })
    }))
    await page.goto("/")
    await expandPhonePlanner(page)
    await page.getByRole("button", { name: "Free Ride" }).click()
    await driveFreeRidePoll(
      page,
      page.locator(".free-ride-empty").filter({ hasText: "No experimental road suggestion" })
    )
    await expect(page.getByRole("heading", { name: "Free Ride" })).toBeVisible()
    await expect(page.locator(".free-ride-empty")).toContainText(
      "No experimental road suggestion is ready in the next few miles."
    )
  },

  /** State 10 — Free Ride primary suggestion. */
  async freeRideSuggestion(page: Page): Promise<void> {
    await installPlannerServices(page)
    await page.route("**/api/free-ride/suggestions", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "fixture",
        suggestion: suggestionFixture(),
        suppressed: false
      })
    }))
    await page.goto("/")
    await expandPhonePlanner(page)
    await page.getByRole("button", { name: "Free Ride" }).click()
    const suggestionRegion = page.getByRole("region", { name: "Suggested fun road" })
    await driveFreeRidePoll(page, suggestionRegion)
    await expect(suggestionRegion).toBeVisible({ timeout: 15_000 })
  },

  /** State 11 — map provider failure distinct from routing failure. */
  async mapProviderFailure(page: Page): Promise<void> {
    await installPlannerServices(page)
    // Registered after the service mocks, so this abort handler wins for the
    // style URL and simulates the tile/style provider being unreachable.
    await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.abort())
    await page.goto("/")
    await expectPlannerHomeReady(page)
    await expect(page.locator(".map-error")).toContainText(
      "The base map could not load. Routing controls remain available."
    )
  }
}
