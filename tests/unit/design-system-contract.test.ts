import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const designSystem = readFileSync(resolve(process.cwd(), "src/app/styles/design-system.css"), "utf8")

describe("map workspace design system", () => {
  it("keeps the bundled typography, spacing, and touch contracts in one layer", () => {
    expect(designSystem).toContain('--font-display: "Sora Variable"')
    expect(designSystem).toContain('--font-body: "DM Sans Variable"')
    expect(designSystem).toContain("--sb-space-1: 4px")
    expect(designSystem).toContain("--sb-space-2: 8px")
    expect(designSystem).toContain("--sb-touch-target: 44px")
    expect(designSystem).toContain(".sb-map-shell")
    expect(designSystem).toContain(".sb-bottom-sheet")
  })

  it("does not reintroduce the banned generic font layer", () => {
    expect(designSystem).not.toMatch(/Inter|Space Grotesk|Roboto|Arial|system-ui/)
  })
})
