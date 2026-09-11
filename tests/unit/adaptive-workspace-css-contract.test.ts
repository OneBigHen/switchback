import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const adaptive = readFileSync(resolve(process.cwd(), "src/app/styles/adaptive-workspace.css"), "utf8")
const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8")

/**
 * Structural guard for issue #115's first real Medium workspace topology.
 * Behavioral geometry still belongs in tests/e2e/adaptive-workspace.spec.ts;
 * this fast contract prevents the old 761px == desktop-card fallback from
 * quietly becoming the implementation again.
 */
describe("adaptive Medium workspace CSS contract", () => {
  it("gives 761–1180px its own planner topology instead of inheriting the fixed desktop card", () => {
    expect(adaptive).toContain("@media (min-width: 761px) and (max-width: 1180px)")
    expect(adaptive).toContain("--sb-medium-planner-width:")
    expect(adaptive).toContain("--sb-medium-map-safe-left:")
    expect(adaptive).toContain("width: var(--sb-medium-planner-width);")
    expect(adaptive).toContain("left: var(--sb-medium-map-safe-left);")
  })

  it("moves Medium portrait navigation out of the map/planner side-by-side budget", () => {
    expect(adaptive).toContain("@media (min-width: 761px) and (max-width: 1180px) and (orientation: portrait)")
    expect(adaptive).toContain("height: var(--sb-mobile-nav-height);")
    expect(adaptive).toContain("flex-direction: row;")
    expect(adaptive).toContain("bottom: var(--sb-mobile-sheet-bottom);")
  })

  it("loads the adaptive authority after legacy planner and shell styles", () => {
    const adaptiveIndex = layout.indexOf('import "./styles/adaptive-workspace.css"')
    expect(adaptiveIndex).toBeGreaterThan(layout.indexOf('import "./styles/planner-shell.css"'))
    expect(adaptiveIndex).toBeGreaterThan(layout.indexOf('import "./styles/shell-v2.css"'))
    expect(adaptiveIndex).toBeGreaterThan(layout.indexOf('import "./styles/planner-command-surface.css"'))
  })
})
