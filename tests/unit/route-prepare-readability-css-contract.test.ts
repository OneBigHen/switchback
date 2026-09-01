import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const routeStyles = readFileSync(resolve(process.cwd(), "src/app/styles/route-comparison.css"), "utf8")
const qualityStyles = readFileSync(resolve(process.cwd(), "src/app/styles/route-data-quality-panel.css"), "utf8")
const dockStyles = readFileSync(resolve(process.cwd(), "src/app/styles/planner-action-dock.css"), "utf8")
const routeDecisionStyles = readFileSync(resolve(process.cwd(), "src/components/planner/v2/RouteDecisionCard.module.css"), "utf8")
const routeShareStyles = readFileSync(resolve(process.cwd(), "src/app/styles/route-share-panel.css"), "utf8")

function lastRule(styles: string, selector: string): string {
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)}/gs)]
    .filter((match) => match[1]?.split(",").some((candidate) => candidate.trim() === selector))
    .filter((match) => match[2]?.includes("font-size"))
    .map((match) => `${match[1]}{${match[2]}}`)
    .at(-1) ?? ""
}

describe("route preparation readability contract", () => {
  it("keeps route cards and preparation form controls on themed surfaces", () => {
    expect(routeDecisionStyles).toContain("background: var(--sb-surface);")
    expect(routeStyles).toContain(".directions-panel")
    expect(routeStyles).toContain("background: var(--sb-surface);")
    expect(routeStyles).toContain(".gpx-export-variant select")
    expect(routeStyles).toContain("background: var(--sb-surface-raised);")
    expect(routeShareStyles).toContain(".route-share-panel > label input")
    expect(routeShareStyles).toContain(".route-share-panel > label textarea")
    expect(routeShareStyles).toContain(".route-share-panel > label select")
    expect(routeShareStyles).toContain("background: var(--sb-surface-raised);")
    expect(dockStyles).toContain(".road-locks-dock-button")
    expect(dockStyles).toContain("background: var(--sb-surface-raised);")
    expect(dockStyles).toContain("color: var(--sb-text);")
  })

  it("uses a shared 14px floor for rider-visible route metadata and explanations", () => {
    expect(routeStyles).toContain("--sb-route-meta-size: 14px")
    expect(routeStyles).toContain("--sb-route-value-size: 15px")

    for (const selector of [
      ".route-slip-index",
      ".route-slip-name small",
      ".route-character > span",
      ".route-slip-metric small",
      ".route-score-explanation",
      ".route-score-explanation strong",
      ".route-score-explanation small",
      ".directions-toggle > span:nth-child(2)",
      ".directions-list .directions-text small",
    ]) {
      expect(lastRule(routeStyles, selector), selector).toContain("font-size: var(--sb-route-meta-size)")
    }

    expect(lastRule(routeStyles, ".route-slip-name .route-slip-tradeoff")).toContain("font-size: var(--sb-route-meta-size)")
    expect(lastRule(routeStyles, ".route-rack .route-details-toggle")).toContain("font-size: var(--sb-route-meta-size)")
    expect(lastRule(routeStyles, ".directions-list .directions-distance")).toContain("font-size: var(--sb-route-value-size)")

    for (const selector of [
      ".route-data-quality-header h3 small",
      ".route-data-quality-seasonal",
      ".route-data-quality-bar-row",
      ".route-data-quality-caveats li",
      ".route-data-quality-clean",
      ".route-data-quality-footer",
      ".route-data-quality-footer small"
    ]) {
      expect(lastRule(qualityStyles, selector), selector).toContain("font-size: var(--sb-route-meta-size)")
    }
  })

  it("keeps the edit affordance clear of the fixed route action dock", () => {
    expect(routeStyles).toContain(".planner-deck.has-expanded-route-dock .edit-route-button")
    expect(routeStyles).toContain("scroll-margin-block-end: calc(var(--sb-sheet-dock-expanded-height) + var(--sb-space-4))")
  })

  it("reserves the expanded dock clearance without relying on a fixed content height", () => {
    expect(dockStyles).not.toContain("--sb-route-dock-clearance: 88px")
    expect(dockStyles).toContain(".planner-deck:has(.directions-list) > .planner-action-dock")
    expect(dockStyles).toContain("--sb-route-dock-clearance: calc(var(--sb-sheet-dock-home-height) + var(--sb-space-6))")
    expect(dockStyles).toContain("--sb-route-dock-clearance: calc(var(--sb-sheet-dock-expanded-height) + var(--sb-space-4))")
    expect(dockStyles).not.toContain("--sb-route-dock-clearance: calc(var(--sb-sheet-dock-height)")
    expect(dockStyles).not.toContain("--sb-route-dock-clearance: 150px")
    expect(dockStyles).not.toContain("--sb-route-dock-clearance: 82px")
    expect(dockStyles).not.toContain("--sb-route-dock-clearance: 156px")
    expect(dockStyles).toContain("padding-block-end: var(--sb-space-4)")
    expect(dockStyles).toContain("scroll-padding-block-end: calc(var(--sb-route-dock-clearance) + var(--sb-space-4))")
    expect(dockStyles).toContain(".planner-deck:not(.is-minimized):has(> .planner-action-dock) .planner-scroll")
    expect(dockStyles).toContain("height: calc(100% - var(--sb-route-dock-clearance))")
  })
})
