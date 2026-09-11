import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const plannerShell = readFileSync(resolve(process.cwd(), "src/app/styles/planner-shell.css"), "utf8")
const shell = readFileSync(resolve(process.cwd(), "src/app/styles/shell-v2.css"), "utf8")

/**
 * Structural guard for issue #115's first real Medium workspace topology.
 * Behavioral geometry still belongs in tests/e2e/adaptive-workspace.spec.ts;
 * this fast contract prevents the old 761px == desktop-card fallback from
 * quietly becoming the implementation again.
 */
describe("adaptive Medium workspace CSS contract", () => {
  it("gives 761–1180px its own planner topology instead of inheriting the fixed desktop card", () => {
    expect(plannerShell).toContain("@media (min-width: 761px) and (max-width: 1180px)")
    expect(plannerShell).toContain("--sb-medium-planner-width:")
    expect(plannerShell).toContain("width: var(--sb-medium-planner-width);")
  })

  it("moves Medium portrait navigation out of the map/planner side-by-side budget", () => {
    expect(shell).toContain("@media (min-width: 761px) and (max-width: 1180px) and (orientation: portrait)")
    expect(shell).toContain("height: var(--sb-mobile-nav-height);")
    expect(shell).toContain("flex-direction: row;")
  })
})
