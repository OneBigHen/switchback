import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const designSystem = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")
const roadLockStyles = readFileSync(resolve(process.cwd(), "src/app/styles/map-stage-road-locks.css"), "utf8")
const plannerDeck = readFileSync(resolve(process.cwd(), "src/components/planner/PlannerDeck.tsx"), "utf8")
const dockStyles = readFileSync(resolve(process.cwd(), "src/app/styles/planner-action-dock.css"), "utf8")
const sheetStyles = readFileSync(resolve(process.cwd(), "src/app/styles/planner-deck.css"), "utf8")
const legacyThemeStyles = readFileSync(resolve(process.cwd(), "src/app/styles/switchback-v1.css"), "utf8")
const omniboxStyles = readFileSync(resolve(process.cwd(), "src/app/styles/ride-omnibox.css"), "utf8")

describe("mobile planner geometry contract", () => {
  it("keeps every planner dock in sheet flow so one scroll owner can clear it", () => {
    expect(designSystem).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock) {")
    expect(designSystem).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock) .planner-scroll {")
    expect(designSystem).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock) > .planner-action-dock {")
    expect(designSystem).toContain("position: static;")
    expect(designSystem).toContain("height: auto !important;")
    expect(designSystem).toContain("padding-block-end: calc(var(--sb-sheet-dock-home-height) + var(--sb-space-4)) !important;")
  })

  it("scopes static dock flow to mobile and leaves clearance ownership to dock CSS", () => {
    const staticFlow = ".planner-shell .sb-bottom-sheet:has(> .planner-action-dock) > .planner-action-dock {\n    position: static;"
    expect(designSystem.match(/position: static;/g) ?? []).toHaveLength(1)
    const staticFlowIndex = designSystem.indexOf(staticFlow)
    expect(staticFlowIndex).toBeGreaterThan(-1)
    expect(designSystem.lastIndexOf("@media (max-width: 760px)", staticFlowIndex)).toBeGreaterThan(-1)
    expect(designSystem).not.toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock .dock-ride-button) > .planner-action-dock")
    expect(designSystem).not.toContain("--sb-route-dock-clearance:")
    expect(dockStyles).toContain("--sb-route-dock-clearance:")
    expect(sheetStyles).not.toContain("--sb-route-dock-clearance:")
    expect(legacyThemeStyles).not.toContain("--sb-route-dock-clearance:")
    expect(dockStyles.match(/^\s*\.planner-action-dock[^{}]*\{[^{}]*--sb-route-dock-clearance:/gms) ?? []).toHaveLength(0)
  })

  it("keeps minimized dock safe-area padding at the shared mobile floor", () => {
    expect(designSystem).toContain(".planner-shell .sb-bottom-sheet.is-minimized .planner-action-dock")
    expect(designSystem).toContain("padding-bottom: max(13px, env(safe-area-inset-bottom))")
  })

  it("keeps the home action dock to two rows on narrow screens", () => {
    expect(designSystem).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock):not(:has(> .planner-action-dock .dock-ride-button)) > .planner-action-dock")
    expect(designSystem).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));")
  })

  it("does not pull the mobile dock back over scroll content", () => {
    expect(sheetStyles).not.toContain(".planner-deck > .planner-action-dock {\n      bottom: -24px;")
  })

  it("keeps quick intents visible in compact landscape", () => {
    expect(designSystem).not.toContain(
      ".planner-shell .sb-bottom-sheet .ride-location-button,\n  .planner-shell .sb-bottom-sheet .ride-quick-intents,\n  .planner-shell .sb-bottom-sheet .ride-recents"
    )
    const quickIntentButtons = omniboxStyles.match(
      /\.ride-quick-intents button,[\s\S]*?\.ride-understanding button\s*\{([^}]*)}/
    )?.[1] ?? ""
    expect(quickIntentButtons).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps the half-sheet home prompt compact and leaves the brand header desktop-only", () => {
    expect(designSystem).toContain(
      ".planner-shell .sb-bottom-sheet .ride-deck-header {\n    display: none;\n  }"
    )
  })

  it("anchors the mobile road-lock control above the live sheet clearance", () => {
    expect(roadLockStyles).toContain(".planner-shell .map-road-lock-toggle")
    expect(roadLockStyles).toContain("bottom: calc(var(--sb-map-sheet-clearance) + var(--sb-space-2));")
  })

  it("moves the duplicate map road-lock control out of an expanded sheet surface", () => {
    expect(designSystem).toContain(
      ".planner-shell:has(.sb-bottom-sheet:not(.is-minimized)) .map-road-lock-toggle {\n    display: none;"
    )
  })

  it("promotes a newly ready route to the full mobile workspace", () => {
    expect(plannerDeck).toContain("function isPhoneViewport(): boolean")
    expect(plannerDeck).toContain('typeof window.matchMedia === "function"')
    expect(plannerDeck).toContain('if (isPhoneViewport()) setSheetDetentOverride("full")')
    expect(plannerDeck).toContain('onClick={() => setSheetDetentOverride(selectedRoute ? "full" : "half")}')
  })
})
