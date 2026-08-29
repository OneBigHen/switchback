import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const designSystem = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")

/**
 * Both renderers ship during the premium migration and they use different
 * control class prefixes, so every control-clearance rule has to name both
 * (ADR 0015). The contract is checked once per prefix.
 */
const CONTROL_PREFIXES = ["maplibregl", "mapboxgl"] as const

function landscapeBlock(): string {
  const start = designSystem.indexOf("@media (orientation: landscape) and (max-height: 520px)")
  const end = designSystem.indexOf("\n}\n", start)
  return designSystem.slice(start, end + 3)
}

/**
 * Matches the declaration block of a rule whose selector list contains
 * `selector`, whichever position it holds in that list.
 */
function ruleFor(block: string, selector: string): string {
  const index = block.indexOf(selector)
  if (index < 0) return ""
  const open = block.indexOf("{", index)
  const close = block.indexOf("}", open)
  return open < 0 || close < 0 ? "" : block.slice(open, close + 1)
}

describe("short-landscape map control clearance", () => {
  it("reserves the navigation rail before the scale and attribution stack", () => {
    const landscape = landscapeBlock()
    for (const prefix of CONTROL_PREFIXES) {
      const bottomLeft = ruleFor(
        landscape,
        `.planner-shell .map-stage:not(.is-ride-mode) .${prefix}-ctrl-bottom-left`
      )
      expect(bottomLeft).toContain(
        "left: calc(var(--sb-mobile-edge) + 64px + var(--sb-space-2) + min(420px, 48vw) + var(--sb-space-2))"
      )
    }
  })

  it("adds positive vertical clearance for both home and selected-peek landscape sheets", () => {
    const landscape = landscapeBlock()
    for (const prefix of CONTROL_PREFIXES) {
      const bottomLeft = ruleFor(
        landscape,
        `.planner-shell .map-stage:not(.is-ride-mode) .${prefix}-ctrl-bottom-left`
      )
      const fullHome = ruleFor(
        landscape,
        `.planner-shell:has(.sb-bottom-sheet[data-sheet-detent="full"]) .map-stage:not(.is-ride-mode) .${prefix}-ctrl-bottom-left`
      )

      expect(bottomLeft).toContain("bottom: calc(var(--sb-map-sheet-clearance) - var(--sb-space-10))")
      expect(fullHome).toContain(
        "bottom: calc(var(--sb-map-sheet-clearance) - var(--sb-space-10) - var(--sb-space-10) - var(--sb-space-3))"
      )
    }
  })
})
