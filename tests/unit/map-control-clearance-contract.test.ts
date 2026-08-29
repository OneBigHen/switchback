import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const designSystem = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")

describe("short-landscape map control clearance", () => {
  it("reserves the navigation rail before the scale and attribution stack", () => {
    const landscapeStart = designSystem.indexOf("@media (orientation: landscape) and (max-height: 520px)")
    const landscapeEnd = designSystem.indexOf("\n}\n", landscapeStart)
    const landscape = designSystem.slice(landscapeStart, landscapeEnd + 3)
    const bottomLeft = landscape.match(
      /\.planner-shell \.map-stage:not\(\.is-ride-mode\) \.maplibregl-ctrl-bottom-left\s*\{[^}]*}/s
    )?.[0] ?? ""

    expect(bottomLeft).toContain(
      "left: calc(var(--sb-mobile-edge) + 64px + var(--sb-space-2) + min(420px, 48vw) + var(--sb-space-2))"
    )
  })

  it("adds positive vertical clearance for both home and selected-peek landscape sheets", () => {
    const landscapeStart = designSystem.indexOf("@media (orientation: landscape) and (max-height: 520px)")
    const landscapeEnd = designSystem.indexOf("\n}\n", landscapeStart)
    const landscape = designSystem.slice(landscapeStart, landscapeEnd + 3)
    const bottomLeft = landscape.match(
      /\.planner-shell \.map-stage:not\(\.is-ride-mode\) \.maplibregl-ctrl-bottom-left\s*\{[^}]*}/s
    )?.[0] ?? ""
    const fullHome = landscape.match(
      /\.planner-shell:has\(\.sb-bottom-sheet\[data-sheet-detent="full"\]\) \.map-stage:not\(\.is-ride-mode\) \.maplibregl-ctrl-bottom-left\s*\{[^}]*}/s
    )?.[0] ?? ""

    expect(bottomLeft).toContain("bottom: calc(var(--sb-map-sheet-clearance) - var(--sb-space-10))")
    expect(fullHome).toContain(
      "bottom: calc(var(--sb-map-sheet-clearance) - var(--sb-space-10) - var(--sb-space-10) - var(--sb-space-3))"
    )
  })
})
