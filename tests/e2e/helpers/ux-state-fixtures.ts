import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  FIXTURE_START,
  expectRouteOutcome,
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
 * freshness compares against Date.now. Install also pauses JS timers, which
 * freezes two more drift sources: the planner deck's rotating prompt
 * placeholder (4.2 s interval, PlannerDeck) stays on its first example and
 * the stale-GPS interval never spuriously flips GPS status mid-capture.
 * Free Ride states call `page.clock.runFor` explicitly to fire their
 * deferred first suggestion poll.
 */
export const PINNED_CLOCK = new Date("2026-06-15T12:00:00")

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

/** Fire timers due within the window without advancing further — used to
 *  reach timer-deferred states (Free Ride's 1 s delayed first poll)
 *  deterministically instead of racing real time. Network and browser
 *  events stay fully asynchronous. */
export async function fireDeferredTimers(page: Page, milliseconds: number): Promise<void> {
  await page.clock.runFor(milliseconds)
}

/**
 * Drive Free Ride's deferred suggestion poll to completion under the paused
 * clock. Geolocation fixes are real browser events that need real time to
 * land, while the app only re-polls when fake time advances past its 1 s
 * defer/15 s interval; alternate small real waits with clock advances until
 * `marker` reports the state has been reached (or give up after a bounded
 * number of cycles so failure stays a fast, visible assertion). Total fake
 * advance stays under the 15 s re-poll interval so each cycle fires exactly
 * the deferred first poll.
 */
async function driveFreeRidePoll(
  page: Page,
  marker: Locator,
  attempts = 8
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.waitForTimeout(250)
    await fireDeferredTimers(page, 1_100)
    if (await marker.isVisible().catch(() => false)) return
  }
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

async function ensureCurrentLocationStart(page: Page): Promise<void> {
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  if ((await start.inputValue()).length === 0) {
    await page.getByRole("button", { name: /current location/i }).click()
  }
  await expect(start).toHaveValue(/Current location|Fixture start/)
}

async function chooseFixtureFinish(page: Page): Promise<void> {
  const finish = page.getByRole("combobox", { name: "Finish", exact: true })
  await finish.fill("Fixture finish")
  await expect(page.getByRole("option", { name: /Fixture finish/i })).toBeVisible()
  await page.getByRole("option", { name: /Fixture finish/i }).click()
  await expect(finish).toHaveValue(/Fixture finish/i)
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
  await ensureCurrentLocationStart(page)
  await chooseFixtureFinish(page)
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
    await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
  },

  /** State 2 — route loading. Caller must invoke `release()` before test end. */
  async routeLoading(page: Page): Promise<HeldRouteResponse> {
    await installPlannerServices(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
    await openPlannerEditor(page)
    await ensureCurrentLocationStart(page)
    await chooseFixtureFinish(page)
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
    await ensureCurrentLocationStart(page)
    await chooseFixtureFinish(page)
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
    // MIN_OFF_ROUTE_METERS (35 m) before declaring off-route, so emit a
    // matching series of distinct fixes.
    for (let fix = 0; fix < 3; fix += 1) {
      await page.context().setGeolocation({
        latitude: FIXTURE_START.lat + 0.05 + fix * 0.0002,
        longitude: FIXTURE_START.lon - 0.05 - fix * 0.0002,
        accuracy: 10
      })
      await page.waitForTimeout(250)
    }
    await expect(page.locator(".ride-hud.is-off-route")).toBeVisible({ timeout: 15_000 })
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
    await expect(page.getByRole("heading", { name: /Where do you want to ride/i })).toBeVisible()
    await expect(page.locator(".map-error")).toContainText(
      "The base map could not load. Routing controls remain available."
    )
  }
}
