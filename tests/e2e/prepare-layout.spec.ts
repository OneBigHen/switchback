import { expect, test } from "@playwright/test"
import {
  expandPhonePlanner,
  expectRouteOutcome,
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
    await page.getByRole("button", { name: /current location/i }).click()
    const finish = page.getByRole("combobox", { name: "Finish", exact: true })
    await finish.fill("Fixture finish")
    await page.getByRole("option", { name: /Fixture finish/i }).click()
    await page.getByRole("button", { name: "Plan route" }).click()
    await expectRouteOutcome(page, capture)
    await page.getByRole("button", { name: "Select Twisty fixture route" }).click()
    await page.getByRole("button", { name: /Show route details/i }).click()
    await expect(page.locator("#route-preparation")).toBeVisible()

    const expectSelectedIdentityInScroll = async (checkpoint: string): Promise<void> => {
      const identityBox = await page.locator(".route-selection-identity").boundingBox()
      const scrollBox = await page.locator(".planner-scroll").boundingBox()
      expect(identityBox, `${checkpoint}: selected route identity must have a box`).not.toBeNull()
      expect(scrollBox, `${checkpoint}: planner scroll must have a box`).not.toBeNull()
      expect(identityBox?.width, `${checkpoint}: selected route identity must be measurable`).toBeGreaterThan(0)
      expect(identityBox?.height, `${checkpoint}: selected route identity must be measurable`).toBeGreaterThan(0)
      const identityTop = identityBox?.y ?? 0
      const identityBottom = identityTop + (identityBox?.height ?? 0)
      const scrollTop = scrollBox?.y ?? 0
      const scrollBottom = scrollTop + (scrollBox?.height ?? 0)
      expect(identityTop, `${checkpoint}: selected route identity must start in the scroll region`).toBeGreaterThanOrEqual(scrollTop - 1)
      expect(identityBottom, `${checkpoint}: selected route identity must end in the scroll region`).toBeLessThanOrEqual(scrollBottom + 1)
    }

    await expectSelectedIdentityInScroll("selection")
    await page.getByRole("button", { name: "Edit route" }).click()
    await expectSelectedIdentityInScroll("edit")
    await page.getByRole("button", { name: "Minimize planner" }).click()
    const compactIdentity = page.locator(".planner-mini-header strong")
    await expect(compactIdentity).toHaveText("Twisty fixture route")
    const compactIdentityBox = await compactIdentity.boundingBox()
    expect(compactIdentityBox, "minimize: selected route identity must have a compact box").not.toBeNull()
    expect(compactIdentityBox?.width, "minimize: selected route identity must be measurable").toBeGreaterThan(0)
    expect(compactIdentityBox?.height, "minimize: selected route identity must be measurable").toBeGreaterThan(0)
    await expect(page.locator(".route-selection-identity")).toHaveCount(0)
    await page.getByRole("button", { name: "Expand planner" }).click()
    await expectSelectedIdentityInScroll("expand")
    await page.getByRole("button", { name: /Show route details/i }).click()
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
