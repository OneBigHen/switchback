import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const routeStyles = readFileSync(resolve(process.cwd(), "src/app/styles/route-comparison.css"), "utf8")
const dockStyles = readFileSync(resolve(process.cwd(), "src/app/styles/planner-action-dock.css"), "utf8")
const routeComparisonSource = readFileSync(resolve(process.cwd(), "src/components/planner/RouteComparison.tsx"), "utf8")
const sheetStyles = readFileSync(resolve(process.cwd(), "src/app/styles/planner-deck.css"), "utf8")

describe("route sheet geometry contract", () => {
  it("keeps full-sheet attribution in its own safe band outside scroll content", () => {
    expect(routeStyles).toContain(".planner-shell .sb-bottom-sheet[data-sheet-detent=\"full\"] .planner-full-attribution")
    expect(routeStyles).toContain("top: auto !important")
    expect(routeStyles).toContain("bottom: calc(var(--sb-sheet-dock-home-height) + var(--sb-space-5)) !important")
    const designSystemStyles = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")
    expect(designSystemStyles).toContain(".planner-shell .sb-bottom-sheet[data-sheet-detent=\"full\"] .planner-full-attribution {\n    position: static !important;")
  })

  it("reserves the real home dock height on the parent scroll container", () => {
    expect(dockStyles).toContain(".planner-deck:has(> .planner-action-dock):not(:has(.dock-ride-button))")
    expect(dockStyles).toContain("--sb-route-dock-clearance: calc(var(--sb-sheet-dock-home-height) + var(--sb-space-6))")
    expect(dockStyles).toContain(".planner-deck:not(.is-minimized):has(> .planner-action-dock) .planner-scroll")
    expect(dockStyles).toContain("height: calc(100% - var(--sb-route-dock-clearance)) !important")
  })

  it("reserves the real expanded dock height when route actions are present", () => {
    expect(dockStyles).toContain(".planner-deck:has(> .planner-action-dock .dock-ride-button):not(.is-minimized)")
    expect(dockStyles).toContain("--sb-route-dock-clearance: calc(var(--sb-sheet-dock-expanded-height) + var(--sb-space-4))")
    expect(dockStyles).not.toContain(".planner-deck.has-expanded-route-dock:not(.is-minimized)")
    expect(dockStyles).not.toContain("--sb-route-dock-clearance: calc(var(--sb-sheet-dock-height)")
  })

  it("adds attribution clearance to the mobile full-detent scroll viewport", () => {
    expect(routeStyles).not.toContain(".planner-shell .sb-bottom-sheet[data-sheet-detent=\"full\"] .planner-scroll")
    expect(routeStyles).not.toContain("height: calc(100% - var(--sb-sheet-dock-home-height) - var(--sb-space-10)) !important")
    expect(routeStyles).toContain("@media (max-width: 760px) and (orientation: landscape) and (max-height: 520px)")
    expect(routeStyles).toContain("bottom: calc(var(--sb-sheet-dock-home-height) + var(--sb-space-2)) !important")
  })

  it("keeps the dock in the sheet flow and gives Prepare one scroll owner", () => {
    const designSystemStyles = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")

    expect(designSystemStyles).toContain("@media (max-width: 760px)")
    expect(designSystemStyles).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock:not(:empty)) {\n    display: flex;\n    flex-direction: column;")
    expect(designSystemStyles).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock:not(:empty)) .planner-scroll {\n    flex: 1 1 0%;\n    min-height: 0;\n    height: auto !important;")
    expect(designSystemStyles).toContain(".planner-shell .sb-bottom-sheet:has(> .planner-action-dock:not(:empty)) > .planner-action-dock {\n    position: static;")
  })

  it("scrolls the selected card within the one planner scroll owner", () => {
    expect(routeComparisonSource).toContain("const selectedRouteIdentityRef = useRef<HTMLParagraphElement>(null)")
    expect(routeComparisonSource).toContain("selectedRouteIdentityRef.current?.scrollIntoView?.({ block: \"start\", behavior: \"auto\" })")
    expect(routeComparisonSource).toContain("ref={selectedRouteIdentityRef}")
    expect(routeStyles).toContain(".route-rack .route-slip {\n    scroll-margin-block: calc(var(--sb-space-8) + var(--sb-space-5)) var(--sb-space-4);")
    expect(sheetStyles).toContain(".planner-deck.has-expanded-route-dock:not(.is-minimized) .edit-route-button")
    expect(sheetStyles).toContain("position: static")
    expect(sheetStyles).toContain(".planner-deck.has-expanded-route-dock .ride-omnibox-section:empty")
    expect(routeStyles).toContain(".route-rack .route-details-toggle small {\n    line-height: 1.1;")
  })

  it("leaves a visible top clearance when the selected identity is re-anchored", () => {
    expect(routeStyles).toContain(".route-selection-identity {\n  scroll-margin-block-start: var(--sb-space-2);")
  })
})
