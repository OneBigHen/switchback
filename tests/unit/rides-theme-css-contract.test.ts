import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ridesStyles = readFileSync(resolve(process.cwd(), "src/components/rides/RidesSurface.module.css"), "utf8")

describe("Rides theme CSS contract", () => {
  it("uses theme-aware text for the route kind badge", () => {
    const badgeRule = ridesStyles.match(/\.routeGraphic > small\s*\{([^}]*)\}/)?.[1] ?? ""

    expect(badgeRule).toContain("color: var(--sb-text);")
    expect(badgeRule).not.toContain("color: var(--sb-ink);")
  })
})
