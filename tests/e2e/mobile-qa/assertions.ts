import { expect, type Locator, type Page, type Request, type Response } from "@playwright/test"

type Viewport = { readonly width: number; readonly height: number }

const INTERACTIVE_SELECTOR = "button,a,input,select,textarea,[role=button],[role=link],[role=tab]"
export const PROVIDER_ATTRIBUTION_MINIMUM = { width: 24, height: 12 } as const

export interface IntendedScrollRegionCandidate {
  readonly name: string
  readonly overflowY: string
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly visible: boolean
}

export type ScrollInteraction = "wheel" | "programmatic-owner"

/**
 * Playwright 1.61.1 exposes touchscreen.tap, but no public swipe API. Mobile
 * WebKit also rejects page.mouse.wheel, so its owner check is intentionally a
 * programmatic scroll-owner proof. Independent tap coverage remains in the
 * mobile scenarios; this helper must not label the WebKit branch as swipe proof.
 */
export function scrollInteractionForEngine(engine: string): ScrollInteraction {
  if (engine === "chromium") return "wheel"
  if (engine === "webkit") return "programmatic-owner"
  throw new Error(`Unsupported mobile QA browser engine: ${engine || "unknown"}`)
}

export function selectIntendedScrollRegions<T extends IntendedScrollRegionCandidate>(
  candidates: readonly T[],
): T[] {
  return candidates.filter((candidate) => candidate.visible
    && candidate.scrollHeight > candidate.clientHeight + 1
    && /^(auto|scroll|overlay)$/.test(candidate.overflowY))
}

function assertNoIssues(issues: readonly string[], message: string): void {
  expect(issues, message).toEqual([])
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const issues = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)
    return scrollWidth > width + 1 ? [`document scroll width ${scrollWidth}px exceeds viewport ${width}px`] : []
  })
  assertNoIssues(issues, "document must not overflow horizontally")
}

export async function expectInteractiveElementsUnclipped(page: Page): Promise<void> {
  const issues = await page.evaluate((selector) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const visible = elements.filter((element) => {
      const style = getComputedStyle(element)
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
    })
    const problems: string[] = []
    const describe = (element: HTMLElement): string => element.getAttribute("aria-label") ?? (element.textContent?.trim().slice(0, 40) || element.className || element.tagName.toLowerCase())
    for (const element of visible) {
      if (element.closest(".planner-full-attribution") !== null) continue
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      if (rect.right <= -1 || rect.left >= viewport.width + 1 || rect.bottom <= -1 || rect.top >= viewport.height + 1) continue
      const scrollOwner = (() => {
        for (let ancestor = element.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor)
          if (!/(auto|scroll|overlay)/.test(style.overflowY)) continue
          if (ancestor.scrollHeight <= ancestor.clientHeight + 1) continue
          return ancestor
        }
        return null
      })()
      if (scrollOwner) {
        const ownerRect = scrollOwner.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        if (centerX < ownerRect.left - 1 || centerX > ownerRect.right + 1
          || centerY < ownerRect.top - 1 || centerY > ownerRect.bottom + 1) continue
      }
      // A horizontal scroller — the route-rack carousel — keeps its off-fold
      // cards reachable by swiping, exactly as the vertical scroll owner above
      // does past its own fold. A control whose centre sits beyond the
      // carousel's horizontal edge is parked, not clipped.
      const horizontalRack = (() => {
        for (let ancestor = element.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor)
          if (!/(auto|scroll|overlay)/.test(style.overflowX)) continue
          if (ancestor.scrollWidth <= ancestor.clientWidth + 1) continue
          return ancestor
        }
        return null
      })()
      if (horizontalRack) {
        const rackRect = horizontalRack.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        if (centerX < rackRect.left - 1 || centerX > rackRect.right + 1) continue
      }
      if (rect.left < -1 || rect.top < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1) {
        problems.push(`${describe(element)} is outside the viewport`)
        continue
      }
      for (let ancestor = element.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor)
        if (!/(hidden|clip|scroll|auto)/.test(ancestorStyle.overflow)) continue
        const ancestorRect = ancestor.getBoundingClientRect()
        // A scrollable ancestor does not clip along an axis it can actually
        // scroll — content past the fold is reachable, and
        // expectNoNestedScrollTrap separately proves those regions reach their
        // extent. Only real hidden/clip containment counts as clipping, so a
        // control that merely sits below the sheet's fold is not a defect.
        const scrollsX = /(auto|scroll|overlay)/.test(ancestorStyle.overflowX)
          && ancestor.scrollWidth > ancestor.clientWidth + 1
        const scrollsY = /(auto|scroll|overlay)/.test(ancestorStyle.overflowY)
          && ancestor.scrollHeight > ancestor.clientHeight + 1
        // Name the offending edge and the overflow in px. Without it the
        // failure only says "clipped by div", which is not enough to tell a
        // horizontal overflow from an element sitting past a scroll fold.
        const overflows = [
          !scrollsX && rect.left < ancestorRect.left - 1 ? `left by ${Math.round(ancestorRect.left - rect.left)}px` : "",
          !scrollsX && rect.right > ancestorRect.right + 1 ? `right by ${Math.round(rect.right - ancestorRect.right)}px` : "",
          !scrollsY && rect.top < ancestorRect.top - 1 ? `top by ${Math.round(ancestorRect.top - rect.top)}px` : "",
          !scrollsY && rect.bottom > ancestorRect.bottom + 1 ? `bottom by ${Math.round(rect.bottom - ancestorRect.bottom)}px` : ""
        ].filter(Boolean)
        if (overflows.length > 0) {
          const owner = `${ancestor.tagName.toLowerCase()}${ancestor.className ? `.${String(ancestor.className).trim().split(/\s+/).join(".")}` : ""}`
          problems.push(`${describe(element)} is clipped by ${owner} (overflows ${overflows.join(", ")})`)
          break
        }
      }
      const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      if (center === null || (!element.contains(center) && !center.contains(element))) {
        // Name what is on top; "obscured" alone does not say whether the
        // control is behind a panel or simply off-screen (null).
        const onTop = center === null
          ? "nothing (its centre is outside the viewport)"
          : `${center.tagName.toLowerCase()}${center.className ? `.${String(center.className).trim().split(/\s+/).join(".")}` : ""}`
        problems.push(`${describe(element)} is obscured at its center by ${onTop}`)
      }
    }
    return problems
  }, INTERACTIVE_SELECTOR)
  assertNoIssues(issues, "visible interactive elements must be unclipped and unobscured")
}

export async function expectMinimumTouchTargetSize(page: Page, minimum = 44): Promise<void> {
  const issues = await page.evaluate(({ minimum, selector }) => {
    const problems: string[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (element.closest(".planner-full-attribution") !== null) continue
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue
      const isHiddenFileInput = element.tagName === "INPUT"
        && element.getAttribute("type")?.toLowerCase() === "file"
        && style.pointerEvents === "none"
      if (isHiddenFileInput) continue
      const owner = element.tagName === "INPUT" ? element.closest("label") : null
      const rect = owner?.getBoundingClientRect() ?? element.getBoundingClientRect()
      if (rect.right <= -1 || rect.left >= window.innerWidth + 1 || rect.bottom <= -1 || rect.top >= window.innerHeight + 1) continue
      if (rect.width > 0 && rect.height > 0 && (rect.width < minimum || rect.height < minimum)) {
        problems.push(`${element.tagName.toLowerCase()} is ${Math.round(rect.width)}x${Math.round(rect.height)}px`)
      }
    }
    return problems
  }, { minimum, selector: INTERACTIVE_SELECTOR })
  assertNoIssues(issues, `usable interactive targets must be at least ${minimum}px in both dimensions`)
  await expectProviderAttributionLinks(page)
}

export async function expectProviderAttributionLinks(page: Page): Promise<void> {
  const issues = await page.evaluate(({ minimum, selector }) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const problems: string[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))) {
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue
      const rect = element.getBoundingClientRect()
      if (rect.right <= -1 || rect.left >= viewport.width + 1 || rect.bottom <= -1 || rect.top >= viewport.height + 1) continue
      if (rect.width < minimum.width || rect.height < minimum.height) {
        problems.push(`provider attribution link is ${Math.round(rect.width)}x${Math.round(rect.height)}px`)
        continue
      }
      if (rect.left < -1 || rect.top < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1) {
        problems.push("provider attribution link leaves the viewport")
        continue
      }
      for (let ancestor = element.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
        if (!/(hidden|clip|scroll|auto)/.test(getComputedStyle(ancestor).overflow)) continue
        const ancestorRect = ancestor.getBoundingClientRect()
        if (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1 || rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1) {
          problems.push("provider attribution link is clipped")
          break
        }
      }
      const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      if (center === null || (!element.contains(center) && !center.contains(element))) problems.push("provider attribution link is obscured at its center")
    }
    return problems
  }, { minimum: PROVIDER_ATTRIBUTION_MINIMUM, selector: ".planner-full-attribution a" })
  assertNoIssues(issues, `provider attribution links must be at least ${PROVIDER_ATTRIBUTION_MINIMUM.width}x${PROVIDER_ATTRIBUTION_MINIMUM.height}px and reachable`)
}

function scrollInteractionForPage(page: Page): ScrollInteraction {
  return scrollInteractionForEngine(page.context().browser()?.browserType().name() ?? "")
}

async function scrollOwnerWithSupportedInput(page: Page, owner: Locator, interaction: ScrollInteraction): Promise<void> {
  if (interaction === "wheel") {
    const box = await owner.boundingBox()
    if (!box || box.width <= 0 || box.height <= 0) throw new Error("scroll owner has no hit-testable box")
    const maximum = await owner.evaluate((element) => {
      if (!(element instanceof HTMLElement)) return 0
      return Math.max(0, element.scrollHeight - element.clientHeight)
    })
    if (maximum <= 1) throw new Error("scroll owner has no scrollable extent")
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, box.height - 2))
    await page.mouse.wheel(0, 640)
    return
  }
  await owner.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return
    const maximum = Math.max(0, element.scrollHeight - element.clientHeight)
    // This is explicitly the WebKit programmatic-owner contract. Playwright's
    // public touchscreen API has tap only, and mobile WebKit has no wheel API.
    element.scrollTop = Math.min(640, maximum)
  })
}

export async function scrollExplicitOwner(page: Page, selector: string): Promise<ScrollInteraction> {
  if (!selector.trim()) throw new Error("scroll owner selector must not be empty")
  const owner = page.locator(selector).first()
  await expect(owner, `expected scroll owner ${selector}`).toBeVisible()
  const interaction = scrollInteractionForPage(page)
  const before = await owner.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return 0
    element.scrollTop = 0
    return element.scrollTop
  })
  await scrollOwnerWithSupportedInput(page, owner, interaction)
  await expect.poll(
    () => owner.evaluate((element) => element instanceof HTMLElement ? element.scrollTop : 0),
    { message: `${selector} must respond to ${interaction === "wheel" ? "wheel input" : "programmatic scroll-owner control"}` },
  ).toBeGreaterThan(before)
  return interaction
}

export async function scrollOwnerToEnd(page: Page, selector: string): Promise<void> {
  if (!selector.trim()) throw new Error("scroll owner selector must not be empty")
  const owner = page.locator(selector).first()
  await expect(owner, `expected scroll owner ${selector}`).toBeVisible()
  await owner.evaluate((element) => {
    if (element instanceof HTMLElement) element.scrollTop = element.scrollHeight
  })
}

export async function expectRealScrollOwner(page: Page, selector: string): Promise<void> {
  if (!selector.trim()) throw new Error("scroll owner selector must not be empty")
  const owner = page.locator(selector).first()
  await expect(owner, `expected scroll owner ${selector}`).toBeVisible()
  const movement = await owner.evaluate((element) => {
    const scrollable = element instanceof HTMLElement ? element : null
    if (!scrollable) return { overflow: false, before: 0, after: 0, maximum: 0 }
    const maximum = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight)
    scrollable.scrollTop = 0
    return { overflow: maximum > 1, before: 0, after: 0, maximum }
  })
  if (!movement.overflow) return
  await scrollExplicitOwner(page, selector)
  await scrollOwnerToEnd(page, selector)
  const atEnd = await owner.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return false
    return element.scrollTop >= element.scrollHeight - element.clientHeight - 1
  })
  expect(atEnd, `${selector} must reach its scroll extent`).toBe(true)
}

export async function expectFixedAndStickyContainment(page: Page): Promise<void> {
  const issues = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const problems: string[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const position = getComputedStyle(element).position
      if (position !== "fixed" && position !== "sticky") continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.left < -1 || rect.top < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1) problems.push(`${position} ${element.tagName.toLowerCase()} leaves viewport`)
    }
    return problems
  })
  assertNoIssues(issues, "fixed and sticky UI must stay within the visual viewport")
}

export async function expectViewportFitAndSafeAreaContainment(page: Page): Promise<void> {
  const viewportFit = await page.evaluate(() => {
    const content = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ?? ""
    return /(?:^|,)\s*viewport-fit\s*=\s*cover\s*(?:,|$)/.test(content)
  })
  expect(viewportFit, "viewport metadata must opt into viewport-fit=cover").toBe(true)
  await expectFixedAndStickyContainment(page)
}

export async function expectSheetsAndModalsInsideVisualViewport(page: Page): Promise<void> {
  const issues = await page.evaluate(() => {
    const viewport: Viewport = { width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight }
    const problems: string[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("dialog,[role=dialog],[class*='sheet'],[class*='modal']"))) {
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden") continue
      const rect = element.getBoundingClientRect()
      if (rect.left < -1 || rect.top < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1) problems.push(`${element.tagName.toLowerCase()} leaves visual viewport`)
    }
    return problems
  })
  assertNoIssues(issues, "sheets and modals must be contained by the visual viewport")
}

export async function expectNavigationReachability(page: Page): Promise<void> {
  const issues = await page.evaluate((selector) => {
    const problems: string[] = []
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.left < -1 || rect.top < -1 || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1) problems.push(`${element.tagName.toLowerCase()} navigation control leaves viewport`)
    }
    return problems
  }, "nav a,nav button,[role=navigation] a,[role=navigation] button")
  assertNoIssues(issues, "navigation controls must be reachable in the viewport")
}

export interface MobileQaRuntimeIssues {
  readonly consoleErrors: readonly string[]
  readonly failedRequests: readonly string[]
  readonly dispose: () => void
}

export interface RuntimeIssueOptions {
  readonly ignoreRequest?: (request: Request) => boolean
  readonly ignoreResponse?: (response: Response) => boolean
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
    .filter((failure) => !isExpectedProviderHealthAbort(failure) && !options.ignore?.(failure))
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
