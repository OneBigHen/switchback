import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const routeStyles = readFileSync(resolve(process.cwd(), "src/app/styles/route-comparison.css"), "utf8")
const routeShareStyles = readFileSync(resolve(process.cwd(), "src/app/styles/route-share-panel.css"), "utf8")
const plannerDeckStyles = readFileSync(resolve(process.cwd(), "src/app/styles/planner-deck.css"), "utf8")

describe("responsive planner layout CSS contract", () => {
  it("keeps the preparation action strip inside its scroll owner", () => {
    const mobileActionRule = routeStyles.match(/@media \(max-width: 760px\) \{[\s\S]*?\.route-actions \{([\s\S]*?)\n\s*}/)?.[1] ?? ""

    expect(mobileActionRule).toContain("position: static")
    expect(mobileActionRule).not.toContain("bottom: -28px")
  })

  it("keeps the route detail toggle at the shared touch target", () => {
    const desktopRule = routeStyles.match(/@media \(min-width: 761px\) \{[\s\S]*?\.route-rack \.route-details-toggle \{([\s\S]*?)\n\s*}/)?.[1] ?? ""

    expect(desktopRule).toContain("min-height: 44px")
  })

  it("keeps community publish actions at the shared touch target", () => {
    const actionRule = routeShareStyles.match(/\.route-share-actions button\s*\{([\s\S]*?)\n}/)?.[1] ?? ""
    const controlRule = routeShareStyles.match(/\.route-share-controls > label\s*\{([\s\S]*?)\n}/)?.[1] ?? ""
    const numberRule = routeShareStyles.match(/\.route-share-controls input\[type="number"\]\s*\{([\s\S]*?)\n}/)?.[1] ?? ""
    const gpxSelectRule = routeStyles.match(/\.gpx-export-variant select\s*\{([\s\S]*?)\n}/)?.[1] ?? ""

    expect(actionRule).toContain("min-height: var(--sb-touch-target)")
    expect(controlRule).toContain("min-height: var(--sb-touch-target)")
    expect(numberRule).toContain("min-height: var(--sb-touch-target)")
    expect(gpxSelectRule).toContain("min-height: var(--sb-touch-target)")
  })

  it("keeps mobile route controls in their scroll owner", () => {
    const editRule = plannerDeckStyles.match(/\.planner-deck:not\(\.is-minimized\) \.edit-route-button\s*\{([\s\S]*?)\n\s*}/)?.[1] ?? ""
    const headingRule = routeStyles.match(/\.route-rack > \.section-heading\s*\{([\s\S]*?)\n\s*}/)?.[1] ?? ""

    expect(editRule).toContain("position: static")
    expect(headingRule).toContain("position: static")
  })
})
