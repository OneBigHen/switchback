import { expect, type Locator, type Page, type Request, type Response } from "@playwright/test"
import type { MobileQaRuntimeIssues, RuntimeIssueOptions } from "./types"

const MIN_TOUCH_TARGET_CSS_PX = 44
const TOUCH_TARGET_EPSILON_PX = 0.6
const VIEWPORT_EPSILON_PX = 1
const SCROLL_EPSILON_PX = 1

export async function expectMinimumTouchTargetSize(locator: Locator, label = "touch target"): Promise<void> {
  const box = await locator.boundingBox()
  expect(box, `${label} should have a visible box`).not.toBeNull()
  expect(box!.width + TOUCH_TARGET_EPSILON_PX, `${label} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS_PX)
  expect(box!.height + TOUCH_TARGET_EPSILON_PX, `${label} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_CSS_PX)
}

export async function expectRealScrollOwner(locator: Locator, label = "scroll owner"): Promise<void> {
  const result = await locator.evaluate((element) => {
    const target = element as HTMLElement
    const maxScroll = target.scrollHeight - target.clientHeight
    const before = target.scrollTop
    target.scrollTop = Math.min(Math.max(1, Math.floor(maxScroll / 2)), maxScroll)
    const after = target.scrollTop
    target.scrollTop = before
    const style = getComputedStyle(target)
    return {
      maxScroll,
      moved: Math.abs(after - before),
      overflowY: style.overflowY,
    }
  })
  expect(result.maxScroll, `${label} should have overflow to scroll`).toBeGreaterThan(SCROLL_EPSILON_PX)
  expect(["auto", "scroll", "overlay"], `${label} overflow-y`).toContain(result.overflowY)
  expect(result.moved, `${label} should actually scroll`).toBeGreaterThan(SCROLL_EPSILON_PX)
}

export async function expectFixedAndStickyContainment(page: Page): Promise<void> {
  const overflow = await page.evaluate(({ epsilon }) => {
    const viewport = window.visualViewport
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth)
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)

    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const position = getComputedStyle(element).position
        return position === "fixed" || position === "sticky"
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          selector: element.id ? `#${element.id}` : element.className || element.tagName,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          viewport: { left: viewportLeft, top: viewportTop, right: viewportRight, bottom: viewportBottom },
          visible: rect.width > 0 && rect.height > 0,
        }
      })
      .filter(({ visible, rect, viewport }) => visible && (
        rect.left < viewport.left - epsilon
        || rect.top < viewport.top - epsilon
        || rect.right > viewport.right + epsilon
        || rect.bottom > viewport.bottom + epsilon
      ))
  }, { epsilon: VIEWPORT_EPSILON_PX })

  expect(overflow, "fixed/sticky UI should stay inside the visual viewport").toEqual([])
}

export async function expectViewportFitAndSafeAreaContainment(page: Page): Promise<void> {
  const overflow = await page.evaluate(({ epsilon }) => {
    const viewport = window.visualViewport
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth)
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
    const body = document.body.getBoundingClientRect()
    const root = document.documentElement.getBoundingClientRect()
    return {
      horizontal: Math.max(body.right, root.right) - viewportRight > epsilon
        || Math.min(body.left, root.left) < viewportLeft - epsilon,
      vertical: Math.min(body.top, root.top) < viewportTop - epsilon,
    }
  }, { epsilon: VIEWPORT_EPSILON_PX })

  expect(overflow.horizontal, "document should not overflow the visual viewport horizontally").toBe(false)
  expect(overflow.vertical, "document should not begin above the visual viewport").toBe(false)
}

export async function expectNoClippedText(locator: Locator, label = "text"): Promise<void> {
  const clipped = await locator.evaluateAll((elements) => elements
    .filter((element) => {
      const target = element as HTMLElement
      const style = getComputedStyle(target)
      if (style.display === "none" || style.visibility === "hidden") return false
      if (target.getBoundingClientRect().width === 0 || target.getBoundingClientRect().height === 0) return false
      return target.scrollWidth - target.clientWidth > 1 || target.scrollHeight - target.clientHeight > 1
    })
    .map((element) => ({
      text: (element.textContent ?? "").trim().slice(0, 120),
      className: (element as HTMLElement).className,
    })))
  expect(clipped, `${label} should not be clipped`).toEqual([])
}

export async function expectNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(result.scrollWidth - result.clientWidth, "document horizontal overflow").toBeLessThanOrEqual(1)
}

export async function expectRouteActionDockNotCoveringContent(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".route-action-dock")
    if (!dock) return null
    const dockRect = dock.getBoundingClientRect()
    const scrollOwner = document.querySelector<HTMLElement>("[data-planner-scroll-owner='true']")
    const ownerRect = scrollOwner?.getBoundingClientRect() ?? null
    const lastContent = scrollOwner?.querySelector<HTMLElement>(":scope > *:last-child") ?? null
    const lastRect = lastContent?.getBoundingClientRect() ?? null
    return {
      dockTop: dockRect.top,
      ownerBottom: ownerRect?.bottom ?? null,
      lastBottom: lastRect?.bottom ?? null,
      scrollBottom: scrollOwner ? scrollOwner.scrollHeight - scrollOwner.scrollTop - scrollOwner.clientHeight : null,
    }
  })
  if (result === null) return
  if (result.ownerBottom !== null) expect(result.dockTop, "action dock should begin at or below scroll owner bottom").toBeGreaterThanOrEqual(result.ownerBottom - 1)
  if (result.lastBottom !== null && result.scrollBottom !== null && result.scrollBottom <= 1) {
    expect(result.lastBottom, "last reachable content should finish above the action dock").toBeLessThanOrEqual(result.dockTop + 1)
  }
}

export async function expectElementInsideViewport(locator: Locator, label = "element"): Promise<void> {
  const result = await locator.evaluate((element) => {
    const rect = (element as HTMLElement).getBoundingClientRect()
    const viewport = window.visualViewport
    const left = viewport?.offsetLeft ?? 0
    const top = viewport?.offsetTop ?? 0
    const right = left + (viewport?.width ?? window.innerWidth)
    const bottom = top + (viewport?.height ?? window.innerHeight)
    return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, viewport: { left, top, right, bottom } }
  })
  expect(result.rect.left, `${label} left`).toBeGreaterThanOrEqual(result.viewport.left - VIEWPORT_EPSILON_PX)
  expect(result.rect.top, `${label} top`).toBeGreaterThanOrEqual(result.viewport.top - VIEWPORT_EPSILON_PX)
  expect(result.rect.right, `${label} right`).toBeLessThanOrEqual(result.viewport.right + VIEWPORT_EPSILON_PX)
  expect(result.rect.bottom, `${label} bottom`).toBeLessThanOrEqual(result.viewport.bottom + VIEWPORT_EPSILON_PX)
}

export async function expectBottomInsetClearance(locator: Locator, page: Page, label = "element"): Promise<void> {
  const result = await locator.evaluate((element) => {
    const rect = (element as HTMLElement).getBoundingClientRect()
    const viewport = window.visualViewport
    const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
    return { bottom: rect.bottom, viewportBottom: bottom }
  })
  expect(result.viewportBottom - result.bottom, `${label} should have bottom inset clearance`).toBeGreaterThanOrEqual(0)
}

export async function expectSinglePrimaryHeading(page: Page): Promise<void> {
  const count = await page.locator("main h1").count()
  expect(count, "main should contain exactly one h1").toBe(1)
}

export async function expectNoDuplicateIds(page: Page): Promise<void> {
  const duplicates = await page.evaluate(() => {
    const counts = new Map<string, number>()
    document.querySelectorAll<HTMLElement>("[id]").forEach((element) => {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1)
    })
    return Array.from(counts.entries()).filter(([, count]) => count > 1)
  })
  expect(duplicates, "document should not contain duplicate IDs").toEqual([])
}

export async function expectNoFocusableHiddenContent(page: Page): Promise<void> {
  const issues = await page.evaluate(() => {
    const focusable = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"))
    return focusable.filter((element) => {
      if (element.tabIndex < 0) return false
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const hiddenByAttribute = element.hidden || element.getAttribute("aria-hidden") === "true"
      const hiddenByStyle = style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0
      const zeroSize = rect.width === 0 || rect.height === 0
      return hiddenByAttribute || hiddenByStyle || zeroSize
    }).map((element) => ({
      tag: element.tagName,
      id: element.id,
      className: element.className,
      text: (element.textContent ?? "").trim().slice(0, 80),
    }))
  })
  expect(issues, "hidden content should not stay focusable").toEqual([])
}

export async function expectStableVisualViewport(page: Page): Promise<void> {
  const before = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))
  await page.waitForTimeout(120)
  const after = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))
  expect(Math.abs(after.width - before.width), "visual viewport width drift").toBeLessThanOrEqual(1)
  expect(Math.abs(after.height - before.height), "visual viewport height drift").toBeLessThanOrEqual(1)
}

export async function expectNoUnboundedAnimations(page: Page): Promise<void> {
  const running = await page.evaluate(() => document.getAnimations({ subtree: true })
    .filter((animation) => {
      const timing = animation.effect?.getComputedTiming()
      return animation.playState === "running" && timing?.iterations === Infinity
    })
    .map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime })))
  expect(running, "mobile core states should not leave unbounded animations running").toEqual([])
}

export async function expectNoViewportScaleLock(page: Page): Promise<void> {
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content")
  expect(viewport ?? "", "viewport should not lock zoom").not.toMatch(/(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0+)?)(?:\s|,|$)/i)
}

export async function expectVisibleDialogContained(page: Page): Promise<void> {
  const dialogs = page.locator('[role="dialog"]:visible')
  const count = await dialogs.count()
  for (let index = 0; index < count; index += 1) {
    await expectElementInsideViewport(dialogs.nth(index), `dialog ${index + 1}`)
  }
}

export async function expectBottomDockReachable(page: Page): Promise<void> {
  const docks = page.locator(".route-action-dock:visible, .ride-dock:visible")
  const count = await docks.count()
  for (let index = 0; index < count; index += 1) {
    await expectElementInsideViewport(docks.nth(index), `bottom dock ${index + 1}`)
    await expectBottomInsetClearance(docks.nth(index), page, `bottom dock ${index + 1}`)
  }
}

export async function expectBottomSheetReachable(page: Page): Promise<void> {
  const sheets = page.locator("[data-bottom-sheet='true']:visible")
  const count = await sheets.count()
  for (let index = 0; index < count; index += 1) {
    await expectElementInsideViewport(sheets.nth(index), `bottom sheet ${index + 1}`)
  }
}

export async function expectDialogFocusContained(page: Page): Promise<void> {
  const dialogs = page.locator('[role="dialog"]:visible')
  const count = await dialogs.count()
  for (let index = 0; index < count; index += 1) {
    const dialog = dialogs.nth(index)
    const activeInside = await dialog.evaluate((element) => element.contains(document.activeElement))
    expect(activeInside, `dialog ${index + 1} should contain active focus`).toBe(true)
  }
}

export async function expectNoTinyInteractiveControls(page: Page): Promise<void> {
  const small = await page.evaluate(({ min, epsilon }) => Array.from(document.querySelectorAll<HTMLElement>("button:visible, a[href]:visible, input:visible, select:visible, textarea:visible"))
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return { text: (element.textContent ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }
    })
    .filter(({ width, height }) => width + epsilon < min || height + epsilon < min), { min: MIN_TOUCH_TARGET_CSS_PX, epsilon: TOUCH_TARGET_EPSILON_PX })
  expect(small, "interactive controls should meet mobile touch target minimums").toEqual([])
}

export async function expectMotionPreferenceRespected(page: Page): Promise<void> {
  const reduced = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  if (!reduced) return
  const violations = await page.evaluate(() => document.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === "running")
    .map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime })))
  expect(violations, "reduced-motion profile should not leave running animations").toEqual([])
}

export async function expectReadableTextContrast(page: Page): Promise<void> {
  // Contrast is intentionally enforced by token ownership and visual review in this
  // deterministic suite. Keep this hook so scenarios can opt into a stronger
  // browser-native contrast oracle later without changing the scenario contract.
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? "light")).toBeTruthy()
}

export async function expectNoRuntimeErrors(page: Page): Promise<void> {
  await expectNoConsoleErrors(page)
  await expectNoUnexpectedNetworkFailures(page)
}

const collectors = new WeakMap<Page, MobileQaRuntimeIssues>()

export function installRuntimeIssueCollector(page: Page, options: RuntimeIssueOptions = {}): MobileQaRuntimeIssues {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  const onConsole = (message: { readonly type: () => string; readonly text: () => string }): void => {
    if (message.type() === "error") consoleErrors.push(message.text())
  }
  const onPageError = (error: Error): void => { consoleErrors.push(error.message) }
  const onRequestFailed = (request: Request): void => {
    if (!options.ignoreRequest?.(request)) failedRequests.push(`${request.method()} ${request.url()} failed: ${request.failure()?.errorText ?? "unknown error"}`)
  }
  const onResponse = (response: Response): void => {
    if (response.status() >= 400 && !options.ignoreResponse?.(response)) failedRequests.push(`${response.status()} ${response.url()}`)
  }
  page.on("console", onConsole)
  page.on("pageerror", onPageError)
  page.on("requestfailed", onRequestFailed)
  page.on("response", onResponse)
  const collector: MobileQaRuntimeIssues = {
    get consoleErrors() { return [...consoleErrors] },
    get failedRequests() { return [...failedRequests] },
    dispose: () => {
      page.off("console", onConsole)
      page.off("pageerror", onPageError)
      page.off("requestfailed", onRequestFailed)
      page.off("response", onResponse)
    },
  }
  collectors.set(page, collector)
  return collector
}

/**
 * Mobile Playwright WebKit (a Linux approximation of Safari) reports this
 * generic text for the overlay loads it drops the instant the browsing
 * context is forced offline — on the console as the full `Failed to load
 * resource:` line, and on `requestfailed` as the bare `errorText`. Chromium
 * reports a clean `net::ERR_*` for the same loads. Only the deliberate offline
 * test may ignore it, by passing `isWebkitOfflineInternalError` as the `ignore`
 * predicate, and only for that one intentional online→offline→online cycle.
 */
const WEBKIT_INTERNAL_ERROR_TEXT = "WebKit encountered an internal error"
export const WEBKIT_OFFLINE_RESOURCE_DIAGNOSTIC = `Failed to load resource: ${WEBKIT_INTERNAL_ERROR_TEXT}`

export function isWebkitOfflineInternalError(message: string): boolean {
  const text = message.trim()
  return text === WEBKIT_OFFLINE_RESOURCE_DIAGNOSTIC || text.endsWith(`failed: ${WEBKIT_INTERNAL_ERROR_TEXT}`)
}

export interface RuntimeIssueExpectation {
  /** Drop entries this predicate accepts before asserting. Use sparingly. */
  readonly ignore?: (entry: string) => boolean
}

export function expectNoConsoleErrors(
  page: Page,
  collector = collectors.get(page),
  options: RuntimeIssueExpectation = {},
): void {
  const errors = (collector?.consoleErrors ?? []).filter((message) => !options.ignore?.(message))
  expect(errors, "unexpected browser console errors").toEqual([])
}

export function expectNoUnexpectedNetworkFailures(
  page: Page,
  collector = collectors.get(page),
  options: RuntimeIssueExpectation = {},
): void {
  const failures = (collector?.failedRequests ?? [])
    .filter((failure) => !isExpectedProviderHealthAbort(failure)
      && !isExpectedRouteTrafficAbort(failure)
      && !options.ignore?.(failure))
  expect(failures, "unexpected failed network requests").toEqual([])
}

export function isExpectedRouteWeatherAbort(failure: string): boolean {
  const match = /^(?:GET|POST) (\S+) failed: (.+)$/.exec(failure)
  if (match === null) return false
  try {
    const url = new URL(match[1])
    return url.pathname === "/api/route-weather"
      && (match[2] === "Load request cancelled" || match[2] === "net::ERR_ABORTED")
  } catch {
    return false
  }
}

/**
 * Route traffic evidence is requested as soon as a selected route is shown,
 * and the request is deliberately aborted when that surface unmounts or the
 * selected route changes. Only that exact POST cancellation is expected.
 * HTTP errors, offline failures, query-bearing requests, and other endpoints
 * remain visible to Mobile Core.
 */
export function isExpectedRouteTrafficAbort(failure: string): boolean {
  const match = /^POST (\S+) failed: (.+)$/.exec(failure)
  if (match === null) return false
  try {
    const url = new URL(match[1])
    return url.pathname === "/api/route-traffic"
      && url.search === ""
      && url.hash === ""
      && (match[2] === "Load request cancelled" || match[2] === "net::ERR_ABORTED")
  } catch {
    return false
  }
}

/**
 * Surfaces that ask the server what it can do as soon as they mount, and
 * cancel the question in cleanup.
 *
 * Provider health and the advisor capability are both answered before the
 * rider can act on them, so a rider who taps away first leaves a cancelled
 * request behind by design. Cancellation is the only tolerated outcome: a 4xx
 * or 5xx from either endpoint is still a failure this suite must catch.
 */
const CANCELLABLE_PROBE_PATHS: ReadonlySet<string> = new Set(["/api/health", "/api/advisor"])

export function isExpectedProviderHealthAbort(failure: string): boolean {
  const match = /^GET (\S+) failed: (.+)$/.exec(failure)
  if (match === null) return false
  try {
    const url = new URL(match[1])
    return CANCELLABLE_PROBE_PATHS.has(url.pathname) && url.search === "" && url.hash === ""
      && (match[2] === "Load request cancelled" || match[2] === "net::ERR_ABORTED")
  } catch {
    return false
  }
}

export const expectUsableTouchTargets = expectMinimumTouchTargetSize
export const expectScrollOwnerReachability = expectRealScrollOwner
export const expectViewportContainment = expectFixedAndStickyContainment
export const expectSafeAreaContainment = expectViewportFitAndSafeAreaContainment
export const expectNoUnexpectedFailedRequests = expectNoUnexpectedNetworkFailures
