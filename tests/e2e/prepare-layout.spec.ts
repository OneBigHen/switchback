import { expect, test, type Locator } from "@playwright/test"
import {
  ensureFixtureStart,
  expandPhonePlanner,
  expectRouteOutcome,
  fillFixtureFinish,
  installPlannerServices,
  installRouteApi,
  makeRoute,
  openPlannerEditor,
  tripPlan
} from "./helpers/planner-fixtures"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 }
] as const

for (const viewport of VIEWPORTS) {
  test(`keeps Prepare content in one scroll region at ${viewport.name} width`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await installPlannerServices(page)
    const capture = await installRouteApi(page, tripPlan([
      makeRoute("twisty", { name: "Twisty fixture route" }),
      makeRoute("scenic", { name: "Scenic fixture route", distanceMiles: 9.4, durationMinutes: 21 }),
      makeRoute("quick", { name: "Quick fixture route", distanceMiles: 7.6, durationMinutes: 14 })
    ]))
    await page.goto("/")
    await expandPhonePlanner(page)
    await openPlannerEditor(page)
    // Use the shared fixture helpers rather than an inline copy of them: the
    // start control is labelled "Use current location" only until a start
    // exists, after which it becomes "Change start", and openPlannerEditor may
    // already have set one. The helpers own that branch for every other spec.
    await ensureFixtureStart(page)
    await fillFixtureFinish(page)
    await page.getByRole("button", { name: "Plan route" }).click()
    await expectRouteOutcome(page, capture)
    // Every card in the decision rail offers both "Select <route>" and
    // "Details for <route>", so neither label is unique on its own. Take the
    // first offered route rather than binding to a role assignment that scoring
    // is free to change, then read back the route that card actually named and
    // open details for that same route. `.first()` on the details button would
    // resolve the ambiguity just as quietly while letting selection and details
    // drift onto two different routes, which is precisely the regression the
    // rest of this test exists to catch.
    const chosenOption = page.getByRole("button", { name: /^Select / }).first()
    const chosenLabel = await chosenOption.getAttribute("aria-label")
    const chosenRoute = (chosenLabel ?? "").replace(/^Select /, "")
    expect(chosenRoute, "the decision rail must name the route each card offers").not.toBe("")
    await chosenOption.click()
    await page.getByRole("button", { name: `Details for ${chosenRoute}`, exact: true }).click()
    // Prepare is two disclosures deep, and they are not interchangeable. The
    // card action above swaps the rail for the route details workspace; the
    // toggle below is the one that expands #route-preparation inside it. The
    // rail unmounts once the workspace is open, so this is also the only
    // control that can reopen preparation later in the test.
    const openPreparation = page.getByRole("button", { name: "Show route details", exact: true })
    await openPreparation.click()
    await expect(page.locator("#route-preparation")).toBeVisible()

    // "One scroll region" is a containment claim, not a claim about where the
    // rider happens to be scrolled. Comparing raw bounding boxes conflates the
    // two: content that legitimately lives below the planner's fold reports a
    // box outside the scroller and looks like an escape. So prove the real
    // invariant instead — the identity's nearest scrolling ancestor IS the
    // planner scroll region, and it is not owned by some second scroller — then
    // scroll it into view and prove it lands inside that region rather than
    // being clipped by it.
    const expectOwnedByPlannerScroll = async (target: Locator, what: string, checkpoint: string): Promise<void> => {
      await expect(target, `${checkpoint}: ${what} must be attached`).toBeAttached()

      // Ownership is a structural fact, so test it structurally: the nearest
      // ancestor that *can* scroll must be the planner scroll region. Also
      // requiring that it currently overflows would make the claim depend on
      // how tall the fixture route's content happens to render — a deck that
      // comfortably fits its content reported "the document" and failed for
      // being tidy, which is the opposite of the regression being guarded.
      const ownership = await target.evaluate((element) => {
        for (let node = element.parentElement; node !== null; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (/(auto|scroll|overlay)/.test(style.overflowY)) {
            return { owner: node.className, isPlannerScroll: node.classList.contains("planner-scroll") }
          }
        }
        return { owner: null, isPlannerScroll: false }
      })
      expect(ownership.isPlannerScroll,
        `${checkpoint}: ${what} must be owned by the planner scroll region, not ${ownership.owner ?? "the document"}`)
        .toBe(true)

      await target.scrollIntoViewIfNeeded()
      const targetBox = await target.boundingBox()
      const scrollBox = await page.locator(".planner-scroll").boundingBox()
      expect(targetBox, `${checkpoint}: ${what} must have a box`).not.toBeNull()
      expect(scrollBox, `${checkpoint}: planner scroll must have a box`).not.toBeNull()
      expect(targetBox?.width, `${checkpoint}: ${what} must be measurable`).toBeGreaterThan(0)
      expect(targetBox?.height, `${checkpoint}: ${what} must be measurable`).toBeGreaterThan(0)
      const targetTop = targetBox?.y ?? 0
      const targetBottom = targetTop + (targetBox?.height ?? 0)
      const scrollTop = scrollBox?.y ?? 0
      const scrollBottom = scrollTop + (scrollBox?.height ?? 0)
      expect(targetTop, `${checkpoint}: ${what} must start in the scroll region`).toBeGreaterThanOrEqual(scrollTop - 1)
      expect(targetBottom, `${checkpoint}: ${what} must end in the scroll region`).toBeLessThanOrEqual(scrollBottom + 1)
    }

    const selectedIdentity = page.locator(".route-selection-identity")
    const expectSelectedIdentityInScroll = (checkpoint: string): Promise<void> =>
      expectOwnedByPlannerScroll(selectedIdentity, "selected route identity", checkpoint)

    await expectSelectedIdentityInScroll("selection")
    // "Edit route" was folded into the single V2 disclosure authority; Ride
    // options is the one way back into the editor, and openPlannerEditor owns
    // reaching it on every viewport this test runs at.
    await openPlannerEditor(page)
    // Edit is a whole stage in V2, not a panel beside the results: opening the
    // composer suppresses the stage content, and the route details workspace
    // goes with it. So there is no selected-route identity on screen to
    // contain here, and asserting one would be asserting the retired V1 layout
    // where editor and results shared the deck. The containment claim still
    // holds for what the stage does show, so hold the editor itself to it.
    await expect(selectedIdentity, "edit: the editor replaces the results stage").toBeHidden()
    // Anchor on the start field rather than the whole Ride options panel. The
    // panel is taller than the deck on every viewport here — being scrollable
    // is the point — so only a control that must fit can carry the containment
    // half of this claim, while still proving the editor is served by the one
    // planner scroll region and not a nested second scroller.
    await expectOwnedByPlannerScroll(
      page.getByRole("combobox", { name: "Start", exact: true }), "ride start field", "edit")
    await page.getByRole("button", { name: "Minimize planner" }).click()
    const compactIdentity = page.locator(".planner-mini-header strong")
    await expect(compactIdentity).toHaveText(chosenRoute)
    const compactIdentityBox = await compactIdentity.boundingBox()
    expect(compactIdentityBox, "minimize: selected route identity must have a compact box").not.toBeNull()
    expect(compactIdentityBox?.width, "minimize: selected route identity must be measurable").toBeGreaterThan(0)
    expect(compactIdentityBox?.height, "minimize: selected route identity must be measurable").toBeGreaterThan(0)
    await expect(page.locator(".route-selection-identity")).toHaveCount(0)
    await page.getByRole("button", { name: "Expand planner" }).click()
    await expectSelectedIdentityInScroll("expand")
    await openPreparation.click()
    await expect(page.locator("#route-preparation")).toBeVisible()

    const entry = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>(".planner-deck")
      const scroll = document.querySelector<HTMLElement>(".planner-scroll")
      const dock = document.querySelector<HTMLElement>(".planner-action-dock")
      const identity = document.querySelector<HTMLElement>(".route-selection-identity")
      const heading = identity?.closest<HTMLElement>(".section-heading")
      if (!sheet || !scroll || !dock || !identity || !heading) throw new Error("Prepare layout nodes missing")
      const sheetStyle = getComputedStyle(sheet)
      const scrollStyle = getComputedStyle(scroll)
      const dockStyle = getComputedStyle(dock)
      const sheetBox = sheet.getBoundingClientRect()
      const scrollBox = scroll.getBoundingClientRect()
      const dockBox = dock.getBoundingClientRect()
      const identityBox = identity.getBoundingClientRect()
      return {
        sheetDisplay: sheetStyle.display,
        sheetDirection: sheetStyle.flexDirection,
        scrollParent: scroll.parentElement?.className,
        scrollOverflowY: scrollStyle.overflowY,
        scrollHeight: scrollBox.height,
        dockPosition: dockStyle.position,
        dockInSheet: dock.parentElement === sheet,
        dockTop: dockBox.top,
        scrollBottom: scrollBox.bottom,
        sheetBottom: sheetBox.bottom,
        identityVisible: identityBox.top >= scrollBox.top && identityBox.bottom <= scrollBox.bottom,
        headingPosition: getComputedStyle(heading).position
      }
    })
    if (viewport.width <= 760) {
      expect(entry.sheetDisplay).toBe("flex")
      expect(entry.sheetDirection).toBe("column")
    } else {
      expect(entry.sheetDisplay).toBe("block")
    }
    expect(entry.scrollParent).toContain("planner-deck")
    expect(["auto", "scroll"]).toContain(entry.scrollOverflowY)
    expect(entry.scrollHeight).toBeGreaterThan(0)
    expect(entry.dockInSheet).toBe(true)
    if (viewport.width <= 760) {
      expect(entry.dockPosition).toBe("static")
      expect(entry.dockTop).toBeGreaterThanOrEqual(entry.scrollBottom - 1)
    } else {
      expect(entry.dockPosition).toBe("absolute")
      expect(entry.scrollBottom).toBeLessThanOrEqual(entry.dockTop + 1)
    }
    expect(entry.dockTop).toBeLessThanOrEqual(entry.sheetBottom + 1)
    expect(entry.identityVisible).toBe(true)
    expect(entry.headingPosition).toBe("static")

    await page.locator(".planner-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.locator(".route-data-quality-panel").scrollIntoViewIfNeeded()
    const bottom = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>(".planner-scroll")
      const dock = document.querySelector<HTMLElement>(".planner-action-dock")
      const dataQuality = document.querySelector<HTMLElement>(".route-data-quality-panel")
      const actions = document.querySelector<HTMLElement>(".route-actions")
      if (!scroll || !dock || !dataQuality || !actions) throw new Error("Prepare bottom nodes missing")
      const scrollBox = scroll.getBoundingClientRect()
      const dockBox = dock.getBoundingClientRect()
      const dataQualityBox = dataQuality.getBoundingClientRect()
      const actionButton = actions.querySelector<HTMLElement>("button")
      return {
        dataQualityGap: dockBox.top - dataQualityBox.bottom,
        dataQualityWithinScroll: dataQualityBox.top >= scrollBox.top && dataQualityBox.bottom <= scrollBox.bottom,
        actionsInScrollOwner: actions.closest(".planner-scroll") === scroll,
        actionButtonAttached: actionButton !== null,
        dockWithinViewport: dockBox.top >= -1 && dockBox.bottom <= window.innerHeight + 1
      }
    })
    expect(bottom.dataQualityGap).toBeGreaterThanOrEqual(16)
    expect(bottom.dataQualityWithinScroll).toBe(true)
    expect(bottom.actionsInScrollOwner).toBe(true)
    expect(bottom.actionButtonAttached).toBe(true)
    expect(bottom.dockWithinViewport).toBe(true)
    await page.locator(".route-actions").scrollIntoViewIfNeeded()
    await expect(page.locator(".route-actions button").first()).toBeInViewport()
  })
}
