import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Switchback UX V2 — design contract (DESIGN-CONTRACT.md v2.0).
 * The token layer in src/app/styles/tokens.css is the single canonical
 * source for brand color, semantic theme, typography, geometry, and focus
 * values. This test freezes that truth before any surface migrates.
 */

const tokensCss = readFileSync(resolve(process.cwd(), "src/app/styles/tokens.css"), "utf8")
const v2SurfaceCss = [
  "src/components/v2/DestinationHeader.module.css",
  "src/components/v2/RouteGraphic.module.css",
  "src/components/rides/RidesSurface.module.css"
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n")

describe("Switchback V2 design tokens", () => {
  it("declares the canonical brand palette", () => {
    expect(tokensCss).toContain("--sb-ink: #161D1C")
    expect(tokensCss).toContain("--sb-spruce: #243A35")
    expect(tokensCss).toContain("--sb-moss: #65745D")
    expect(tokensCss).toContain("--sb-sage: #9DA98F")
    expect(tokensCss).toContain("--sb-canvas: #F4F0E7")
    expect(tokensCss).toContain("--sb-paper: #FBF9F4")
    expect(tokensCss).toContain("--sb-sandstone: #D8C8B7")
    expect(tokensCss).toContain("--sb-slate: #68716F")
    expect(tokensCss).toContain("--sb-ember: #D65A36")
    expect(tokensCss).toContain("--sb-signal: #397C96")
    expect(tokensCss).toContain("--sb-golden-hour: #C99A46")
    expect(tokensCss).toContain("--sb-trail-brown: #776353")
  })

  it("declares the functional accessibility variants", () => {
    expect(tokensCss).toContain("--sb-ember-strong: #BF4829")
    expect(tokensCss).toContain("--sb-signal-strong: #2A6175")
    expect(tokensCss).toContain("--sb-border-dark: #3B4945")
    expect(tokensCss).toContain("--sb-dark-raised: #1C2825")
  })

  it("binds the bundled Oswald and Inter variable fonts", () => {
    expect(tokensCss).toContain('--font-display: "Oswald Variable"')
    expect(tokensCss).toContain('--font-body: "Inter Variable"')
  })

  it("keeps the light and dark planning themes in the token layer", () => {
    expect(tokensCss).toContain(":root {")
    expect(tokensCss).toContain(':root[data-theme="dark"] {')
  })

  it("keeps the spacing, radius, touch, and focus contracts in the token layer", () => {
    expect(tokensCss).toContain("--sb-space-1: 4px")
    expect(tokensCss).toContain("--sb-space-2: 8px")
    expect(tokensCss).toContain("--sb-space-10: 40px")
    expect(tokensCss).toContain("--sb-touch-target: 44px")
    expect(tokensCss).toContain("--sb-focus-ring: #2A6175")
  })

  it("does not allow a second V2 override layer", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/styles/switchback-v2-overrides.css"))).toBe(false)
    expect(tokensCss).not.toContain("switchback-v2-overrides")
  })

  it("does not load the retired V1 presentation authority", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8")
    expect(layout).not.toContain('import "./styles/switchback-v1.css"')
  })

  it("uses canonical V2 token names on migrated surfaces", () => {
    expect(v2SurfaceCss).not.toMatch(/--sb-(?:deep-spruce|topo-sage|signal-blue)\b/)
  })

  it("uses a motorcycle-route glyph rather than sparkle iconography for Free Ride", () => {
    const freeRideSources = [
      "src/components/planner/PlannerDeck.tsx",
      "src/components/shell/FreeRideHud.tsx"
    ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n")
    expect(freeRideSources).not.toMatch(/\bSparkle\b/)
    expect(freeRideSources).toMatch(/\bRoadHorizon\b/)
  })

  it("keeps globals.css a thin import/reset layer without token definitions", () => {
    const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8")
    expect(globalsCss).toContain("@import")
    expect(globalsCss).not.toContain(":root")
    expect(globalsCss).not.toContain("--sb-ink")
  })

  it("removes the duplicate token authority from design-system.css", () => {
    const designSystem = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")
    expect(designSystem).not.toContain('--font-display: "Sora Variable"')
    expect(designSystem).not.toContain("--sb-canvas:")
    expect(designSystem).not.toContain("--sb-action:")
    expect(designSystem).toContain(".sb-map-shell")
    expect(designSystem).toContain(".sb-bottom-sheet")
  })
})
